package main

// DB-level mirror (Testcontainers + real Postgres) for the ADR 0081 PgGoalCheckSource —
// the SELECT-only Postgres goal-check source that closes the "MutationRunner branché dans
// le chemin de Stop" gap. mirror record: reflects=hooks.stop.pg-goal-source,
// test_kind=property, cert_language=testcontainers, liveness=alive, authority=below.
//
// Proves, against a throwaway real Postgres with the S22/S29/S40/S12 + mirror_runs
// baselines, that the source reads the live four-part stop input and the pure S29 engine
// (goal.CloseBlockReason) grades it correctly:
//   - NO open goal ⇒ hasGoal=false (the no-op contract, identical to NoGoalSource);
//   - an OPEN goal with every red-set mirror GREEN ∧ prior intact ∧ mutation ≥ floor ∧ no
//     monster ⇒ closeable (no BlockReason — the gate is passable);
//   - a still-RED red-set mirror ⇒ BLOCK (GOAL_STILL_RED);
//   - a green→red REGRESSION on a prior truth ⇒ BLOCK (prior green broken, §8);
//   - mutation BELOW the floor ⇒ BLOCK (the MutationRunner now feeds the gate — the gap);
//   - a MONSTER in the latest completeness run ⇒ BLOCK;
//   - a missing red-set mirror verdict counts as RED (anti-passthrough, KRD §82);
//   - the declared fitness floor (when present) overrides the run's recorded threshold.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// startGoalPostgres starts a throwaway Postgres with every baseline the goal-check source
// reads (ideas.goal, runtime.mirror_runs, runtime.mutation_runs, completeness_runs) +
// the fitness.mutation_threshold table the source reads SELECT-only (created inline here
// as test scaffolding — there is no fitness migration yet; it is NOT a wall write, the
// agent role still holds no write GRANT on it in production).
func startGoalPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/ideas_lifecycle_baseline.sql",
		"../../migrations/ideas_goal_baseline.sql",
		"../../migrations/mirror_runs_baseline.sql",
		"../../migrations/mutation_runs_baseline.sql",
		"../../migrations/completeness_runs_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}

	// The fitness.mutation_threshold table the source reads SELECT-only. No production
	// migration owns it yet, so the test creates the shape the S40 reader (and this
	// source) query. Test scaffolding only — the production agent role never writes it.
	if _, err := pool.Exec(ctx, `
CREATE SCHEMA IF NOT EXISTS fitness;
CREATE TABLE IF NOT EXISTS fitness.mutation_threshold (
    id            text        NOT NULL,
    body          jsonb       NOT NULL,
    superseded_by text,
    created_at    timestamptz NOT NULL DEFAULT now()
);`); err != nil {
		t.Fatalf("create fitness.mutation_threshold: %v", err)
	}
	return pool
}

// seedOpenGoal inserts one OPEN goal (id, body with red_set + budgets). The aidos_owner
// role inserts it (the production aidos CLI writer role; the agent is SELECT-only here).
func seedOpenGoal(t *testing.T, pool *pgxpool.Pool, id string, redSet []string) {
	t.Helper()
	ctx := context.Background()
	body := `{"idea_ref":"idea-x","changeset_ref":"cs-x","status":"OPEN","budgets":{"time_seconds":600,"turns":20,"tokens":100000},"red_set":["` +
		joinQuoted(redSet) + `"]}`
	if _, err := pool.Exec(ctx,
		`INSERT INTO ideas.goal (id, body, idea_ref, changeset_ref, status, created_at)
		 VALUES ($1, $2::jsonb, 'idea-x', 'cs-x', 'OPEN', now())`,
		id, body); err != nil {
		t.Fatalf("seed open goal: %v", err)
	}
}

// joinQuoted joins refs with `","` for the JSONB array literal (the simplest inline build).
func joinQuoted(refs []string) string {
	out := ""
	for i, r := range refs {
		if i > 0 {
			out += `","`
		}
		out += r
	}
	return out
}

