package scheduler_test

// BA20 PERSISTENCE MIRROR (Testcontainers, real Postgres) — the migration-roundtrip +
// GRANT mirror, the step's central red set.
//   reflects = runtime.red_work_queue (the lease_epoch column + the open→claimed
//   transition) + the NEW aidos_scheduler role · test_kind = integration · liveness = live.
//
// On a real Postgres with S04 wall_grants + S22 red_work_queue + S52 agent_layer +
// BA20 scheduler_role baselines:
//   - runtime.red_work_queue gains a lease_epoch BIGINT NOT NULL DEFAULT 0, epoch>=0 CHECK;
//   - the NEW role aidos_scheduler exists;
//   - THE TRANSITION: aidos_scheduler UPDATEs an item open→claimed (status, owner_agent,
//     lease_until, lease_epoch) — but aidos_agent CANNOT (the agent stays INSERT+SELECT,
//     the wall unchanged);
//   - THE READ-GRANT (gap E4): aidos_scheduler SELECTs kernel.agent_layer (read the
//     CoucheAgent specs for MatchRole);
//   - THE WALL: aidos_scheduler has NO write on any truth schema — INSERT/UPDATE/DELETE
//     on kernel.agent_layer are REFUSED. "scheduler" is NOT a 2nd privileged writer.
//
// AIDOS convention: Testcontainers on `go test`; skipped under -short.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startSchedulerPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/red_work_queue_baseline.sql",
		"../../migrations/agent_layer_baseline.sql",
		"../../migrations/scheduler_role_baseline.sql",
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

const seedItemSQL = `INSERT INTO runtime.red_work_queue
	(item_id, wave_id, target, reason, status, layer)
	VALUES ($1, 'wave-1', $1, 'version_stale', 'open', 'mirror')`

// TestEpochColumn_ExistsWithDefault — lease_epoch exists, BIGINT NOT NULL DEFAULT 0,
// and the epoch>=0 CHECK refuses a negative epoch (the fencing token's shape).
func TestEpochColumn_ExistsWithDefault(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startSchedulerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, seedItemSQL, "i-default"); err != nil {
		t.Fatalf("seed item: %v", err)
	}
	var epoch int64
	if err := pool.QueryRow(ctx,
		`SELECT lease_epoch FROM runtime.red_work_queue WHERE item_id='i-default'`).Scan(&epoch); err != nil {
		t.Fatalf("lease_epoch column must exist: %v", err)
	}
	if epoch != 0 {
		t.Fatalf("lease_epoch must default to 0 (never leased), got %d", epoch)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE runtime.red_work_queue SET lease_epoch = -1 WHERE item_id='i-default'`); err == nil {
		t.Fatal("a negative lease_epoch MUST be refused by the epoch>=0 CHECK")
	}
}

// TestSchedulerRole_Exists — the NEW aidos_scheduler role exists.
func TestSchedulerRole_Exists(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startSchedulerPostgres(t)
	ctx := context.Background()
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM pg_roles WHERE rolname='aidos_scheduler'`).Scan(&n); err != nil {
		t.Fatalf("query pg_roles: %v", err)
	}
	if n != 1 {
		t.Fatal("the NEW aidos_scheduler role MUST exist after BA20")
	}
}

// TestScheduler_ClaimsButAgentCannot — the scheduler role transitions open→claimed
// (status, owner_agent, lease_until, lease_epoch) but the agent role CANNOT (the wall:
// the agent stays INSERT+SELECT, no UPDATE).
func TestScheduler_ClaimsButAgentCannot(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startSchedulerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, seedItemSQL, "i-claim"); err != nil {
		t.Fatalf("seed item: %v", err)
	}

	// the scheduler role claims the item: open→claimed, stamps owner/lease/epoch.
	if _, err := pool.Exec(ctx, "SET ROLE aidos_scheduler"); err != nil {
		t.Fatalf("set role aidos_scheduler: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE runtime.red_work_queue
		 SET status='claimed', owner_agent='bdd-writer@v1',
		     lease_until=now()+interval '5 min', lease_epoch=lease_epoch+1
		 WHERE item_id='i-claim' AND status='open'`); err != nil {
		t.Fatalf("the scheduler MUST be able to transition open→claimed: %v", err)
	}
	if _, err := pool.Exec(ctx, "RESET ROLE"); err != nil {
		t.Fatalf("reset role: %v", err)
	}

	var status string
	var epoch int64
	if err := pool.QueryRow(ctx,
		`SELECT status, lease_epoch FROM runtime.red_work_queue WHERE item_id='i-claim'`).Scan(&status, &epoch); err != nil {
		t.Fatalf("read back: %v", err)
	}
	if status != "claimed" || epoch != 1 {
		t.Fatalf("after a scheduler claim the item must be claimed @epoch 1, got %q @%d", status, epoch)
	}

	// the agent role CANNOT transition — INSERT+SELECT only, no UPDATE (the wall).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")
	if _, err := pool.Exec(ctx,
		`UPDATE runtime.red_work_queue SET status='claimed' WHERE item_id='i-claim'`); err == nil {
		t.Fatal("the agent role MUST NOT be able to transition an item (the wall: INSERT+SELECT only)")
	}
	// the agent CAN still insert its own worklist (S22 posture unchanged).
	if _, err := pool.Exec(ctx, seedItemSQL, "i-agent-insert"); err != nil {
		t.Fatalf("the agent must still INSERT its own worklist below the line: %v", err)
	}
}

// TestScheduler_ReadsAgentLayer — gap E4: the scheduler SELECTs kernel.agent_layer to
// read the CoucheAgent specs for MatchRole.
func TestScheduler_ReadsAgentLayer(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startSchedulerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.agent_layer (id, body, version) VALUES ('l-1', '{"kind":"agent"}'::jsonb, 'l-1')`); err != nil {
		t.Fatalf("seed agent layer: %v", err)
	}

	if _, err := pool.Exec(ctx, "SET ROLE aidos_scheduler"); err != nil {
		t.Fatalf("set role aidos_scheduler: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM kernel.agent_layer`).Scan(&n); err != nil {
		t.Fatalf("the scheduler MUST SELECT kernel.agent_layer for MatchRole (gap E4): %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 seeded layer, got %d", n)
	}
}

// TestScheduler_NoTruthWrite — the asserted boundary: the scheduler is NOT a 2nd
// privileged writer. INSERT/UPDATE/DELETE on kernel.agent_layer are ALL refused.
func TestScheduler_NoTruthWrite(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startSchedulerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.agent_layer (id, body, version) VALUES ('l-seed', '{"kind":"agent"}'::jsonb, 'l-seed')`); err != nil {
		t.Fatalf("seed agent layer: %v", err)
	}

	if _, err := pool.Exec(ctx, "SET ROLE aidos_scheduler"); err != nil {
		t.Fatalf("set role aidos_scheduler: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.agent_layer (id, body, version) VALUES ('l-sched', '{"kind":"agent"}'::jsonb, 'l-sched')`); err == nil {
		t.Fatal("the scheduler INSERT into kernel.agent_layer MUST be refused — scheduler is not a truth writer")
	}
	if _, err := pool.Exec(ctx, `UPDATE kernel.agent_layer SET version='x'`); err == nil {
		t.Fatal("the scheduler UPDATE on kernel.agent_layer MUST be refused — the wall")
	}
	if _, err := pool.Exec(ctx, `DELETE FROM kernel.agent_layer`); err == nil {
		t.Fatal("the scheduler DELETE on kernel.agent_layer MUST be refused — the wall")
	}
}
