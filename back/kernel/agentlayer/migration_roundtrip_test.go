package agentlayer_test

// S52 PERSISTENCE MIRROR (Testcontainers, real Postgres):
//   reflects = kernel.agent_layer (above the line) + runtime.agent_run/action/assignment
//   (below the waterline), test_kind = integration, liveness = live.
//
// On a real Postgres with the S04 wall_grants baseline + the S52 agent_layer_baseline:
//   - kernel.agent_layer exists, content-addressed by id, body JSONB; the layer-kind
//     CHECK refuses a kind outside {agent, equipe_agents, orchestration};
//   - runtime.agent_run/action/assignment exist, the result/statut enum CHECKs hold,
//     and the tables carry NO version/mirror column (a run is not a layer);
//   - THE WALL: the agent role SELECTs kernel.agent_layer but INSERT/UPDATE/DELETE are
//     REFUSED (a CoucheAgent is a SOURCE above the line — the agent never writes the
//     kernel, §2/§8); the agent INSERTs into runtime.* (it records its own runs below
//     the line) but UPDATE/DELETE are refused (append-only).
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

func startAgentLayerPostgres(t *testing.T) *pgxpool.Pool {
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

const insertLayerSQL = `INSERT INTO kernel.agent_layer (id, body, version)
	VALUES ($1, $2::jsonb, $1)`

const insertRunSQL = `INSERT INTO runtime.agent_run (id, body, result)
	VALUES ($1, $2::jsonb, $3)`

// TestLayerTable_KindEnumChecked — the agent_layer table exists; the kind CHECK refuses
// an out-of-enum layer-kind and a non-object body.
func TestLayerTable_KindEnumChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentLayerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertLayerSQL, "l-1", `{"kind":"agent","spec":{"nom":"bdd-writer"}}`); err != nil {
		t.Fatalf("a well-formed agent layer must insert: %v", err)
	}
	if _, err := pool.Exec(ctx, insertLayerSQL, "l-team", `{"kind":"equipe_agents"}`); err != nil {
		t.Fatalf("equipe_agents must insert: %v", err)
	}
	if _, err := pool.Exec(ctx, insertLayerSQL, "l-bad", `{"kind":"rogue"}`); err == nil {
		t.Fatal("an out-of-enum layer-kind MUST be refused by the CHECK")
	}
	if _, err := pool.Exec(ctx, insertLayerSQL, "l-blob", `[1,2,3]`); err == nil {
		t.Fatal("a non-object body MUST be refused by the body-shape CHECK")
	}
}

// TestRunTable_ResultEnumChecked — the runtime.agent_run table exists; the result CHECK
// refuses an out-of-enum result.
func TestRunTable_ResultEnumChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentLayerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertRunSQL, "r-1", `{"agent":"bdd-writer"}`, "still_red"); err != nil {
		t.Fatalf("a well-formed run must insert: %v", err)
	}
	if _, err := pool.Exec(ctx, insertRunSQL, "r-bad", `{"agent":"x"}`, "maybe"); err == nil {
		t.Fatal("an out-of-enum result MUST be refused by the CHECK")
	}
}

// TestRunTable_NoVersionNoMirrorColumn — runtime.agent_run carries NO version and NO
// mirror column (a run is not a layer/truth).
func TestRunTable_NoVersionNoMirrorColumn(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentLayerPostgres(t)
	ctx := context.Background()

	for _, col := range []string{"version", "mirror"} {
		var n int
		if err := pool.QueryRow(ctx,
			`SELECT count(*) FROM information_schema.columns
			 WHERE table_schema='runtime' AND table_name='agent_run' AND column_name=$1`, col).Scan(&n); err != nil {
			t.Fatalf("query columns: %v", err)
		}
		if n != 0 {
			t.Fatalf("runtime.agent_run MUST NOT carry a %q column — a run is not a layer", col)
		}
	}
}

// TestWall_AgentSelectOnlyLayer — the agent SELECTs kernel.agent_layer but
// INSERT/UPDATE/DELETE are refused (a CoucheAgent is a SOURCE above the line; the agent
// never writes the kernel, §2/§8 — exactly AGENT_WRITE_ABOVE_WATERLINE in DB form).
func TestWall_AgentSelectOnlyLayer(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentLayerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertLayerSQL, "l-seed", `{"kind":"agent"}`); err != nil {
		t.Fatalf("seed layer: %v", err)
	}

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM kernel.agent_layer").Scan(&n); err != nil {
		t.Fatalf("the agent must SELECT the agent layer (read its own governance): %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 seeded layer, got %d", n)
	}
	if _, err := pool.Exec(ctx, insertLayerSQL, "l-agent", `{"kind":"agent"}`); err == nil {
		t.Fatal("the agent INSERT into kernel.agent_layer MUST be refused — no agent writes the kernel (§2)")
	}
	if _, err := pool.Exec(ctx, "UPDATE kernel.agent_layer SET version = 'x'"); err == nil {
		t.Fatal("the agent UPDATE on kernel.agent_layer MUST be refused — the wall")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM kernel.agent_layer"); err == nil {
		t.Fatal("the agent DELETE on kernel.agent_layer MUST be refused — the wall")
	}
}

// TestRuntime_AgentAppendsOwnRuns — the agent INSERTs into runtime.agent_run (records
// its own runs below the line) but UPDATE/DELETE are refused (append-only).
func TestRuntime_AgentAppendsOwnRuns(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startAgentLayerPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx, insertRunSQL, "r-agent", `{"agent":"bdd-writer"}`, "still_red"); err != nil {
		t.Fatalf("the agent must INSERT its own run below the line: %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE runtime.agent_run SET result = 'green'"); err == nil {
		t.Fatal("the agent UPDATE on runtime.agent_run MUST be refused — append-only")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM runtime.agent_run"); err == nil {
		t.Fatal("the agent DELETE on runtime.agent_run MUST be refused — a run is never deleted")
	}
}
