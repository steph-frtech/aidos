package db_test

// Dry-run + persistence + wall mirror (Testcontainers, real Postgres):
//   reflects=gen.db.{EmitMigration,DataTruthScope}, test_kind=integration, liveness=live.
//
// THE done criterion (half 1): the entity emits an expand-contract migration that
// DRY-RUNS VALID against a real engine, not a mock. On a throwaway Postgres with the
// S02 records + S04 wall + S35 kernel.entity + S37 data_truth_scope baselines applied:
//   - the no-prior CREATE migration applies clean (the table exists);
//   - the additive EXPAND migration (ADD COLUMN coupon) applies clean ON TOP of it,
//     with no in-place rewrite/drop of existing rows (an inserted row survives);
//   - the narrowing EXPAND→BACKFILL→CONTRACT migration applies clean as a forward-only
//     plan (the contract DROP is a separate, guarded forward step);
//   - a DataTruthScope round-trips into runtime.data_truth_scope content-addressed by
//     its id == version == Hash(Canonicalize(body)); the §44.3 strategy CHECK refuses a
//     strategy outside the closed set; the agent role SELECTs the data-scope but may NOT
//     write it (the wall), and still has NO write grant on kernel.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startPostgres(t *testing.T) (*pgxpool.Pool, string) {
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
		"../../migrations/kernel_entity_baseline.sql",
		"../../migrations/data_truth_scope_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool, dsn
}

// THE done criterion half 1 — the emitted expand-contract migration dry-runs valid.
func TestEmittedMigrationDryRunsValid(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startPostgres(t)
	ctx := context.Background()

	// [create] no prior ⇒ CREATE TABLE — apply clean.
	create, br := db.EmitMigration(db.ExampleOrderPrior(), nil)
	if br != nil {
		t.Fatalf("emit create blocked: %s", br.Code)
	}
	if _, err := pool.Exec(ctx, string(create.Bytes)); err != nil {
		t.Fatalf("CREATE migration failed to dry-run: %v\n%s", err, string(create.Bytes))
	}
	// Seed a historical row under the OLD truth (id,total,discount).
	if _, err := pool.Exec(ctx,
		`INSERT INTO "order" ("id","total","discount") VALUES ('o1', 10, 1)`); err != nil {
		t.Fatalf("seed historical row: %v", err)
	}

	// [expand] additive (+coupon) ⇒ ADD COLUMN — apply clean ON TOP, historical row survives.
	prior := db.ExampleOrderPrior()
	expand, br := db.EmitMigration(db.ExampleOrderNew(), &prior)
	if br != nil {
		t.Fatalf("emit expand blocked: %s", br.Code)
	}
	if expand.Shape != "expand" {
		t.Fatalf("expand shape = %q", expand.Shape)
	}
	if _, err := pool.Exec(ctx, string(expand.Bytes)); err != nil {
		t.Fatalf("EXPAND migration failed to dry-run: %v\n%s", err, string(expand.Bytes))
	}
	// The historical row is preserved (no in-place rewrite/drop); coupon is NULL.
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM "order" WHERE "id"='o1' AND "coupon" IS NULL`).Scan(&n); err != nil {
		t.Fatalf("verify historical row survived expand: %v", err)
	}
	if n != 1 {
		t.Fatalf("expand rewrote/dropped historical data; want 1 surviving row, got %d", n)
	}

	// [expand_contract] narrowing (drop discount) ⇒ forward-only split — apply clean.
	narrowed, br := db.EmitMigration(db.ExampleOrderNarrowed(), &prior)
	if br != nil {
		t.Fatalf("emit narrowing blocked: %s", br.Code)
	}
	if narrowed.Shape != "expand_contract" {
		t.Fatalf("narrowing shape = %q", narrowed.Shape)
	}
	if _, err := pool.Exec(ctx, string(narrowed.Bytes)); err != nil {
		t.Fatalf("EXPAND→BACKFILL→CONTRACT migration failed to dry-run: %v\n%s", err, string(narrowed.Bytes))
	}
}

// A DataTruthScope round-trips into runtime.data_truth_scope content-addressed.
func TestDataTruthScopeRoundTrips(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startPostgres(t)
	ctx := context.Background()

	scope := db.ExampleDeclaredScope()
	body, err := scope.CanonicalBody()
	if err != nil {
		t.Fatalf("canonical body: %v", err)
	}
	id := scope.ID()
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.data_truth_scope (id, body, entity_ref, version)
		 VALUES ($1, $2::jsonb, $3, $4)`,
		id, string(body), "entity-order", id); err != nil {
		t.Fatalf("insert data_truth_scope: %v", err)
	}
	var gotStrategy string
	if err := pool.QueryRow(ctx,
		`SELECT body -> 'migration' ->> 'strategy' FROM runtime.data_truth_scope WHERE id = $1`,
		id).Scan(&gotStrategy); err != nil {
		t.Fatalf("select strategy: %v", err)
	}
	if gotStrategy != string(db.StrategyExpandContract) {
		t.Errorf("round-tripped strategy = %q, want expand_contract", gotStrategy)
	}
}

// The §44.3 strategy CHECK refuses a strategy outside the closed set.
func TestStrategyCheckRefusesUnknown(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startPostgres(t)
	_, err := pool.Exec(context.Background(),
		`INSERT INTO runtime.data_truth_scope (id, body, entity_ref, version)
		 VALUES ('h', '{"migration":{"strategy":"teleport"}}'::jsonb, 'e', 'h')`)
	if err == nil {
		t.Fatal("a strategy outside the closed §44.3 set must be refused by the CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("expected a CHECK violation, got: %v", err)
	}
}

// The agent role SELECTs the data-scope but may NOT write it (the wall), and has NO
// write grant on kernel.
func TestAgentRoleSelectsScopeButCannotWriteIt(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	adminPool, dsn := startPostgres(t)
	ctx := context.Background()

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'aidos'"); err != nil {
		t.Fatalf("grant login to agent: %v", err)
	}
	scope := db.ExampleDeclaredScope()
	body, _ := scope.CanonicalBody()
	id := scope.ID()
	if _, err := adminPool.Exec(ctx,
		`INSERT INTO runtime.data_truth_scope (id, body, entity_ref, version)
		 VALUES ($1, $2::jsonb, $3, $4)`, id, string(body), "entity-order", id); err != nil {
		t.Fatalf("seed scope: %v", err)
	}

	agentDSN := strings.Replace(dsn, "://aidos:", "://aidos_agent:", 1)
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	t.Cleanup(agentPool.Close)

	// The agent MAY SELECT the data-scope (read it for the panel + RequireMigration).
	var n int
	if err := agentPool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.data_truth_scope`).Scan(&n); err != nil {
		t.Fatalf("agent SELECT on data_truth_scope must be allowed: %v", err)
	}

	// The agent may NOT INSERT the data-scope (the wall — it does not author it).
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO runtime.data_truth_scope (id, body, entity_ref, version)
		 VALUES ('x', '{"migration":{"strategy":"expand_contract"}}'::jsonb, 'e', 'x')`); err == nil {
		t.Error("agent INSERT on data_truth_scope must be denied (the wall)")
	}

	// The agent still has NO write grant on kernel (it reads the entity AST only).
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO kernel.entity (id, body, version) VALUES ('x', '{}'::jsonb, 'x')`); err == nil {
		t.Error("agent INSERT on kernel.entity must be denied (the wall holds)")
	}
}
