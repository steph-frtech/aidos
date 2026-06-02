package generators_test

// Persistence + wall mirror: reflects=runtime.generators.generated-artifacts-ledger,
// test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 records baseline + the S04 wall
// grants + the S34 generated_artifacts migration applied:
//   - an emitted Artifact round-trips into runtime.generated_artifacts content-
//     addressed by (path, source_hash, output_hash) — the ledger value equals what
//     Emit produced;
//   - the target CHECK refuses a target outside the closed set (go-sqlc|pg-ddl|ts-types);
//   - a CHANGED source APPENDS a new row (append-only) leaving the prior (now stale)
//     row in place — staleness is a simple inequality, never a delete;
//   - the agent role (aidos_agent) may SELECT the ledger but may NOT INSERT/UPDATE/
//     DELETE it (the wall — it reads its emit history, it does not author it), and
//     still has NO write grant on kernel (it READS the entity AST, never authors it).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startLedgerPostgres(t *testing.T) (*pgxpool.Pool, string) {
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
		"../../migrations/generated_artifacts_baseline.sql",
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

func insertArtifact(t *testing.T, pool *pgxpool.Pool, a generators.Artifact) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO runtime.generated_artifacts (path, target, kind, source_hash, output_hash)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (path, source_hash) DO NOTHING`,
		a.Path, string(a.Target), string(a.Kind), a.SourceHash, a.OutputHash,
	)
	if err != nil {
		t.Fatalf("insert artifact: %v", err)
	}
}

func TestArtifactRoundTripsAsLedgerRow(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startLedgerPostgres(t)
	ctx := context.Background()

	a, br := generators.Emit(generators.ExampleOrder(), generators.TargetGoSqlc)
	if br != nil {
		t.Fatalf("emit blocked: %v", br)
	}
	insertArtifact(t, pool, a)

	var gotOutput, gotTarget string
	if err := pool.QueryRow(ctx,
		`SELECT output_hash, target FROM runtime.generated_artifacts
		 WHERE path = $1 AND source_hash = $2`, a.Path, a.SourceHash,
	).Scan(&gotOutput, &gotTarget); err != nil {
		t.Fatalf("select: %v", err)
	}
	if gotOutput != a.OutputHash {
		t.Errorf("ledger output_hash %q != emitted %q", gotOutput, a.OutputHash)
	}
	if gotTarget != string(generators.TargetGoSqlc) {
		t.Errorf("ledger target %q != go-sqlc", gotTarget)
	}
}

func TestTargetCheckRefusesUnknownTarget(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startLedgerPostgres(t)
	_, err := pool.Exec(context.Background(),
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('back/gen/x/x.go', 'mobile', 'h', 'o')`)
	if err == nil {
		t.Fatal("a target outside the closed set must be refused by the CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("expected a CHECK violation, got: %v", err)
	}
}

func TestChangedSourceAppendsStaleRow(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startLedgerPostgres(t)
	ctx := context.Background()

	before, _ := generators.Emit(generators.ExampleOrder(), generators.TargetTSTypes)
	after, _ := generators.Emit(generators.ExampleOrderChanged(), generators.TargetTSTypes)
	insertArtifact(t, pool, before)
	insertArtifact(t, pool, after)

	var n int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.generated_artifacts WHERE path = $1`, before.Path,
	).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Errorf("changed source did not append; want 2 rows (prior stale + new head), got %d", n)
	}
	// The prior row is stale relative to the new head (different source_hash).
	if before.SourceHash == after.SourceHash {
		t.Errorf("changed source kept the old source_hash (no stale signal)")
	}
}

func TestAgentRoleSelectsLedgerButCannotWriteIt(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	adminPool, dsn := startLedgerPostgres(t)
	ctx := context.Background()

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'aidos'"); err != nil {
		t.Fatalf("grant login to agent: %v", err)
	}
	a, _ := generators.Emit(generators.ExampleOrder(), generators.TargetGoSqlc)
	insertArtifact(t, adminPool, a)

	agentDSN := strings.Replace(dsn, "://aidos:", "://aidos_agent:", 1)
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	t.Cleanup(agentPool.Close)

	// The agent MAY SELECT the ledger (read its emit history for the panel).
	var n int
	if err := agentPool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.generated_artifacts`).Scan(&n); err != nil {
		t.Fatalf("agent SELECT on ledger must be allowed: %v", err)
	}

	// The agent may NOT INSERT the ledger (the wall — it does not author its emits).
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('back/gen/x/x.go', 'go-sqlc', 'h', 'o')`); err == nil {
		t.Error("agent INSERT on the ledger must be denied (the wall)")
	}

	// The agent still has NO write grant on kernel (it reads the entity AST only).
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version) VALUES ('x', '{}'::jsonb, 'x')`); err == nil {
		t.Error("agent INSERT on kernel.truth must be denied (the wall holds)")
	}
}
