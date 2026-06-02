package webcomponent_test

// Persistence + wall mirror (integration) — the web projection round-trips into the
// S34 emit ledger as a ts-next row, on a real Postgres.
//
//	reflects: runtime.generators.webcomponent + runtime.generated_artifacts (ts-next)
//	· test_kind: integration · cert_language: testcontainers/go · authority: below · liveness: live
//
// On a real Postgres (Testcontainers) with the S02 records baseline + the S04 wall
// grants + the S34 generated_artifacts migration + the S38 ts-next CHECK widen applied:
//   - an emitted ts-next Artifact round-trips into runtime.generated_artifacts content-
//     addressed by (path, source_hash); the ledger value equals what Emit produced;
//   - the widened CHECK ADMITS target='ts-next' (and still admits the S34 targets) and
//     refuses a target outside the superset ('mobile');
//   - the agent role (aidos_agent) may SELECT the ledger but may NOT INSERT it (the
//     wall — it reads its emit history, it does not author it), and still has NO write
//     grant on kernel (it READS the control/action AST, never authors it).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/runtime/generators/webcomponent"
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
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/wall_grants_baseline.sql",
		"../../../migrations/generated_artifacts_baseline.sql",
		"../../../migrations/web_projection_target_baseline.sql",
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

func insertArtifact(t *testing.T, pool *pgxpool.Pool, a webcomponent.Artifact) {
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

func TestWebProjectionRoundTripsAsTSNextLedgerRow(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startLedgerPostgres(t)
	ctx := context.Background()

	art, br := webcomponent.Emit(control.CheckoutButton(), action.CheckoutSubmit(), webcomponent.TargetTSNext)
	if br != nil {
		t.Fatalf("emit blocked: %+v", br)
	}
	insertArtifact(t, pool, art)

	var gotOutput, gotTarget, gotKind string
	if err := pool.QueryRow(ctx,
		`SELECT output_hash, target, kind FROM runtime.generated_artifacts
		 WHERE path = $1 AND source_hash = $2`, art.Path, art.SourceHash,
	).Scan(&gotOutput, &gotTarget, &gotKind); err != nil {
		t.Fatalf("select: %v", err)
	}
	if gotOutput != art.OutputHash {
		t.Errorf("ledger output_hash %q != emitted %q", gotOutput, art.OutputHash)
	}
	if gotTarget != "ts-next" {
		t.Errorf("ledger target %q != ts-next", gotTarget)
	}
	if gotKind != "control" {
		t.Errorf("ledger kind %q != control", gotKind)
	}
}

func TestWidenedCheckAdmitsTSNextRefusesUnknown(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool, _ := startLedgerPostgres(t)
	ctx := context.Background()

	// The S34 targets still pass.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('back/gen/x/x.go', 'go-sqlc', 'h1', 'o1')`); err != nil {
		t.Fatalf("widened CHECK must still admit go-sqlc: %v", err)
	}
	// ts-next now passes.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('front/web/app/web-preview/_generated/x.tsx', 'ts-next', 'h2', 'o2')`); err != nil {
		t.Fatalf("widened CHECK must admit ts-next: %v", err)
	}
	// A target outside the superset is refused.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('x.x', 'mobile', 'h3', 'o3')`); err == nil {
		t.Fatal("a target outside the widened set must be refused by the CHECK")
	}
}

func TestAgentSelectsLedgerButCannotWriteTSNext(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	adminPool, dsn := startLedgerPostgres(t)
	ctx := context.Background()

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'aidos'"); err != nil {
		t.Fatalf("grant login to agent: %v", err)
	}
	art, _ := webcomponent.Emit(control.CheckoutButton(), action.CheckoutSubmit(), webcomponent.TargetTSNext)
	insertArtifact(t, adminPool, art)

	agentDSN := strings.Replace(dsn, "://aidos:", "://aidos_agent:", 1)
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	t.Cleanup(agentPool.Close)

	var n int
	if err := agentPool.QueryRow(ctx,
		`SELECT count(*) FROM runtime.generated_artifacts`).Scan(&n); err != nil {
		t.Fatalf("agent SELECT on ledger must be allowed: %v", err)
	}
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('front/web/app/web-preview/_generated/y.tsx', 'ts-next', 'h', 'o')`); err == nil {
		t.Error("agent INSERT on the ledger must be denied (the wall)")
	}
	if _, err := agentPool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version) VALUES ('x', '{}'::jsonb, 'x')`); err == nil {
		t.Error("agent INSERT on kernel.truth must be denied (the wall holds)")
	}
}
