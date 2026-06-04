package agentrun_test

// BA26 PERSISTENCE MIRROR (Testcontainers, real Postgres) — the migration-roundtrip +
// replay-coherence + wall mirror, the step's central red set.
//   reflects = runtime.agent_run@v2 (the impl/seed/provider_transcript replay keys + the
//   coherence CHECK + the partial seed/impl indexes) · test_kind = integration · liveness = live.
//
// On a real Postgres with S04 wall_grants + S52 agent_layer + BA26 agentrun_replay baselines:
//   - ROUNDTRIP: a REPLAY-bearing run (impl + seed + provider_transcript inside body JSONB)
//     persists and reads back losslessly; the seed/impl partial indexes resolve a lookup;
//   - LEGACY READABLE (anti-overwrite §9): a SEEDLESS run (none of the three replay keys)
//     persists and reads back with empty replay fields — the schema extension is additive,
//     not a breaking re-shape; the legacy row carries no seed/impl/transcript;
//   - COHERENCE: the agent_run_replay_coherent_chk REFUSES a transcript with no impl+seed
//     (a run with nothing to replay against), and ADMITS a legacy seedless row;
//   - THE WALL (unchanged): the agent role records its OWN runs (INSERT+SELECT) but NEVER
//     UPDATE/DELETE (append-only), and has NO write above the line — a run is below the line.
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

func startAgentRunPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/agent_layer_baseline.sql",
		"../../migrations/agentrun_replay_baseline.sql",
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

// A replay-bearing run body: carries the three BA26 keys inside the JSONB body.
const replayRunBodySQL = `INSERT INTO runtime.agent_run (id, body, result) VALUES (
	$1,
	jsonb_build_object(
		'agent', 'bdd-writer@v1',
		'goal', 'g-checkout',
		'red_work_item', 'redset:checkout.mirror',
		'context_pack', 'pack-checkout',
		'actions', '[]'::jsonb,
		'result', 'still_red',
		'started_at', '2026-06-04T18:00:00Z',
		'ended_at', '2026-06-04T18:05:00Z',
		'impl', $2::text,
		'seed', $3::text,
		'provider_transcript', $4::text
	),
	'still_red')`

// A legacy seedless run body: NONE of the three replay keys.
const legacyRunBodySQL = `INSERT INTO runtime.agent_run (id, body, result) VALUES (
	$1,
	jsonb_build_object(
		'agent', 'bdd-writer@v1',
		'goal', 'g-checkout',
		'red_work_item', 'redset:checkout.mirror',
		'context_pack', 'pack-checkout',
		'actions', '[]'::jsonb,
		'result', 'green',
		'started_at', '2026-06-04T18:00:00Z',
		'ended_at', '2026-06-04T18:05:00Z'
	),
	'green')`

// TestRoundtrip_ReplayRun — a replay-bearing run persists and reads back losslessly; the
// seed/impl partial indexes resolve a lookup BY seed and BY impl.
func TestRoundtrip_ReplayRun(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentRunPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, replayRunBodySQL,
		"run-replay-1", "impl-7f3a", "seed-9b21", "transcript:redacted-ref"); err != nil {
		t.Fatalf("a replay-bearing run MUST persist: %v", err)
	}

	var impl, seed, transcript string
	if err := pool.QueryRow(ctx,
		`SELECT body->>'impl', body->>'seed', body->>'provider_transcript'
		 FROM runtime.agent_run WHERE id='run-replay-1'`).Scan(&impl, &seed, &transcript); err != nil {
		t.Fatalf("read back the replay keys: %v", err)
	}
	if impl != "impl-7f3a" || seed != "seed-9b21" || transcript != "transcript:redacted-ref" {
		t.Fatalf("replay keys must round-trip losslessly, got impl=%q seed=%q transcript=%q",
			impl, seed, transcript)
	}

	// the partial indexes resolve a lookup BY seed and BY impl.
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.agent_run WHERE body->>'seed' = 'seed-9b21'`).Scan(&n); err != nil {
		t.Fatalf("lookup by seed: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 run with seed-9b21, got %d", n)
	}
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.agent_run WHERE body->>'impl' = 'impl-7f3a'`).Scan(&n); err != nil {
		t.Fatalf("lookup by impl: %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 run with impl-7f3a, got %d", n)
	}
}

