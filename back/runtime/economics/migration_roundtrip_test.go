package economics_test

// S51 PERSISTENCE MIRROR (Testcontainers, real Postgres):
//   reflects = fitness.harness_cost_budget + runtime.harness_economics_snapshot,
//   test_kind = integration, liveness = live.
//
// On a real Postgres with the S04 wall_grants baseline + the S51
// harness_economics_baseline migration applied:
//   - fitness.harness_cost_budget exists (the DECLARED above-the-line cap), the caps
//     are non-negative and expected_risk_reduction is in the closed enum (CHECK);
//   - runtime.harness_economics_snapshot exists, content-addressed by id, body JSONB,
//     verdict/risk/decision pinned to their closed enums (CHECK);
//   - THE WALL: the agent role SELECTs the DECLARED budget + the snapshot, but
//     INSERT/UPDATE/DELETE on fitness.harness_cost_budget are REFUSED (fitness is
//     read-only above the line — the agent reads the bar, never authors it, §2/§8);
//   - APPEND-ONLY: the aidos writer INSERTs, but UPDATE/DELETE are refused.
//
// AIDOS convention: Testcontainers on `go test`; skipped under -short.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startEconomicsPostgres(t *testing.T) *pgxpool.Pool {
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
		"../../migrations/harness_economics_baseline.sql",
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

const insertBudgetSQL = `INSERT INTO fitness.harness_cost_budget
	(id, cell_ref, max_ci_minutes, max_llm_tokens_per_goal, max_mutation_runtime_seconds, max_human_review_minutes, expected_risk_reduction, declared_at)
	VALUES ($1, 'checkout', 10, 50000, 300, 30, $2, now())`

const insertSnapSQL = `INSERT INTO runtime.harness_economics_snapshot
	(id, body, cell_ref, risk_if_broken, decision, verdict, kernel_head, scanned_at)
	VALUES ($1, $2::jsonb, 'checkout', $3, $4, $5, 'head-1', now())`

// TestBudgetTable_EnumAndNonNegChecked — the declared budget table exists; the risk
// enum CHECK refuses an out-of-enum risk; the non-negative CHECK refuses a negative cap.
func TestBudgetTable_EnumAndNonNegChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEconomicsPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertBudgetSQL, "b-1", "high"); err != nil {
		t.Fatalf("a well-formed declared budget must insert: %v", err)
	}
	if _, err := pool.Exec(ctx, insertBudgetSQL, "b-bad", "extreme"); err == nil {
		t.Fatal("an out-of-enum expected_risk_reduction MUST be refused by the CHECK")
	}
	if _, err := pool.Exec(ctx, `INSERT INTO fitness.harness_cost_budget
		(id, cell_ref, max_ci_minutes, max_llm_tokens_per_goal, max_mutation_runtime_seconds, max_human_review_minutes, expected_risk_reduction, declared_at)
		VALUES ('b-neg', 'c', -1, 0, 0, 0, 'high', now())`); err == nil {
		t.Fatal("a negative cap MUST be refused by the non-negative CHECK")
	}
}

// TestSnapshotTable_VerdictEnumChecked — the snapshot table exists; the verdict enum
// CHECK refuses an out-of-enum verdict and a non-object body is refused.
func TestSnapshotTable_VerdictEnumChecked(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEconomicsPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertSnapSQL, "s-1", `{"verdict":"over_budget_flagged"}`, "high", "justified", "over_budget_justified"); err != nil {
		t.Fatalf("a well-formed snapshot must insert: %v", err)
	}
	if _, err := pool.Exec(ctx, insertSnapSQL, "s-badv", `{"x":1}`, nil, nil, "maybe_ok"); err == nil {
		t.Fatal("an out-of-enum verdict MUST be refused by the CHECK")
	}
	if _, err := pool.Exec(ctx, insertSnapSQL, "s-badbody", `[1,2,3]`, nil, nil, "within_budget"); err == nil {
		t.Fatal("a non-object body MUST be refused by the body-shape CHECK")
	}
	// a snapshot with no value case: risk/decision NULL is allowed.
	if _, err := pool.Exec(ctx, insertSnapSQL, "s-noVC", `{"verdict":"within_budget"}`, nil, nil, "within_budget"); err != nil {
		t.Fatalf("a no-value-case snapshot (NULL risk/decision) must insert: %v", err)
	}
}

// TestWall_AgentSelectOnlyBudget — the agent SELECTs the DECLARED budget but
// INSERT/UPDATE/DELETE are refused (fitness is read-only above the line — the agent
// reads the BAR it is measured against, never authors it; §2/§8).
func TestWall_AgentSelectOnlyBudget(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEconomicsPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, insertBudgetSQL, "b-seed", "high"); err != nil {
		t.Fatalf("seed budget: %v", err)
	}

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role aidos_agent: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	var n int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM fitness.harness_cost_budget").Scan(&n); err != nil {
		t.Fatalf("the agent must be able to SELECT the declared budget (the bar): %v", err)
	}
	if n != 1 {
		t.Fatalf("expected 1 seeded budget, got %d", n)
	}
	if _, err := pool.Exec(ctx, insertBudgetSQL, "b-agent", "high"); err == nil {
		t.Fatal("the agent INSERT into fitness.harness_cost_budget MUST be refused — the wall authors no bar (§8)")
	}
	if _, err := pool.Exec(ctx, "UPDATE fitness.harness_cost_budget SET max_ci_minutes = 9999"); err == nil {
		t.Fatal("the agent UPDATE on the declared budget MUST be refused — never raise the bar (§8)")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM fitness.harness_cost_budget"); err == nil {
		t.Fatal("the agent DELETE on the declared budget MUST be refused — the wall")
	}
}

// TestAppendOnly_SnapshotWriterNoUpdateDelete — the snapshot is APPEND-ONLY: a
// non-owner writer with the migration's writer grants can INSERT but not UPDATE/DELETE.
func TestAppendOnly_SnapshotWriterNoUpdateDelete(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers in -short")
	}
	pool := startEconomicsPostgres(t)
	ctx := context.Background()

	for _, stmt := range []string{
		"CREATE ROLE econ_writer_test NOLOGIN",
		"GRANT USAGE ON SCHEMA runtime TO econ_writer_test",
		"GRANT SELECT, INSERT ON runtime.harness_economics_snapshot TO econ_writer_test",
		"REVOKE UPDATE, DELETE, TRUNCATE ON runtime.harness_economics_snapshot FROM econ_writer_test",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("setup %q: %v", stmt, err)
		}
	}

	if _, err := pool.Exec(ctx, "SET ROLE econ_writer_test"); err != nil {
		t.Fatalf("set role econ_writer_test: %v", err)
	}
	defer pool.Exec(ctx, "RESET ROLE")

	if _, err := pool.Exec(ctx, insertSnapSQL, "s-w1", `{"verdict":"over_budget_flagged"}`, "high", "too_expensive", "over_budget_flagged"); err != nil {
		t.Fatalf("the writer must be able to INSERT a snapshot (via a ChangeSet): %v", err)
	}
	if _, err := pool.Exec(ctx, "UPDATE runtime.harness_economics_snapshot SET verdict = 'within_budget'"); err == nil {
		t.Fatal("the writer UPDATE MUST be refused — append-only")
	}
	if _, err := pool.Exec(ctx, "DELETE FROM runtime.harness_economics_snapshot"); err == nil {
		t.Fatal("the writer DELETE MUST be refused — append-only")
	}
}

// helper to keep imports honest if strings is unused in a build variant.
var _ = strings.Contains
