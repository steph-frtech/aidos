package main

// Fault-injection mirror for the S22 PostKernelChange hook (CLAUDE.md §5 hook-honesty: a
// hook that never fires is dead — break what it watches, assert it goes red). It proves,
// in-process (the pure FireRedWave engine) and end-to-end (Testcontainers + real Postgres):
//
//   - a real entity bump (Order v1 → v2) FIRES the wave and reddens api/db/types (done part 1);
//   - the wave is ENQUEUED as `open` RedWorkItems with wave_id == the bump hash, mirror first;
//   - a COSMETIC button bump does NOT fire a view item (the negative — §112);
//   - the agent role may INSERT+SELECT runtime.red_work_queue but is DENIED
//     UPDATE/DELETE/TRUNCATE there (append-only worklist below the waterline — ADR 0020);
//   - the wall HOLDS: the agent role is DENIED INSERT into mirrors.mirror.
//
// FAULT INJECTION: TestFaultInjection_WaveMustFire asserts the wave is NON-empty on a real
// bump — if the engine silently stopped firing (the hook went dead), this goes red.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// orderBumpChange is the canonical entity-bump KernelChange (the Fixture A graph): Order
// bumped v1 → v2, its mirror + api/db/types derive from it. The targets are REUSED from the
// pinned example artifacts (S11/S17/S21) — no new target coined.
func orderBumpChange() KernelChange {
	e := func(kind links.Kind, from, to string, layer redwave.Layer) redwave.Edge {
		return redwave.Edge{
			Link:        links.Link{Kind: kind, From: links.Ref{ID: from, Version: "v1"}, To: links.Ref{ID: to, Version: "v1"}},
			LoadBearing: true,
			Layer:       layer,
		}
	}
	return KernelChange{
		Bumped: []string{"Order"},
		Edges: []redwave.Edge{
			e(links.KindMirrors, "Order.schema.fixture", "Order", redwave.LayerMirror),
			e(links.KindDerivesFrom, "api", "Order", redwave.LayerProjection),
			e(links.KindDerivesFrom, "db", "Order", redwave.LayerProjection),
			e(links.KindDerivesFrom, "types", "Order", redwave.LayerProjection),
		},
		Heads:  links.Heads{"Order": "v2"},
		WaveID: "bump-Order-v2",
	}
}

// TestFaultInjection_WaveMustFire — the hook-honesty proof: a real bump MUST fire a non-empty
// wave reddening api/db/types. A dead hook (empty wave on a real bump) goes red here.
func TestFaultInjection_WaveMustFire(t *testing.T) {
	rows := FireRedWave(orderBumpChange())
	if len(rows) == 0 {
		t.Fatalf("HOOK DEAD: a real Order bump must FIRE a non-empty red wave (§42), got 0 items")
	}
	got := map[string]bool{}
	for _, r := range rows {
		got[r.Target] = true
	}
	for _, want := range []string{"Order.schema.fixture", "api", "db", "types"} {
		if !got[want] {
			t.Fatalf("an entity bump must redden %q (done part 1), wave targets = %v", want, got)
		}
	}
	if rows[0].Target != "Order.schema.fixture" {
		t.Fatalf("the wave must START at the mirror (mirror-first), first target = %q", rows[0].Target)
	}
	for _, r := range rows {
		if r.WaveID != "bump-Order-v2" {
			t.Fatalf("every row wave_id must be the bump hash, got %q", r.WaveID)
		}
	}
}

// TestFaultInjection_CosmeticDoesNotFire — the negative: a cosmetic button bump fires no view item.
func TestFaultInjection_CosmeticDoesNotFire(t *testing.T) {
	c := KernelChange{
		Bumped: []string{"label-btn"},
		Edges: []redwave.Edge{{
			Link:        links.Link{Kind: links.KindDerivesFrom, From: links.Ref{ID: "checkout-view", Version: "v1"}, To: links.Ref{ID: "label-btn", Version: "v1"}},
			LoadBearing: false, // cosmetic
			Layer:       redwave.LayerButton,
		}},
		Heads:  links.Heads{"label-btn": "v2"},
		WaveID: "bump-label-btn-v2",
	}
	rows := FireRedWave(c)
	for _, r := range rows {
		if r.Target == "checkout-view" {
			t.Fatalf("a COSMETIC button bump must NOT redden the view, but checkout-view fired: %+v", rows)
		}
	}
}

func startRedWavePostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
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

	for _, mig := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/mirror_runs_baseline.sql",
		"../../migrations/mirror_record_baseline.sql",
		"../../migrations/wall_grants_baseline.sql",
		"../../migrations/red_work_queue_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}

