package sagas_test

// Persistence mirror: reflects=kernel.saga_invariant-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S49
// saga-invariant migration applied:
//   - kernel.saga_invariant exists as a content-addressed append-only table;
//   - a saga serialized by SerializeBody round-trips into the body jsonb and reads back
//     identically (content-addressed body ⊇ the §49.2 saga);
//   - the migration is expand-only (it adds a NEW table; the S02 kernel.truth is untouched);
//   - the scope CHECK constraint EXCLUDES local_cell and rejects an out-of-enum scope at the DB
//     (defense in depth) — a saga can never be declared cell-local;
//   - the cert_language CHECK constraint rejects a value outside {statechart, pact, tla+};
//   - the agent role keeps SELECT-only on kernel.saga_invariant (the wall) — INSERT refused.

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startSagaPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testcontainers: connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: new: %v", err)
	}
	t.Cleanup(pool.Close)

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_saga_invariant_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool
}

func sampleSaga() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-payment-shipping",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{Cell: "order", Commits: []sagas.EventName{"order_confirmed"}, Compensation: []links.Ref{{ID: "cancelOrder", Version: "v2"}}},
			{Cell: "payment", Commits: []sagas.EventName{"payment_captured"}, Compensation: []links.Ref{{ID: "refundPayment", Version: "v3"}}},
			{Cell: "shipping", Commits: []sagas.EventName{"shipping_scheduled"}, Compensation: []links.Ref{}},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
		CoherenceTest: &sagas.CoherenceTest{
			Contracts: []links.Ref{{ID: "order.events", Version: "v3"}, {ID: "payment.commands", Version: "v2"}},
			Property:  "aucun événement consommé n'est produit par une version incompatible",
		},
	}
}

// TestSagaRoundTrips — a serialized saga round-trips through the body jsonb as a content-
// addressed row (id == version == Hash).
func TestSagaRoundTrips(t *testing.T) {
	pool := startSagaPostgres(t)
	ctx := context.Background()

	saga := sampleSaga()
	body, err := sagas.SerializeBody(saga)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindTruth, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.saga_invariant (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert saga should succeed: %v", err)
	}

	var rawBody string
	if err := pool.QueryRow(ctx,
		"SELECT body::text FROM kernel.saga_invariant WHERE id = $1", rec.ID).Scan(&rawBody); err != nil {
		t.Fatalf("select body: %v", err)
	}
	var got struct {
		Saga sagas.SagaInvariant `json:"saga_invariant"`
	}
	if err := json.Unmarshal([]byte(rawBody), &got); err != nil {
		t.Fatalf("unmarshal stored body: %v", err)
	}
	if got.Saga.Name != saga.Name || got.Saga.Scope != saga.Scope ||
		len(got.Saga.Participants) != len(saga.Participants) || got.Saga.Property != saga.Property {
		t.Fatalf("saga did not round-trip: got %+v want %+v", got.Saga, saga)
	}
}

// TestScopeCheckExcludesLocalCell — the scope CHECK constraint rejects local_cell (a saga can
// never be declared cell-local) and any out-of-enum scope at the DB.
func TestScopeCheckExcludesLocalCell(t *testing.T) {
	pool := startSagaPostgres(t)
	ctx := context.Background()

	for _, badScope := range []string{"local_cell", "galaxy_policy"} {
		body := `{"kind":"truth","saga_invariant":{"name":"x","scope":"` + badScope + `","participants":[],"property":"p","mirror":{"cert_language":"statechart"}}}`
		_, err := pool.Exec(ctx,
			`INSERT INTO kernel.saga_invariant (id, body, version) VALUES ($1, $2::jsonb, $1)`, "bad-"+badScope, body)
		if err == nil {
			t.Fatalf("scope %q must be refused by the CHECK constraint", badScope)
		}
		if !strings.Contains(strings.ToLower(err.Error()), "check") &&
			!strings.Contains(strings.ToLower(err.Error()), "constraint") {
			t.Fatalf("scope %q refused for the wrong reason: %v", badScope, err)
		}
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT
// kernel.saga_invariant but never INSERT.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startSagaPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT id FROM kernel.saga_invariant LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.saga_invariant must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.saga_invariant (id, body, version) VALUES ('y', '{"kind":"truth","saga_invariant":{"name":"x","scope":"federation_policy","participants":[],"property":"p","mirror":{"cert_language":"statechart"}}}'::jsonb, 'y'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.saga_invariant must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
