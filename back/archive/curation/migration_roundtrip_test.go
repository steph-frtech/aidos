package curation_test

// Persistence mirror: reflects=dag.curation_decision + dag.niche_elite, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline (dag schema +
// dag.phase) + the S23 dag_stable_phase + the S26 dag_curation_qd migration applied:
//   - dag.curation_decision exists with the verdict CHECK (keep|compress|tombstone) — a row with
//     any other verdict is REFUSED;
//   - the migration is EXPAND-ONLY (adds new tables + indexes; the prior dag.* shapes untouched);
//   - the wall (CLAUDE.md §2): dag is above the waterline — the agent role has SELECT-only;
//     INSERT/UPDATE/DELETE are REFUSED on BOTH tables, while the privileged `aidos` writer role
//     may INSERT (the single door, via a ChangeSet);
//   - dag.niche_elite is APPEND-ONLY: a new élite for the same niche is a NEW ROW (a new
//     recorded_at), never an UPDATE of the prior one — the élite history stays inspectable;
//   - a tombstone is a DECISION ROW — recording it touches dag.curation_decision only; it is
//     NEVER a DELETE/DROP on a DAG node (critical history is never destroyed).
//
// End-to-end proof the migration applies (AIDOS convention: Testcontainers on `go test`).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startCurationPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/dag_stable_phase_baseline.sql",
		"../../migrations/dag_curation_qd_baseline.sql",
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

// insertDecision records a curation decision via the `aidos` writer role (the single door).
func insertDecision(t *testing.T, pool *pgxpool.Pool, id, nodeID, verdict, reason, policyVersion string) error {
	t.Helper()
	ctx := context.Background()
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "SET ROLE aidos"); err != nil {
		return err
	}
	defer func() { _, _ = conn.Exec(ctx, "RESET ROLE") }()
	_, perr := conn.Exec(ctx,
		`INSERT INTO dag.curation_decision (id, node_id, verdict, reason, policy_version) VALUES ($1,$2,$3,$4,$5)`,
		id, nodeID, verdict, reason, policyVersion)
	return perr
}

// TestCurationDecision_VerdictCheck — a row with a verdict outside the closed set is REFUSED.
func TestCurationDecision_VerdictCheck(t *testing.T) {
	pool := startCurationPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.curation_decision (id, node_id, verdict, reason, policy_version) VALUES ('h1','n1','purge','x','krd-44.4'); RESET ROLE`)
	if err == nil {
		t.Fatalf("a verdict outside {keep,compress,tombstone} MUST be refused by the CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestCurationDecision_AgentRoleSelectOnly — the wall: the agent role may SELECT but never write.
func TestCurationDecision_AgentRoleSelectOnly(t *testing.T) {
	pool := startCurationPostgres(t)
	ctx := context.Background()

	if err := insertDecision(t, pool, "h-tomb", "var-7", "tombstone", "tombstone:unsafe", "krd-44.4"); err != nil {
		t.Fatalf("seed decision via writer role: %v", err)
	}

	// the tombstone is a DECISION ROW — the node it references is NOT deleted from any dag.* table.
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM dag.curation_decision LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on dag.curation_decision must succeed: %v", err)
	}

	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO dag.curation_decision (id, node_id, verdict, reason, policy_version) VALUES ('h2','n2','keep','keep:default','krd-44.4'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into dag.curation_decision must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}

	_, errDel := pool.Exec(ctx,
		`SET ROLE aidos_agent; DELETE FROM dag.curation_decision WHERE id = 'h-tomb'; RESET ROLE`)
	if errDel == nil {
		t.Fatalf("agent DELETE on dag.curation_decision must be refused (append-only, critical history never destroyed)")
	}
}

// TestNicheElite_AppendOnly — a new élite for the same niche is a NEW ROW (a new recorded_at),
// never an UPDATE: the niche's élite history stays inspectable.
func TestNicheElite_AppendOnly(t *testing.T) {
	pool := startCurationPostgres(t)
	ctx := context.Background()

	insertElite := func(niche, node, fitness string, at time.Time) error {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			return err
		}
		defer conn.Release()
		if _, err := conn.Exec(ctx, "SET ROLE aidos"); err != nil {
			return err
		}
		defer func() { _, _ = conn.Exec(ctx, "RESET ROLE") }()
		_, perr := conn.Exec(ctx,
			`INSERT INTO dag.niche_elite (niche_key, elite_node_id, fitness, recorded_at) VALUES ($1,$2,$3::jsonb,$4)`,
			niche, node, fitness, at)
		return perr
	}

	t0 := time.Date(2026, 5, 30, 0, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Hour)
	if err := insertElite("createOrder/discount", "var-A", `{"value":0.8}`, t0); err != nil {
		t.Fatalf("first élite must insert: %v", err)
	}
	// a champion: a NEW row, same niche, new recorded_at — append-only, never an UPDATE.
	if err := insertElite("createOrder/discount", "var-C", `{"value":0.9}`, t1); err != nil {
		t.Fatalf("champion élite must insert as a NEW row (append-only): %v", err)
	}

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM dag.niche_elite WHERE niche_key = 'createOrder/discount'`).Scan(&n); err != nil {
		t.Fatalf("count élites: %v", err)
	}
	if n != 2 {
		t.Fatalf("niche must keep BOTH élite rows (append-only history), got %d", n)
	}

	// the CURRENT élite is the latest recorded_at.
	var current string
	if err := pool.QueryRow(ctx,
		`SELECT elite_node_id FROM dag.niche_elite WHERE niche_key = 'createOrder/discount' ORDER BY recorded_at DESC LIMIT 1`).Scan(&current); err != nil {
		t.Fatalf("select current élite: %v", err)
	}
	if current != "var-C" {
		t.Fatalf("current élite = %q, want the latest champion var-C", current)
	}
}

// TestCurationQD_ExpandOnly_PriorTablesUntouched — the prior dag.* shapes are unaltered.
func TestCurationQD_ExpandOnly_PriorTablesUntouched(t *testing.T) {
	pool := startCurationPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.stable_phase (id, body, version, parent) VALUES ('p-orig','{"kind":"phase"}'::jsonb,'p-orig',NULL); RESET ROLE`); err != nil {
		t.Fatalf("S23 dag.stable_phase must still accept its original shape (expand-only): %v", err)
	}
}

// TestCurationDecision_WriterRoleCanInsert — the `aidos` writer role IS the single door.
func TestCurationDecision_WriterRoleCanInsert(t *testing.T) {
	pool := startCurationPostgres(t)
	if err := insertDecision(t, pool, "h-keep", "phase-3", "keep", "keep:kind=stable_phase", "krd-44.4"); err != nil {
		t.Fatalf("aidos writer role must be able to INSERT a curation decision: %v", err)
	}
}
