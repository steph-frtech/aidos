package adoption_test

// S47 PERSISTENCE MIRROR (Testcontainers, real Postgres):
//   reflects=fitness.release_pack, test_kind=integration, liveness=live.
//
// On a real Postgres with the S02 records baseline (schemas) + the S04 wall_grants
// baseline (fitness SELECT-only to the agent + the aidos_agent/aidos roles) + the S47
// release_pack migration applied:
//   - fitness.release_pack exists, content-addressed by id, body JSONB;
//   - the body-shape CHECK refuses a non-object body (a pack records a real inventory,
//     never a free-form blob);
//   - THE WALL: the agent role SELECTs a pack but INSERT/UPDATE/DELETE are REFUSED
//     (fitness is read-only above the line — only the aidos writer records a pack, via
//     a ChangeSet);
//   - APPEND-ONLY: a non-owner writer with exactly the migration's grants INSERTs, but
//     UPDATE/DELETE are refused — the release history cannot be rewritten.
//
// AIDOS convention: Testcontainers on `go test`; skipped under -short.

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

func startReleasePostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/wall_grants_baseline.sql",
		"../../migrations/release_pack_baseline.sql",
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

const insertPackSQL = `INSERT INTO fitness.release_pack (id, body, assembled_at, kernel_head)
	VALUES ($1, $2::jsonb, now(), 'head-47')`

const packBody = `{"cli_surface":[],"workbench_routes":[],"test_inventory":[],"changelog":[],"known_limits":[],"adoption_plan":{"tiers":[]}}`

// TestPackTableExistsAndShapeChecked — the table exists and the body-shape CHECK
// refuses a non-object body.
func TestPackTableExistsAndShapeChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startReleasePostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertPackSQL, "pack-1", packBody); err != nil {
		t.Fatalf("a well-formed object body must insert (as the aidos superuser): %v", err)
	}
	_, err := pool.Exec(ctx, insertPackSQL, "pack-bad", `[1,2,3]`)
	if err == nil {
		t.Fatalf("a non-object body MUST be refused by the body-shape CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestWall_AgentSelectOnly — the agent SELECTs a pack but INSERT/UPDATE/DELETE are
// refused (fitness is read-only above the line — the wall).
func TestWall_AgentSelectOnly(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startReleasePostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertPackSQL, "pack-seed", packBody); err != nil {
		t.Fatalf("seed pack: %v", err)
	}

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM fitness.release_pack").Scan(&n); err != nil {
		t.Fatalf("the agent must be able to SELECT the release pack: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 seeded pack, got %d", n)
	}
	if _, err := pool.Exec(ctx, insertPackSQL, "pack-agent", packBody); err == nil {
		t.Fatalf("the agent INSERT into fitness MUST be refused — the wall (§2)")
	}
	if _, err := pool.Exec(ctx, "UPDATE fitness.release_pack SET kernel_head = 'x'"); err == nil {
		t.Fatalf("the agent UPDATE on fitness MUST be refused — the wall (§2)")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM fitness.release_pack"); err == nil {
		t.Fatalf("the agent DELETE on fitness MUST be refused — append-only + the wall")
	}
}

// TestAppendOnly_WriterNoUpdateDelete — the pack is APPEND-ONLY: the writer grant is
// INSERT+SELECT, with UPDATE/DELETE/TRUNCATE revoked. Proven on a NON-OWNER role (a
// table owner bypasses GRANT/REVOKE).
func TestAppendOnly_WriterNoUpdateDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startReleasePostgres(t)
	ctx := context.Background()

	for _, stmt := range []string{
		"CREATE ROLE release_writer_test NOLOGIN",
		"GRANT USAGE ON SCHEMA fitness TO release_writer_test",
		"GRANT SELECT, INSERT ON fitness.release_pack TO release_writer_test",
		"REVOKE UPDATE, DELETE, TRUNCATE ON fitness.release_pack FROM release_writer_test",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("setup %q: %v", stmt, err)
		}
	}

	if _, err := pool.Exec(ctx, "SET ROLE release_writer_test"); err != nil {
		t.Fatalf("set role release_writer_test: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx, insertPackSQL, "pack-w1", packBody); err != nil {
		t.Fatalf("the writer must be able to INSERT a pack (via a ChangeSet): %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE fitness.release_pack SET kernel_head = 'x'"); err == nil {
		t.Fatalf("the writer UPDATE MUST be refused — append-only")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM fitness.release_pack"); err == nil {
		t.Fatalf("the writer DELETE MUST be refused — append-only")
	}
}