// seedMirrorRun inserts one mirror_run row (latest wins). regressed is computed by the
// in-database CHECK (green→red only), so we pass a consistent baseline/status pair.
func seedMirrorRun(t *testing.T, pool *pgxpool.Pool, mirrorID, status, baseline string, regressed bool) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.mirror_runs
		   (run_id, mirror_id, mirror_version, content_hash, status, baseline_status, regressed, ran_at)
		 VALUES ($1, $2, 'v1', $1, $3, $4, $5, now())`,
		"mr-"+mirrorID+"-"+status, mirrorID, status, baseline, regressed); err != nil {
		t.Fatalf("seed mirror run %s: %v", mirrorID, err)
	}
}

// seedMutationRun inserts one mutation_runs row for scope 'go'.
func seedMutationRun(t *testing.T, pool *pgxpool.Pool, runID string, score, threshold float64, verdict string) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.mutation_runs
		   (run_id, scope, commit_or_phase_hash, runner, killed, survived, timed_out,
		    not_covered, total, score, threshold_used, verdict, started_at, finished_at)
		 VALUES ($1, 'go', 'cut-1', 'gremlins', 0,0,0,0,0, $2, $3, $4, now(), now())`,
		runID, score, threshold, verdict); err != nil {
		t.Fatalf("seed mutation run %s: %v", runID, err)
	}
}

// closeable seeds the full closeable state for the given red set: each mirror green +
// prior intact, a passing mutation run (0.9 ≥ 0.8), no completeness run (no monster).
func closeable(t *testing.T, pool *pgxpool.Pool, redSet []string) {
	for _, m := range redSet {
		seedMirrorRun(t, pool, m, "green", "red", false)
	}
	seedMutationRun(t, pool, "mut-pass", 0.9, 0.8, "pass")
}

func loadVerdict(t *testing.T, pool *pgxpool.Pool) (goal.Goal, goal.StopInput, bool) {
	t.Helper()
	src := NewPgGoalCheckSource(pool)
	g, in, hasGoal, err := src.Load(context.Background())
	if err != nil {
		t.Fatalf("PgGoalCheckSource.Load: %v", err)
	}
	return g, in, hasGoal
}

func TestPgGoalSource_NoOpenGoal_IsNoOp(t *testing.T) {
	pool := startGoalPostgres(t)
	_, _, hasGoal := loadVerdict(t, pool)
	if hasGoal {
		t.Fatalf("no OPEN goal must yield hasGoal=false (the no-op contract)")
	}
	// The source's no-op output drives a passing goal-check (the completeness half runs).
	if br := CheckGoal(context.Background(), NewPgGoalCheckSource(pool)); br != nil {
		t.Fatalf("no open goal ⇒ goal-check must pass; got %+v", br)
	}
}

func TestPgGoalSource_CloseableGoal_NoBlock(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a", "mirror-b"}
	seedOpenGoal(t, pool, "goal-ok", redSet)
	closeable(t, pool, redSet)

	g, in, hasGoal := loadVerdict(t, pool)
	if !hasGoal {
		t.Fatalf("an OPEN goal must yield hasGoal=true")
	}
	if br := goal.CloseBlockReason(g, in); br != nil {
		t.Fatalf("a fully-green closeable goal must NOT block; got %+v (in=%+v)", br, in)
	}
}

func TestPgGoalSource_StillRedMirror_Blocks(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a", "mirror-b"}
	seedOpenGoal(t, pool, "goal-red", redSet)
	closeable(t, pool, redSet)
	// Re-redden one red-set mirror with a LATER run (latest wins).
	seedMirrorRun(t, pool, "mirror-a", "red", "green", true)

	g, in, _ := loadVerdict(t, pool)
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("a still-red red-set mirror must BLOCK the close")
	}
}