// TestPgRedWorkQueueRoundTrip — the wave fired by the hook is enqueued as `open` rows and read back.
func TestPgRedWorkQueueRoundTrip(t *testing.T) {
	ctx := context.Background()
	pool := startRedWavePostgres(t)

	rows := FireRedWave(orderBumpChange())
	q := &PgRedWorkQueue{Pool: pool}
	if err := q.Enqueue(ctx, rows); err != nil {
		t.Fatalf("enqueue wave: %v", err)
	}

	back, err := q.Wave(ctx, "bump-Order-v2")
	if err != nil {
		t.Fatalf("read wave back: %v", err)
	}
	if len(back) != len(rows) {
		t.Fatalf("expected %d enqueued rows, got %d", len(rows), len(back))
	}
	if back[0].Target != "Order.schema.fixture" {
		t.Fatalf("the first enqueued target must be the mirror, got %q", back[0].Target)
	}

	// Every persisted row must be status='open', owner_agent NULL, lease_until NULL.
	var open, total int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FILTER (WHERE status='open' AND owner_agent IS NULL AND lease_until IS NULL), count(*)
		   FROM runtime.red_work_queue WHERE wave_id='bump-Order-v2'`).Scan(&open, &total); err != nil {
		t.Fatalf("count open rows: %v", err)
	}
	if open != total || total != len(rows) {
		t.Fatalf("all %d rows must be open/unowned/unleased, got %d open of %d", len(rows), open, total)
	}
}

func runAsRole(ctx context.Context, pool *pgxpool.Pool, role, sql string, args ...any) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, sql, args...)
	return err
}

// TestRedWorkQueueAppendOnlyForAgent — the agent may INSERT+SELECT but never mutate the worklist.
func TestRedWorkQueueAppendOnlyForAgent(t *testing.T) {
	ctx := context.Background()
	pool := startRedWavePostgres(t)

	// Seed a row as the owner so UPDATE/DELETE have something to target.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.red_work_queue (item_id, wave_id, target, reason)
		 VALUES ('w0#0','w0','api','version_stale')`); err != nil {
		t.Fatalf("seed row: %v", err)
	}

	// The agent CAN append.
	if err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO runtime.red_work_queue (item_id, wave_id, target, reason)
		 VALUES ('w1#0','w1','db','version_stale')`); err != nil {
		t.Fatalf("agent INSERT into runtime.red_work_queue must be allowed: %v", err)
	}

	destructive := []struct{ name, sql string }{
		{"UPDATE", "UPDATE runtime.red_work_queue SET status='claimed' WHERE wave_id='w0'"},
		{"DELETE", "DELETE FROM runtime.red_work_queue WHERE wave_id='w0'"},
		{"TRUNCATE", "TRUNCATE runtime.red_work_queue"},
	}
	for _, d := range destructive {
		t.Run(d.name, func(t *testing.T) {
			err := runAsRole(ctx, pool, "aidos_agent", d.sql)
			if err == nil {
				t.Fatalf("%s on runtime.red_work_queue must be denied for the agent (the scheduler transitions, not S22)", d.name)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
				t.Fatalf("%s denied for the wrong reason: %v", d.name, err)
			}
		})
	}
}

// TestWallHoldsForRedWave — the wall: the agent cannot write truth (mirrors.mirror) from here.
func TestWallHoldsForRedWave(t *testing.T) {
	ctx := context.Background()
	pool := startRedWavePostgres(t)

	err := runAsRole(ctx, pool, "aidos_agent",
		`INSERT INTO mirrors.mirror (id, body, version) VALUES ('x', '{}'::jsonb, 'v1')`)
	if err == nil {
		t.Fatalf("WALL BREACH: agent INSERT into mirrors.mirror succeeded")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
		t.Fatalf("agent INSERT into mirrors.mirror denied for the wrong reason: %v", err)
	}
}

// TestReasonCheckConstraint — a reason outside the §49.4 closed set violates the CHECK.
func TestReasonCheckConstraint(t *testing.T) {
	ctx := context.Background()
	pool := startRedWavePostgres(t)
	_, err := pool.Exec(ctx,
		`INSERT INTO runtime.red_work_queue (item_id, wave_id, target, reason)
		 VALUES ('wx#0','wx','api','guess')`)
	if err == nil {
		t.Fatalf("a reason outside {version_stale,failed_test,incident} must violate the CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("expected a constraint violation, got: %v", err)
	}
}
