package policy_test

// Persistence + wall mirror: reflects=kernel.policy-migration,
// test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the kernel_policy migration applied:
//   - a Policy AST round-trips as content-addressed JSONB: id == version ==
//     Hash(Canonicalize(policy)), and the AST reads back canonically (the same
//     bytes Parse re-canonicalizes to) — proving kernel.policy stores the AST as
//     the typed JSON AST §24.4 promises;
//   - the in-DB CHECK (version = id) refuses a non-content-addressed row;
//   - the agent role (aidos_agent) has SELECT-only on kernel.policy — every
//     INSERT/UPDATE/DELETE is rejected with permission denied (the wall, §2).
//
// This test reuses records.Hash / policy.Canonicalize as the single content-hash
// scheme (one address space across stores); it never re-invents hashing.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/policy"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startPolicyPostgres(t *testing.T) (*pgxpool.Pool, string) {
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

	// S02 created the kernel schema; the S09 migration is self-guarding (CREATE
	// SCHEMA IF NOT EXISTS) so applying it alone is sufficient for this test.
	mig, err := os.ReadFile("../../migrations/kernel_policy_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}
	return pool, dsn
}

// canonicalPolicyRow builds the content-addressed kernel.policy row for a Policy:
// the (id == version == hash) canonical AST JSONB.
func canonicalPolicyRow(t *testing.T, p policy.Policy) (id, body string) {
	t.Helper()
	canon, err := policy.Canonicalize(p)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	h := records.Hash(canon)
	return h, string(canon)
}

func TestPolicyASTRoundTripsAsJSONB(t *testing.T) {
	pool, _ := startPolicyPostgres(t)
	ctx := context.Background()

	// The KRD §93 anchor policy canPlaceOrder.
	p := policy.CanPlaceOrder()
	id, body := canonicalPolicyRow(t, p)

	if _, err := pool.Exec(ctx,
		"INSERT INTO kernel.policy (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var gotID, gotVer string
	var gotBody []byte
	if err := pool.QueryRow(ctx,
		"SELECT id, body, version FROM kernel.policy WHERE id = $1", id).
		Scan(&gotID, &gotBody, &gotVer); err != nil {
		t.Fatalf("select: %v", err)
	}

	// The AST reads back and Parse re-canonicalizes it to the same content hash.
	parsed, err := policy.Parse(gotBody)
	if err != nil {
		t.Fatalf("parse from db: %v", err)
	}
	recanon, err := policy.Canonicalize(parsed)
	if err != nil {
		t.Fatalf("re-canonicalize: %v", err)
	}
	want := records.Hash(recanon)
	if gotID != want || gotVer != want {
		t.Fatalf("db id/version != content hash: id=%s version=%s want=%s", gotID, gotVer, want)
	}
}

func TestPolicyRejectsNonContentAddressedRow(t *testing.T) {
	pool, _ := startPolicyPostgres(t)
	ctx := context.Background()

	// version != id violates the in-DB content-address CHECK.
	_, err := pool.Exec(ctx,
		"INSERT INTO kernel.policy (id, body, version) VALUES ('abc', '{}'::jsonb, 'def')")
	if err == nil {
		t.Fatal("a row whose version != id must be refused by the content-address CHECK")
	}
}

func TestAgentRoleIsSelectOnlyOnPolicy(t *testing.T) {
	adminPool, dsn := startPolicyPostgres(t)
	ctx := context.Background()

	p := policy.CanPlaceOrder()
	id, body := canonicalPolicyRow(t, p)
	if _, err := adminPool.Exec(ctx,
		"INSERT INTO kernel.policy (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoPolicy(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	// SELECT is allowed (the agent reads a typed Policy AST for context / the panel).
	var gotID string
	if err := agentPool.QueryRow(ctx,
		"SELECT id FROM kernel.policy WHERE id = $1", id).Scan(&gotID); err != nil {
		t.Fatalf("agent SELECT should be allowed: %v", err)
	}

	// Every write must be rejected (the wall).
	writes := []struct{ name, sql string }{
		{"INSERT", "INSERT INTO kernel.policy (id, body, version) VALUES ('x', '{}'::jsonb, 'x')"},
		{"UPDATE", "UPDATE kernel.policy SET version = id WHERE id = $1"},
		{"DELETE", "DELETE FROM kernel.policy WHERE id = $1"},
	}
	for _, w := range writes {
		var execErr error
		if strings.Contains(w.sql, "$1") {
			_, execErr = agentPool.Exec(ctx, w.sql, id)
		} else {
			_, execErr = agentPool.Exec(ctx, w.sql)
		}
		if execErr == nil {
			t.Fatalf("agent %s on kernel.policy must be rejected, but it succeeded", w.name)
		}
		if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
			t.Fatalf("agent %s rejected for the wrong reason: %v", w.name, execErr)
		}
	}
}

func swapUserInfoPolicy(dsn, user, pass string) string {
	const scheme = "postgres://"
	rest := strings.TrimPrefix(dsn, scheme)
	at := strings.Index(rest, "@")
	if at < 0 {
		return dsn
	}
	return scheme + user + ":" + pass + "@" + rest[at+1:]
}