func TestPgGoalSource_MissingMirrorVerdict_CountsRed(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a", "mirror-never-run"}
	seedOpenGoal(t, pool, "goal-missing", redSet)
	// Only mirror-a gets a run; mirror-never-run has NO verdict → must count as red.
	seedMirrorRun(t, pool, "mirror-a", "green", "red", false)
	seedMutationRun(t, pool, "mut-pass", 0.9, 0.8, "pass")

	g, in, _ := loadVerdict(t, pool)
	if _, ok := in.Sensors["mirror-never-run"]; ok {
		t.Fatalf("a mirror with no run must be ABSENT from the sensor map (treated as red)")
	}
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("a red-set mirror with no recorded verdict must BLOCK (anti-passthrough)")
	}
}

func TestPgGoalSource_BrokenPriorGreen_Blocks(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a"}
	seedOpenGoal(t, pool, "goal-prior", redSet)
	closeable(t, pool, redSet)
	// A DIFFERENT prior truth regressed green→red (latest run) → prior green broken (§8).
	seedMirrorRun(t, pool, "prior-truth", "red", "green", true)

	g, in, _ := loadVerdict(t, pool)
	if in.PriorGreen != goal.PriorBroken {
		t.Fatalf("a green→red regression on a prior truth must read PriorBroken; got %v", in.PriorGreen)
	}
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("a broken prior green must BLOCK the close")
	}
}

func TestPgGoalSource_MutationBelowFloor_Blocks(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a"}
	seedOpenGoal(t, pool, "goal-mut", redSet)
	seedMirrorRun(t, pool, "mirror-a", "green", "red", false)
	// The MutationRunner now feeds the gate (the ADR 0081 gap): a low score blocks.
	seedMutationRun(t, pool, "mut-low", 0.5, 0.8, "block")

	g, in, _ := loadVerdict(t, pool)
	if in.Mutation >= in.MutationFloor {
		t.Fatalf("expected mutation %.2f below floor %.2f", in.Mutation, in.MutationFloor)
	}
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("mutation below the declared floor must BLOCK the close")
	}
}

func TestPgGoalSource_DeclaredFitnessFloorOverridesRun(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a"}
	seedOpenGoal(t, pool, "goal-floor", redSet)
	seedMirrorRun(t, pool, "mirror-a", "green", "red", false)
	// The run recorded threshold_used 0.50 (would pass at score 0.60), but fitness declares
	// 0.90 — the declared floor (read SELECT-only) wins and BLOCKS (§8: the bar is declared).
	seedMutationRun(t, pool, "mut-borderline", 0.60, 0.50, "pass")
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO fitness.mutation_threshold (id, body) VALUES ('mutation_threshold', '{"go":0.90}'::jsonb)`); err != nil {
		t.Fatalf("seed fitness floor: %v", err)
	}

	g, in, _ := loadVerdict(t, pool)
	if in.MutationFloor != 0.90 {
		t.Fatalf("the declared fitness floor 0.90 must override the run's 0.50; got %.2f", in.MutationFloor)
	}
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("score 0.60 below the declared floor 0.90 must BLOCK")
	}
}

func TestPgGoalSource_Monster_Blocks(t *testing.T) {
	pool := startGoalPostgres(t)
	redSet := []string{"mirror-a"}
	seedOpenGoal(t, pool, "goal-monster", redSet)
	closeable(t, pool, redSet)
	// A completeness run with a monster finding → the goal-check sees a non-empty monster set.
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.completeness_runs (run_id, cut_hash, verdict, monster_count)
		 VALUES ('cr-monster', 'h-monster', 'block', 1)`); err != nil {
		t.Fatalf("seed completeness run: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.completeness_monster_findings (run_id, reason, kind, ref, missing_test_kind)
		 VALUES ('cr-monster', 'no_orphan_mirror', 'control', 'orphan-1', '')`); err != nil {
		t.Fatalf("seed monster finding: %v", err)
	}

	g, in, _ := loadVerdict(t, pool)
	if len(in.Monsters) == 0 {
		t.Fatalf("a latest completeness run with a finding must yield a non-empty monster set")
	}
	if br := goal.CloseBlockReason(g, in); br == nil {
		t.Fatalf("a monster must BLOCK the close")
	}
}
