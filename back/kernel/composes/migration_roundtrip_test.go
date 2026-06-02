package composes_test

// Persistence mirror: reflects=kernel.composes-migration, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S17 kernel.link
// migration + the S18 kernel.composes migration applied:
//   - kernel.layer_activation exists (the DECLARED per-composite activation_threshold table) and
//     kernel.composes_edge exists as a VIEW over composes link bodies;
//   - a composes link serialized by SerializeComposesBody round-trips into a kernel.link body and
//     surfaces through the composes_edge view with its declared weight intact;
//   - the migration is EXPAND-ONLY (it adds a new table + a view; the S02 kernel.layer and the
//     S17 kernel.link tables are untouched — no ALTER);
//   - the wall holds: the agent role keeps SELECT-only on kernel.layer_activation (INSERT refused)
//     and the new table opens NO write door.
//
// This is the end-to-end proof the migration applies (the AIDOS convention proves migrations via
// Testcontainers on `go test`, the Atlas Pro `migrate lint` not being available).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/composes"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startComposesPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply the S02 baseline, the S17 link migration, then the S18 composes migration (expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_link_baseline.sql",
		"../../migrations/kernel_composes_baseline.sql",
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

// TestComposesEdgeRoundTrips — a composes link round-trips through the kernel.link body and
// surfaces through the kernel.composes_edge view with its declared weight intact.
func TestComposesEdgeRoundTrips(t *testing.T) {
	pool := startComposesPostgres(t)
	ctx := context.Background()

	edge := composes.Composes{
		Parent: composes.Ref{ID: "checkout-journey", Version: "v1"},
		Child:  composes.Ref{ID: "checkout-view", Version: "v2"},
		Weight: composes.WeightLoadBearing,
	}
	body, err := composes.SerializeComposesBody(edge)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindLink, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}
	if rec.ID != rec.Version {
		t.Fatalf("content-address: id (%q) must equal version (%q)", rec.ID, rec.Version)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.link (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert composes link should succeed: %v", err)
	}

	var linkKind, weight, parentID, childID string
	if err := pool.QueryRow(ctx,
		`SELECT link_kind, weight, parent ->> 'id', child ->> 'id'
		   FROM kernel.composes_edge WHERE link_id = $1`, rec.ID).
		Scan(&linkKind, &weight, &parentID, &childID); err != nil {
		t.Fatalf("select from composes_edge view: %v", err)
	}
	if linkKind != "composes" || weight != string(composes.WeightLoadBearing) ||
		parentID != edge.Parent.ID || childID != edge.Child.ID {
		t.Fatalf("composes edge did not round-trip: kind=%q weight=%q parent=%q child=%q",
			linkKind, weight, parentID, childID)
	}
}

// TestActivationThresholdTable — the DECLARED per-composite activation_threshold persists in
// kernel.layer_activation and reads back exactly (declared, never learned).
func TestActivationThresholdTable(t *testing.T) {
	pool := startComposesPostgres(t)
	ctx := context.Background()

	// The activation threshold is a side declared-truth fact (not a kernel.layer record), so it is
	// content-addressed directly via the S02 canonicalize+hash — REUSED, not forked.
	body := []byte(`{"kind":"layer_activation","layer_id":"checkout-journey","layer_version":"v1","activation_threshold":1}`)
	canon, err := records.Canonicalize(body)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	id := records.Hash(canon)
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer_activation (id, layer_id, layer_version, activation_threshold, body, version)
		 VALUES ($1, 'checkout-journey', 'v1', 1, $2::jsonb, $3)`,
		id, string(canon), id,
	); err != nil {
		t.Fatalf("insert activation threshold should succeed: %v", err)
	}

	var thr float64
	if err := pool.QueryRow(ctx,
		`SELECT activation_threshold FROM kernel.layer_activation WHERE layer_id = 'checkout-journey'`).
		Scan(&thr); err != nil {
		t.Fatalf("select threshold: %v", err)
	}
	if thr != 1.0 {
		t.Fatalf("declared activation_threshold must read back as 1.0, got %v", thr)
	}
}

// TestExpandOnly_PriorTablesUntouched — the S02 kernel.layer and the S17 kernel.link tables are
// unaltered by the S18 migration (expand-only: a fresh INSERT into each prior table still works
// with its original column set — no column was added or dropped).
func TestExpandOnly_PriorTablesUntouched(t *testing.T) {
	pool := startComposesPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer (id, body, version) VALUES ('L1', '{"kind":"layer"}'::jsonb, 'L1')`); err != nil {
		t.Fatalf("S02 kernel.layer must still accept its original shape (expand-only): %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.link (id, body, version) VALUES ('K1', '{"kind":"link"}'::jsonb, 'K1')`); err != nil {
		t.Fatalf("S17 kernel.link must still accept its original shape (expand-only): %v", err)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT
// kernel.layer_activation + the composes_edge view but never INSERT — the new declared-truth
// table opens no write door.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startComposesPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM kernel.layer_activation LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.layer_activation must succeed: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT link_id FROM kernel.composes_edge LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.composes_edge view must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.layer_activation (id, layer_id, layer_version, activation_threshold, body, version)
		 VALUES ('x', 'l', 'v', 1, '{}'::jsonb, 'x'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.layer_activation must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
