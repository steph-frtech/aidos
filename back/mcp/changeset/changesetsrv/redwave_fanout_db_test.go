package changesetsrv

// End-to-end fan-out mirror against REAL Postgres (reflects=mcp.changeset.apply→red_work_queue,
// test_kind=integration, liveness=live). It proves the wired apply handler does not just CALL the
// seam but actually APPENDS rows into runtime.red_work_queue (below the waterline) — and the
// discriminant holds at the DB level: a BLOCKED apply leaves the queue empty.
//
// It reuses the throwaway-Postgres harness (Testcontainers) and wires the server through the SAME
// reusable seam the production gateway uses (redwork.PgRedWorkQueue + redwork.FireRedWave),
// applying the S22 red_work_queue migration on top of the changeset migrations.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/runtime/redwork"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// startServerWithQueue spins up Postgres (changeset + red_work_queue migrations), wires a
// changeset Store AND a real redwork.PgRedWorkQueue, and returns the server fanned-out to the
// queue plus the pool (to read the queue back). This is the production wiring: apply → fan-out →
// enqueue into runtime.red_work_queue.
func startServerWithQueue(t *testing.T) (*server, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(pool.Close)
	for _, f := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/changesets_lifecycle_baseline.sql",
		"../../../migrations/red_work_queue_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}

	st, err := cs.NewStore(ctx, dsn)
	if err != nil {
		t.Fatalf("open changeset store: %v", err)
	}
	t.Cleanup(st.Close)

	q := &redwork.PgRedWorkQueue{Pool: pool}
	fixed := time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC)
	srv := newServer(st, func() time.Time { return fixed }, RedWaveFanOut(q))
	return srv, pool
}

func countQueueRowsForWave(t *testing.T, pool *pgxpool.Pool, waveID string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM runtime.red_work_queue WHERE wave_id = $1`, waveID).Scan(&n); err != nil {
		t.Fatalf("count queue rows: %v", err)
	}
	return n
}

// TestApply_FiresRealRedWorkQueue — a valid apply enqueues a non-empty wave into
// runtime.red_work_queue, content-addressed by the changeset id (the bump's wave_id).
func TestApply_FiresRealRedWorkQueue(t *testing.T) {
	srv, pool := startServerWithQueue(t)
	ctx := context.Background()

	_, opened, err := srv.open(ctx, nil, openInput{
		Label: "add order discount", ParentPhase: "phase-7",
		SpecDelta:   &deltaIO{Kind: "add", Target: "Order"},
		MirrorDelta: &deltaIO{Kind: "add", Target: "Order.schema.fixture"},
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, applied, err := srv.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if applied.Blocked || applied.Status != "APPLIED" {
		t.Fatalf("apply = %+v, want APPLIED unblocked", applied)
	}

	// The wave is enqueued under the changeset id (the bump hash). The exact row count is the
	// pure engine's concern; here we assert the fan-out reached the DB (≥ 1 row, mirror-first).
	if n := countQueueRowsForWave(t, pool, opened.ID); n == 0 {
		t.Fatalf("a valid apply must ENQUEUE the red wave into runtime.red_work_queue, got 0 rows for wave %q", opened.ID)
	}
}

// TestApply_BlockedEnqueuesNothing — the DB-level discriminant: a blocked apply
// (INCOMPLETE_CHANGESET) leaves runtime.red_work_queue empty for that id (no bump ⇒ no rows).
func TestApply_BlockedEnqueuesNothing(t *testing.T) {
	srv, pool := startServerWithQueue(t)
	ctx := context.Background()

	_, opened, err := srv.open(ctx, nil, openInput{
		Label: "spec without mirror", ParentPhase: "phase-7",
		SpecDelta: &deltaIO{Kind: "add", Target: "Order"}, // NO mirror_delta → gate blocks
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, res, err := srv.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !res.Blocked || res.BlockCode != string(cs.CodeIncompleteChangeSet) {
		t.Fatalf("incomplete apply = %+v, want blocked INCOMPLETE_CHANGESET", res)
	}
	if n := countQueueRowsForWave(t, pool, opened.ID); n != 0 {
		t.Fatalf("a BLOCKED apply must enqueue NOTHING, got %d rows for wave %q", n, opened.ID)
	}
}
