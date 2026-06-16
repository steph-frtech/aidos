package operation_test

// Discriminant (mirror-first) proof for the kernel.operation persistence+wall mirror.
//
// A mirror that cannot go red is theatre (CLAUDE.md §5 hook-honesty, §8 anti-Goodhart).
// Here we NEUTRALIZE each guard the mirror watches — on a THROWAWAY container, over a
// MODIFIED copy of the baseline (the real back/migrations/kernel_operation_baseline.sql
// is NEVER touched) — and assert the corresponding assertion FLIPS RED:
//
//   - drop the CHECK operation_content_addressed ⇒ a row with version != id now
//     INSERTs ⇒ assertion (b) would no longer hold (the content-address guard is real);
//   - drop the REVOKE / re-grant INSERT to aidos_agent ⇒ the agent role can now INSERT
//     kernel.operation ⇒ assertion (c) — the wall, the product guarantee — would no
//     longer hold (the REVOKE is load-bearing, not decoration).
//
// Each neutralization is local to its throwaway container and discarded at Cleanup;
// the baseline on disk is the single authoritative truth and is read-only here.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// startOperationPostgresWith spins a throwaway Postgres and applies the given SQL
// (a neutralized copy of the baseline), returning an owner pool + DSN. It never reads
// or writes the on-disk migration beyond loading it for transformation.
func startOperationPostgresWith(t *testing.T, sql string) (*pgxpool.Pool, string) {
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

	if _, err := pool.Exec(ctx, sql); err != nil {
		t.Fatalf("apply neutralized migration: %v", err)
	}
	return pool, dsn
}

// loadBaseline reads the real baseline read-only, for in-memory transformation only.
func loadBaseline(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile(operationBaseline)
	if err != nil {
		t.Fatalf("read baseline: %v", err)
	}
	return string(b)
}

// TestDiscriminant_NoCheck_AcceptsNonContentAddressed proves assertion (b) is real:
// with the CHECK neutralized, a non-content-addressed row (version != id) is ACCEPTED.
// (Under the real baseline, TestOperationRejectsNonContentAddressedRow proves it is
// refused — so removing the guard flips that assertion red.)
func TestDiscriminant_NoCheck_AcceptsNonContentAddressed(t *testing.T) {
	base := loadBaseline(t)
	// Neutralize the content-address CHECK by removing the CONSTRAINT clause.
	neutralized := strings.Replace(base,
		"    CONSTRAINT operation_content_addressed CHECK (version = id)\n",
		"    CONSTRAINT operation_no_check_dummy CHECK (true)\n",
		1,
	)
	if neutralized == base {
		t.Fatal("neutralization no-op: the CHECK clause was not found/removed — the discriminant could not run")
	}
	pool, _ := startOperationPostgresWith(t, neutralized)
	ctx := context.Background()

	// version ('def') != id ('abc'): under the real CHECK this is refused; here it
	// must be ACCEPTED — proving the CHECK is what does the refusing.
	if _, err := pool.Exec(ctx,
		"INSERT INTO kernel.operation (id, body, version) VALUES ('abc', '{}'::jsonb, 'def')"); err != nil {
		t.Fatalf("DISCRIMINANT FAILED: with the CHECK removed, a version!=id row should INSERT, got: %v", err)
	}
}

// TestDiscriminant_NoRevoke_AgentCanInsert proves assertion (c) — the wall — is real:
// with the REVOKE neutralized (and INSERT re-granted to aidos_agent), the agent role
// CAN INSERT kernel.operation. (Under the real baseline,
// TestAgentRoleIsSelectOnlyOnOperation proves the INSERT is permission-denied — so
// removing the REVOKE flips that assertion red, breaching the product guarantee.)
func TestDiscriminant_NoRevoke_AgentCanInsert(t *testing.T) {
	base := loadBaseline(t)
	// Neutralize the wall: drop the REVOKE line and re-grant INSERT to aidos_agent.
	neutralized := strings.Replace(base,
		"REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON kernel.operation FROM aidos_agent;",
		"GRANT INSERT ON kernel.operation TO aidos_agent;",
		1,
	)
	if neutralized == base {
		t.Fatal("neutralization no-op: the REVOKE line was not found/replaced — the discriminant could not run")
	}
	adminPool, dsn := startOperationPostgresWith(t, neutralized)
	ctx := context.Background()

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoOperation(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	op := operation.CreateOrder()
	id, body := canonicalOperationBody(t, op)
	// With the wall neutralized, the agent INSERT must SUCCEED — proving the REVOKE is
	// the only thing standing between the agent and a truth write.
	if _, err := agentPool.Exec(ctx,
		"INSERT INTO kernel.operation (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("DISCRIMINANT FAILED: with the REVOKE removed, aidos_agent INSERT should succeed, got: %v", err)
	}
}
