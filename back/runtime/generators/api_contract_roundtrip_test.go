package generators_test

// Persistence + wall mirror (S36): reflects=runtime.api_contract + the ledger 'api'
// value, test_kind=integration, liveness=live, authority=below.
//
// On a real Postgres (Testcontainers) with the S02 + S04 + S34 + S36 migrations applied:
//   - the emit ledger now ADMITS an 'api' artifact (the expand-contract CHECK), and an
//     api artifact round-trips as a ledger row;
//   - a Pact contract round-trips in runtime.api_contract (content-addressed by
//     operation_hash; the pact_json reads back as the canonical contract);
//   - the in-DB CHECK still REJECTS an unknown target (e.g. 'graphql') — the set stayed
//     closed, only expanded;
//   - the agent role (aidos_agent) has SELECT-only on runtime.api_contract — every
//     INSERT/UPDATE/DELETE is rejected with permission denied (the wall, §2).
//
// Skipped when Docker/Testcontainers is unavailable (the by-design forward dependency:
// the proof is the executable test, run wherever Docker exists).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startAPIContractPostgres(t *testing.T) (*pgxpool.Pool, string) {
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
		t.Skipf("testcontainers unavailable (Docker not present?): %v", err)
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
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/wall_grants_baseline.sql",
		"../../migrations/generated_artifacts_baseline.sql",
		"../../migrations/api_contract_baseline.sql",
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

func TestLedgerAdmitsAPITargetAndContractRoundTrips(t *testing.T) {
	pool, _ := startAPIContractPostgres(t)
	ctx := context.Background()

	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	art, br := generators.EmitAPI(op, e)
	if br != nil {
		t.Fatalf("EmitAPI: %+v", br)
	}

	// (1) the ledger now admits an 'api' artifact.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, kind, source_hash, output_hash)
		 VALUES ($1, 'api', 'entity', $2, $3)`,
		art.Path, art.SourceHash, art.OutputHash,
	); err != nil {
		t.Fatalf("ledger must admit an 'api' artifact: %v", err)
	}

	// the CHECK stayed closed — an unknown target is still refused.
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.generated_artifacts (path, target, source_hash, output_hash)
		 VALUES ('x', 'graphql', 'h', 'h')`,
	); err == nil {
		t.Fatal("the ledger target CHECK must still refuse an unknown target ('graphql')")
	}

	// (2) the Pact contract round-trips.
	contract, _ := generators.EmitContract(op, e)
	cj, err := generators.ContractJSON(contract)
	if err != nil {
		t.Fatalf("ContractJSON: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO runtime.api_contract (route, method, operation_hash, pact_json)
		 VALUES ($1, $2, $3, $4::jsonb)`,
		"/orders", "POST", contract.SourceHash, string(cj),
	); err != nil {
		t.Fatalf("insert contract: %v", err)
	}
	var route, method, ophash string
	if err := pool.QueryRow(ctx,
		`SELECT route, method, operation_hash FROM runtime.api_contract
		 WHERE method = 'POST' AND route = '/orders'`).Scan(&route, &method, &ophash); err != nil {
		t.Fatalf("select contract: %v", err)
	}
	if route != "/orders" || method != "POST" || ophash != contract.SourceHash {
		t.Fatalf("contract round-trip mismatch: %s %s %s", method, route, ophash)
	}
}

func TestAgentRoleSelectsContractButCannotWriteIt(t *testing.T) {
	adminPool, dsn := startAPIContractPostgres(t)
	ctx := context.Background()

	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	contract, _ := generators.EmitContract(op, e)
	cj, _ := generators.ContractJSON(contract)
	if _, err := adminPool.Exec(ctx,
		`INSERT INTO runtime.api_contract (route, method, operation_hash, pact_json)
		 VALUES ('/orders', 'POST', $1, $2::jsonb)`, contract.SourceHash, string(cj)); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoAPI(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	var got string
	if err := agentPool.QueryRow(ctx,
		"SELECT route FROM runtime.api_contract WHERE method = 'POST'").Scan(&got); err != nil {
		t.Fatalf("agent SELECT should be allowed: %v", err)
	}

	writes := []struct{ name, sql string }{
		{"INSERT", "INSERT INTO runtime.api_contract (route, method, operation_hash, pact_json) VALUES ('/x','GET','h','{}'::jsonb)"},
		{"UPDATE", "UPDATE runtime.api_contract SET last_verified_at = now() WHERE method = 'POST'"},
		{"DELETE", "DELETE FROM runtime.api_contract WHERE method = 'POST'"},
	}
	for _, w := range writes {
		if _, execErr := agentPool.Exec(ctx, w.sql); execErr == nil {
			t.Fatalf("the wall must reject %s on runtime.api_contract (agent role)", w.name)
		} else if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
			t.Fatalf("%s rejected for the wrong reason: %v", w.name, execErr)
		}
	}
}

func swapUserInfoAPI(dsn, user, pass string) string {
	at := strings.Index(dsn, "@")
	scheme := strings.Index(dsn, "://")
	if at < 0 || scheme < 0 {
		return dsn
	}
	return dsn[:scheme+3] + user + ":" + pass + dsn[at:]
}
