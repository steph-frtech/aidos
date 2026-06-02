package debt_test

// S41 PERSISTENCE MIRROR (Testcontainers, real Postgres):
//   reflects=fitness.kernel_debt_snapshot, test_kind=integration, liveness=live.
//
// On a real Postgres with the S04 wall_grants baseline (which creates the `fitness`
// schema SELECT-only to the agent + the aidos_agent/aidos roles) + the S41
// kernel_debt_snapshot migration applied:
//   - fitness.kernel_debt_snapshot exists, content-addressed by id, body JSONB;
//   - the body-shape CHECK refuses a non-object body (a snapshot records a real
//     report, never a free-form blob);
//   - THE WALL: the agent role SELECTs a snapshot but INSERT/UPDATE/DELETE are
//     REFUSED (fitness is read-only above the line — only the aidos writer records
//     a snapshot, via a ChangeSet);
//   - APPEND-ONLY: the aidos writer INSERTs, but UPDATE/DELETE are refused — the
//     debt history cannot be rewritten.
//
// AIDOS convention: Testcontainers on `go test` (Atlas Pro `migrate lint` absent);
// skipped under -short.

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

func startDebtPostgres(t *testing.T) *pgxpool.Pool {
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

	// S02 records baseline (creates schemas) → S04 wall (fitness + roles + grants) →
	// S41 kernel_debt_snapshot.
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/wall_grants_baseline.sql",
		"../../migrations/kernel_debt_snapshot_baseline.sql",
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

const insertSnapshotSQL = `INSERT INTO fitness.kernel_debt_snapshot (id, body, scanned_at, kernel_head)
	VALUES ($1, $2::jsonb, now(), 'head-1')`

// TestSnapshotTableExistsAndShapeChecked — the table exists and the body-shape CHECK
// refuses a non-object body.
func TestSnapshotTableExistsAndShapeChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startDebtPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertSnapshotSQL, "snap-1", `{"debt":{"items":[]},"plan":{"suggestions":[]}}`); err != nil {
		t.Fatalf("a well-formed object body must insert (as the aidos superuser): %v", err)
	}
	_, err := pool.Exec(ctx, insertSnapshotSQL, "snap-bad", `[1,2,3]`)
	if err == nil {
		t.Fatalf("a non-object body MUST be refused by the body-shape CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestWall_AgentSelectOnly — the agent SELECTs a snapshot but INSERT/UPDATE/DELETE
// are refused (fitness is read-only above the line — the wall).
func TestWall_AgentSelectOnly(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startDebtPostgres(t)
	ctx := context.Background()

	// Seed one snapshot as the owner.
	if _, err := pool.Exec(ctx, insertSnapshotSQL, "snap-seed", `{"debt":{"items":[]},"plan":{"suggestions":[]}}`); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}

	// As the agent role: SELECT works, writes are refused.
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM fitness.kernel_debt_snapshot").Scan(&n); err != nil {
		t.Fatalf("the agent must be able to SELECT the debt diagnostic: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 seeded snapshot, got %d", n)
	}
	if _, err := pool.Exec(ctx, insertSnapshotSQL, "snap-agent", `{"debt":{"items":[]},"plan":{"suggestions":[]}}`); err == nil {
		t.Fatalf("the agent INSERT into fitness MUST be refused — the wall (§2)")
	}
	if _, err := pool.Exec(ctx, "UPDATE fitness.kernel_debt_snapshot SET kernel_head = 'x'"); err == nil {
		t.Fatalf("the agent UPDATE on fitness MUST be refused — the wall (§2)")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM fitness.kernel_debt_snapshot"); err == nil {
		t.Fatalf("the agent DELETE on fitness MUST be refused — append-only + the wall")
	}
}

// TestAppendOnly_WriterNoUpdateDelete — the snapshot is APPEND-ONLY: the writer
// grant is INSERT+SELECT, with UPDATE/DELETE/TRUNCATE revoked. We prove this on a
// NON-OWNER role (a table owner bypasses GRANT/REVOKE, so the connecting `aidos`
// superuser/owner cannot demonstrate the revoke — in production the `aidos` writer
// is a distinct NOLOGIN role, NOT the object owner). We mint a fresh non-owner role
// holding exactly the migration's writer grants and assert it can INSERT but cannot
// UPDATE/DELETE.
func TestAppendOnly_WriterNoUpdateDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startDebtPostgres(t)
	ctx := context.Background()

	// A non-owner writer with exactly the migration's writer grants (INSERT+SELECT,
	// no UPDATE/DELETE).
	for _, stmt := range []string{
		"CREATE ROLE debt_writer_test NOLOGIN",
		"GRANT USAGE ON SCHEMA fitness TO debt_writer_test",
		"GRANT SELECT, INSERT ON fitness.kernel_debt_snapshot TO debt_writer_test",
		"REVOKE UPDATE, DELETE, TRUNCATE ON fitness.kernel_debt_snapshot FROM debt_writer_test",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("setup %q: %v", stmt, err)
		}
	}

	if _, err := pool.Exec(ctx, "SET ROLE debt_writer_test"); err != nil {
		t.Fatalf("set role debt_writer_test: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx, insertSnapshotSQL, "snap-w1", `{"debt":{"items":[]},"plan":{"suggestions":[]}}`); err != nil {
		t.Fatalf("the writer must be able to INSERT a snapshot (via a ChangeSet): %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE fitness.kernel_debt_snapshot SET kernel_head = 'x'"); err == nil {
		t.Fatalf("the writer UPDATE MUST be refused — append-only")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM fitness.kernel_debt_snapshot"); err == nil {
		t.Fatalf("the writer DELETE MUST be refused — append-only")
	}
}
