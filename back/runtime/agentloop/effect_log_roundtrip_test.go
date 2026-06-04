package agentloop_test

// BA29 EFFECT-LOG PERSISTENCE MIRROR (Testcontainers, real Postgres) — the migration-roundtrip +
// reconciliation-coherence + wall mirror, the step's central red set on the storage edge.
//
//	reflects = runtime.agent_effect (the INDEPENDENT boundary effect-log, gap H2) ·
//	test_kind = integration · liveness = live.
//
// On a real Postgres with the S04 wall_grants + S52 agent_layer + BA26 agentrun_replay + BA29
// agent_effect baselines:
//   - ROUNDTRIP: a boundary effect (run, kind, target) persists and reads back losslessly; the
//     run index resolves "every effect of run X".
//   - CLOSED KIND: the agent_effect_kind_chk REFUSES a kind outside {fs_write, mcp_call}.
//   - RECONCILE OVER REAL ROWS: a run whose recorded action is matched by a stored effect
//     reconciles clean; an extra stored effect (a boundary side-effect with no recorded action)
//     makes the SAME run NOT reconcile — the gap-H2 betrayal, surfaced over real persistence.
//   - THE WALL (unchanged): the agent role records effects (INSERT+SELECT) but NEVER
//     UPDATE/DELETE (append-only; an effect, once witnessed, is never altered), and has NO
//     write above the line — an effect is below the line.
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

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

func startEffectLogPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/agent_effect_log_baseline.sql",
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

// TestEffectLog_Roundtrip — a boundary effect persists and reads back losslessly; the run index
// resolves "every effect of run X".
func TestEffectLog_Roundtrip(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEffectLogPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ($1,$2,$3)`,
		"run-1", "fs_write", "back/gen/checkout.go"); err != nil {
		t.Fatalf("a boundary effect MUST persist: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ($1,$2,$3)`,
		"run-1", "mcp_call", "mirror-runner.run_mirror"); err != nil {
		t.Fatalf("an mcp_call effect MUST persist: %v", err)
	}

	var kind, target string
	if err := pool.QueryRow(ctx,
		`SELECT kind, target FROM runtime.agent_effect WHERE run='run-1' AND kind='fs_write'`).
		Scan(&kind, &target); err != nil {
		t.Fatalf("read back the effect: %v", err)
	}
	if kind != "fs_write" || target != "back/gen/checkout.go" {
		t.Fatalf("effect must round-trip losslessly, got kind=%q target=%q", kind, target)
	}

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.agent_effect WHERE run='run-1'`).Scan(&n); err != nil {
		t.Fatalf("lookup by run: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 effects for run-1, got %d", n)
	}
}

// TestEffectLog_ClosedKind — the kind CHECK refuses an out-of-enum kind.
func TestEffectLog_ClosedKind(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEffectLogPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ($1,$2,$3)`,
		"run-2", "network_call", "evil.example"); err == nil {
		t.Fatalf("the kind CHECK MUST refuse a kind outside {fs_write, mcp_call}")
	}
}

// TestEffectLog_ReconcileOverRealRows — reconciliation runs over effects READ BACK from Postgres:
// a faithful run reconciles, and an extra stored effect (a boundary side-effect with no recorded
// action) makes the same run NOT reconcile (the gap-H2 betrayal, proven over real persistence).
func TestEffectLog_ReconcileOverRealRows(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEffectLogPostgres(t)
	ctx := context.Background()

	run, err := agentrun.Record(agentrun.AgentRun{
		Agent: "bdd-writer@v1", Goal: "g-checkout", RedWorkItem: "r", ContextPack: "p",
		Actions:   []agentrun.AgentAction{{Type: agentrun.ActionWrite, Cible: "back/gen/x.go", Autorisee: true}},
		Result:    agentrun.ResultGreen,
		StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:05:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}

	// the boundary witnessed EXACTLY the recorded write.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ($1,'fs_write',$2)`,
		run.ID, "back/gen/x.go"); err != nil {
		t.Fatalf("insert faithful effect: %v", err)
	}

	readEffects := func() []agentloop.Effect {
		rows, err := pool.Query(ctx,
			`SELECT run, kind, target FROM runtime.agent_effect WHERE run=$1 ORDER BY id`, run.ID)
		if err != nil {
			t.Fatalf("read effects: %v", err)
		}
		defer rows.Close()
		var out []agentloop.Effect
		for rows.Next() {
			var e agentloop.Effect
			var kind string
			if err := rows.Scan(&e.Run, &kind, &e.Target); err != nil {
				t.Fatalf("scan: %v", err)
			}
			e.Kind = agentloop.EffectKind(kind)
			out = append(out, e)
		}
		return out
	}

	if !agentloop.Reconcile(run, readEffects()).Reconciled {
		t.Fatalf("a faithful run must reconcile over the real rows")
	}

	// the BETRAYAL: a boundary effect the run never recorded lands in the log.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ($1,'fs_write',$2)`,
		run.ID, "/tmp/exfil.sh"); err != nil {
		t.Fatalf("insert betrayal effect: %v", err)
	}
	if agentloop.Reconcile(run, readEffects()).Reconciled {
		t.Fatalf("an unrecorded boundary effect (read from Postgres) MUST break reconciliation")
	}
}

// TestEffectLog_WallAppendOnly — the agent role records effects (INSERT+SELECT) but cannot
// UPDATE/DELETE (append-only; the audit is tamper-evident).
func TestEffectLog_WallAppendOnly(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEffectLogPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ('run-3','fs_write','a.go')`); err != nil {
		t.Fatalf("seed effect: %v", err)
	}

	// SET ROLE to the agent role and assert INSERT works, UPDATE/DELETE are refused.
	if _, err := pool.Exec(ctx, `SET ROLE aidos_agent`); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer func() { _, _ = pool.Exec(ctx, `RESET ROLE`) }()

	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.agent_effect (run, kind, target) VALUES ('run-3','mcp_call','t')`); err != nil {
		t.Fatalf("the agent role MUST be able to INSERT an effect: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`UPDATE runtime.agent_effect SET target='tampered' WHERE run='run-3'`); err == nil {
		t.Fatalf("the agent role MUST NOT be able to UPDATE an effect (append-only)")
	}
	if _, err := pool.Exec(ctx,
		`DELETE FROM runtime.agent_effect WHERE run='run-3'`); err == nil {
		t.Fatalf("the agent role MUST NOT be able to DELETE an effect (append-only)")
	}
}