// TestRoundtrip_LegacySeedlessRun — a legacy seedless run persists and reads back with the
// replay keys ABSENT (additive, not breaking; anti-overwrite §9).
func TestRoundtrip_LegacySeedlessRun(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentRunPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, legacyRunBodySQL, "run-legacy-1"); err != nil {
		t.Fatalf("a legacy seedless run MUST still persist (back-compat): %v", err)
	}

	var hasImpl, hasSeed, hasTranscript bool
	if err := pool.QueryRow(ctx,
		`SELECT body ? 'impl', body ? 'seed', body ? 'provider_transcript'
		 FROM runtime.agent_run WHERE id='run-legacy-1'`).Scan(&hasImpl, &hasSeed, &hasTranscript); err != nil {
		t.Fatalf("read back legacy run: %v", err)
	}
	if hasImpl || hasSeed || hasTranscript {
		t.Fatalf("a legacy run must carry NO replay keys, got impl=%v seed=%v transcript=%v",
			hasImpl, hasSeed, hasTranscript)
	}
	// the legacy row is NOT indexed by seed/impl (the partial indexes skip it) yet is fully
	// readable — its result is still there.
	var result string
	if err := pool.QueryRow(ctx,
		`SELECT body->>'result' FROM runtime.agent_run WHERE id='run-legacy-1'`).Scan(&result); err != nil {
		t.Fatalf("legacy run must be fully readable: %v", err)
	}
	if result != "green" {
		t.Fatalf("legacy run result must read back, got %q", result)
	}
}

// TestReplayCoherenceCheck — the agent_run_replay_coherent_chk refuses a transcript with no
// impl+seed (nothing to replay against), and admits a legacy seedless row.
func TestReplayCoherenceCheck(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentRunPostgres(t)
	ctx := context.Background()

	// a transcript with NO impl/seed is INCOHERENT → refused by the CHECK.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_run (id, body, result) VALUES (
			'run-incoherent',
			jsonb_build_object('agent','a','result','still_red','provider_transcript','tr'),
			'still_red')`); err == nil {
		t.Fatal("a transcript with no impl+seed MUST be refused by agent_run_replay_coherent_chk")
	}
	// a legacy seedless row (none of the three) is coherent → admitted.
	if _, err := pool.Exec(ctx, legacyRunBodySQL, "run-legacy-coherent"); err != nil {
		t.Fatalf("a legacy seedless row MUST pass the coherence CHECK: %v", err)
	}
}

// TestAgentRun_WallHolds — the agent role records its OWN runs (INSERT+SELECT) but NEVER
// UPDATE/DELETE (append-only), and has NO write above the line — a run is below the line.
func TestAgentRun_WallHolds(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentRunPostgres(t)
	ctx := context.Background()

	// the agent records its own run (below the line).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx, replayRunBodySQL,
		"run-agent-insert", "impl-1", "seed-1", "transcript:ref"); err != nil {
		t.Fatalf("the agent MUST INSERT its own run below the line: %v", err)
	}
	// SELECT its own run.
	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.agent_run WHERE id='run-agent-insert'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("the agent MUST SELECT its own run, n=%d err=%v", n, err)
	}
	// the agent CANNOT UPDATE/DELETE (append-only; a run is never altered).
	if _, err := pool.Exec(ctx,
		`UPDATE runtime.agent_run SET result='green' WHERE id='run-agent-insert'`); err == nil {
		t.Fatal("the agent MUST NOT UPDATE a run (append-only — the wall)")
	}
	if _, err := pool.Exec(ctx,
		`DELETE FROM runtime.agent_run WHERE id='run-agent-insert'`); err == nil {
		t.Fatal("the agent MUST NOT DELETE a run (append-only — the wall)")
	}
	// the agent has NO write above the line — a kernel.agent_layer INSERT is refused.
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.agent_layer (id, body, version) VALUES ('l-x','{"kind":"agent"}'::jsonb,'l-x')`); err == nil {
		t.Fatal("the agent MUST NOT write the kernel (the wall above the line)")
	}
}
