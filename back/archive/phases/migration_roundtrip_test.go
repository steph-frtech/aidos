package phases_test

// Persistence mirror: reflects=dag.stable_phase, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline (which creates the
// dag schema + dag.phase) + the S23 dag_stable_phase migration applied:
//   - dag.stable_phase exists with the content-address CHECK (version = id) — a row whose
//     version ≠ id is REFUSED (a phase IS its own content address);
//   - the migration is EXPAND-ONLY (it adds a new table + index; the S02 dag.phase shape is
//     untouched — no ALTER);
//   - a phase node records its `parent` DAG edge (the §44 temporal axis), NULL for a root;
//   - the wall (CLAUDE.md §2): dag is above the waterline — the agent role has SELECT-only;
//     INSERT/UPDATE/DELETE are REFUSED (the phase node opens no write door for the agent), while
//     the privileged `aidos` writer role may INSERT (the single door, via a ChangeSet).
//
// This is the end-to-end proof the migration applies (AIDOS convention: Testcontainers on
// `go test`, the Atlas Pro `migrate lint` not being available).

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

func startPhasesPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply S02 baseline (creates the dag schema + dag.phase) → S23 stable_phase.
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/dag_stable_phase_baseline.sql",
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

// insertPhase stores a content-addressed phase node via the `aidos` writer role (the single
// door). SET ROLE / INSERT / RESET ROLE are issued as SEPARATE statements: a parameterized
// INSERT cannot be combined with SET ROLE in one prepared multi-command string.
func insertPhase(t *testing.T, pool *pgxpool.Pool, id, body, parent string) error {
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
	var perr error
	if parent == "" {
		_, perr = conn.Exec(ctx,
			`INSERT INTO dag.stable_phase (id, body, version, parent) VALUES ($1, $2::jsonb, $1, NULL)`, id, body)
	} else {
		_, perr = conn.Exec(ctx,
			`INSERT INTO dag.stable_phase (id, body, version, parent) VALUES ($1, $2::jsonb, $1, $3)`, id, body, parent)
	}
	return perr
}

// TestStablePhase_ContentAddressCheck — a row whose version ≠ id is REFUSED: a phase IS its own
// content address (the content-address CHECK).
func TestStablePhase_ContentAddressCheck(t *testing.T) {
	pool := startPhasesPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.stable_phase (id, body, version) VALUES ('hashA', '{"kind":"phase","stable":true}'::jsonb, 'hashB'); RESET ROLE`)
	if err == nil {
		t.Fatalf("a phase whose version ≠ id MUST be refused by the content-address CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestStablePhase_ParentEdgeAppendOnly — a phase records its `parent` DAG edge (§44); a root
// phase has NULL parent; a child records its parent; the writer role appends, never overwrites.
func TestStablePhase_ParentEdgeAppendOnly(t *testing.T) {
	pool := startPhasesPostgres(t)
	ctx := context.Background()

	if err := insertPhase(t, pool, "phase-root", `{"kind":"phase","cut":{},"stable":true,"reasons":[]}`, ""); err != nil {
		t.Fatalf("root phase (NULL parent) must insert: %v", err)
	}
	if err := insertPhase(t, pool, "phase-child", `{"kind":"phase","cut":{"createOrder":"v3"},"stable":true,"reasons":[]}`, "phase-root"); err != nil {
		t.Fatalf("child phase (parent=phase-root) must insert: %v", err)
	}

	var parent *string
	if err := pool.QueryRow(ctx,
		`SELECT parent FROM dag.stable_phase WHERE id = 'phase-child'`).Scan(&parent); err != nil {
		t.Fatalf("select child parent: %v", err)
	}
	if parent == nil || *parent != "phase-root" {
		t.Fatalf("child phase parent edge = %v, want phase-root", parent)
	}

	var rootParent *string
	if err := pool.QueryRow(ctx,
		`SELECT parent FROM dag.stable_phase WHERE id = 'phase-root'`).Scan(&rootParent); err != nil {
		t.Fatalf("select root parent: %v", err)
	}
	if rootParent != nil {
		t.Fatalf("root phase parent edge = %v, want NULL", *rootParent)
	}
}

// TestStablePhase_ExpandOnly_PriorPhaseTableUntouched — the S02 dag.phase shape is unaltered.
func TestStablePhase_ExpandOnly_PriorPhaseTableUntouched(t *testing.T) {
	pool := startPhasesPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`SET ROLE aidos; INSERT INTO dag.phase (id, body, version) VALUES ('p-orig', '{"kind":"phase"}'::jsonb, 'p-orig'); RESET ROLE`); err != nil {
		t.Fatalf("S02 dag.phase must still accept its original shape (expand-only): %v", err)
	}
}

// TestStablePhase_AgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT the
// new table but never INSERT/UPDATE/DELETE — dag.stable_phase opens no write door for the agent.
func TestStablePhase_AgentRoleSelectOnly(t *testing.T) {
	pool := startPhasesPostgres(t)
	ctx := context.Background()

	if err := insertPhase(t, pool, "phase-x", `{"kind":"phase","cut":{},"stable":true,"reasons":[]}`, ""); err != nil {
		t.Fatalf("seed phase via writer role: %v", err)
	}

	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM dag.stable_phase LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on dag.stable_phase must succeed: %v", err)
	}

	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO dag.stable_phase (id, body, version) VALUES ('phase-agent', '{"kind":"phase"}'::jsonb, 'phase-agent'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into dag.stable_phase must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}

	// UPDATE/DELETE are also refused (a phase is immutable, append-only).
	_, errUpd := pool.Exec(ctx,
		`SET ROLE aidos_agent; UPDATE dag.stable_phase SET body = '{}'::jsonb WHERE id = 'phase-x'; RESET ROLE`)
	if errUpd == nil {
		t.Fatalf("agent UPDATE on dag.stable_phase must be refused (a phase is immutable)")
	}
}

// TestStablePhase_WriterRoleCanInsert — the `aidos` writer role IS the single door (it may
// INSERT a phase node, via the ChangeSet flow).
func TestStablePhase_WriterRoleCanInsert(t *testing.T) {
	pool := startPhasesPostgres(t)
	if err := insertPhase(t, pool, "phase-w", `{"kind":"phase","cut":{},"stable":true,"reasons":[]}`, ""); err != nil {
		t.Fatalf("aidos writer role must be able to INSERT a phase node: %v", err)
	}
}
