package globalinvariant_test

// Persistence mirror: reflects=kernel.global_invariant-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S48
// global-invariant migration applied:
//   - kernel.global_invariant exists as a content-addressed append-only table;
//   - an invariant serialized by SerializeBody round-trips into the body jsonb and reads back
//     identically (content-addressed body ⊇ the §49.1 invariant);
//   - the migration is expand-only (it adds a NEW table; the S02 kernel.truth is untouched);
//   - the three §49.1 enum CHECK constraints reject an out-of-enum scope/blast_radius/
//     approval_required at the DB (defense in depth);
//   - the agent role keeps SELECT-only on kernel.global_invariant (the wall) — INSERT refused.

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startGlobalInvariantPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/kernel_global_invariant_baseline.sql",
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

// TestGlobalInvariantRoundTrips — a serialized invariant round-trips through the body jsonb as
// a content-addressed row (id == version == Hash).
func TestGlobalInvariantRoundTrips(t *testing.T) {
	pool := startGlobalInvariantPostgres(t)
	ctx := context.Background()

	inv := gi.GlobalInvariant{
		Name:             "pii-forgettable-federation",
		Scope:            gi.ScopeFederationPolicy,
		Cells:            []gi.CellRef{"checkout", "profile", "billing"},
		Predicate:        "every_pii_aggregate_implements_forgettable",
		BlastRadius:      gi.BlastRadiusGlobal,
		ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
	body, err := gi.SerializeBody(inv)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindTruth, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.global_invariant (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert global invariant should succeed: %v", err)
	}

	var rawBody string
	if err := pool.QueryRow(ctx,
		"SELECT body::text FROM kernel.global_invariant WHERE id = $1", rec.ID).Scan(&rawBody); err != nil {
		t.Fatalf("select body: %v", err)
	}
	var got struct {
		Inv gi.GlobalInvariant `json:"global_invariant"`
	}
	if err := json.Unmarshal([]byte(rawBody), &got); err != nil {
		t.Fatalf("unmarshal stored body: %v", err)
	}
	if got.Inv.Name != inv.Name || got.Inv.Scope != inv.Scope || got.Inv.BlastRadius != inv.BlastRadius ||
		got.Inv.ApprovalRequired != inv.ApprovalRequired || len(got.Inv.Cells) != len(inv.Cells) {
		t.Fatalf("invariant did not round-trip: got %+v want %+v", got.Inv, inv)
	}
}

// TestEnumCheckRejectsOutOfEnum — the three §49.1 enum CHECK constraints reject an out-of-enum
// scope at the DB (defense in depth alongside globalinvariant.Validate).
func TestEnumCheckRejectsOutOfEnum(t *testing.T) {
	pool := startGlobalInvariantPostgres(t)
	ctx := context.Background()

	badBody := `{"kind":"truth","global_invariant":{"name":"x","scope":"galaxy_policy","cells":["a","b"],"predicate":"p","blast_radius":"global","approval_required":"architecture_owner"}}`
	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.global_invariant (id, body, version) VALUES ('x', $1::jsonb, 'x')`, badBody)
	if err == nil {
		t.Fatalf("an out-of-enum scope must be refused by the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "check") &&
		!strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("out-of-enum INSERT refused for the wrong reason: %v", err)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT
// kernel.global_invariant but never INSERT — truth-writes flow through the aidos CLI writer
// role, not the agent.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startGlobalInvariantPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT id FROM kernel.global_invariant LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.global_invariant must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.global_invariant (id, body, version) VALUES ('y', '{"kind":"truth","global_invariant":{"name":"x","scope":"federation_policy","cells":["a","b"],"predicate":"p","blast_radius":"global","approval_required":"architecture_owner"}}'::jsonb, 'y'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.global_invariant must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
