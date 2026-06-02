package action_test

// Persistence + wall mirror: reflects=kernel.action-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the kernel_control_action migration applied:
//   - an Action AST round-trips as content-addressed JSONB: id == version ==
//     records.Hash(Canonicalize(a)), and the AST reads back canonically (Parse
//     re-canonicalizes to the same content hash) — proving kernel.action stores the
//     action-spec as the typed JSON AST §24.2 promises (the `binds`/invoke ref held
//     inside the body);
//   - the in-DB CHECK (version = id) refuses a non-content-addressed row;
//   - the agent role (aidos_agent) has SELECT-only on kernel.action — every
//     INSERT/UPDATE/DELETE is rejected with permission denied (the wall, §2).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startActionPostgres(t *testing.T) (*pgxpool.Pool, string) {
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

	mig, err := os.ReadFile("../../migrations/kernel_control_action_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}
	return pool, dsn
}

func canonicalActionRow(t *testing.T, a action.Action) (id, body string) {
	t.Helper()
	canon, err := action.Canonicalize(a)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	h := records.Hash(canon)
	return h, string(canon)
}

func TestActionASTRoundTripsAsJSONB(t *testing.T) {
	pool, _ := startActionPostgres(t)
	ctx := context.Background()

	a := action.CheckoutSubmit()
	id, body := canonicalActionRow(t, a)

	if _, err := pool.Exec(ctx,
		"INSERT INTO kernel.action (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var gotID, gotVer string
	var gotBody []byte
	if err := pool.QueryRow(ctx,
		"SELECT id, body, version FROM kernel.action WHERE id = $1", id).
		Scan(&gotID, &gotBody, &gotVer); err != nil {
		t.Fatalf("select: %v", err)
	}

	parsed, err := action.Parse(gotBody)
	if err != nil {
		t.Fatalf("parse from db: %v", err)
	}
	recanon, err := action.Canonicalize(parsed)
	if err != nil {
		t.Fatalf("re-canonicalize: %v", err)
	}
	want := records.Hash(recanon)
	if gotID != want || gotVer != want {
		t.Fatalf("db id/version != content hash: id=%s version=%s want=%s", gotID, gotVer, want)
	}
	// invoke (the binds link) survives the round-trip.
	if parsed.Invoke != "createOrder" {
		t.Fatalf("invoke lost in round-trip: %q", parsed.Invoke)
	}
}

func TestActionRejectsNonContentAddressedRow(t *testing.T) {
	pool, _ := startActionPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		"INSERT INTO kernel.action (id, body, version) VALUES ('abc', '{}'::jsonb, 'def')")
	if err == nil {
		t.Fatal("a row whose version != id must be refused by the content-address CHECK")
	}
}

func TestAgentRoleIsSelectOnlyOnAction(t *testing.T) {
	adminPool, dsn := startActionPostgres(t)
	ctx := context.Background()

	a := action.CheckoutSubmit()
	id, body := canonicalActionRow(t, a)
	if _, err := adminPool.Exec(ctx,
		"INSERT INTO kernel.action (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoAction(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	var gotID string
	if err := agentPool.QueryRow(ctx,
		"SELECT id FROM kernel.action WHERE id = $1", id).Scan(&gotID); err != nil {
		t.Fatalf("agent SELECT should be allowed: %v", err)
	}

	writes := []struct{ name, sql string }{
		{"INSERT", "INSERT INTO kernel.action (id, body, version) VALUES ('x', '{}'::jsonb, 'x')"},
		{"UPDATE", "UPDATE kernel.action SET version = id WHERE id = $1"},
		{"DELETE", "DELETE FROM kernel.action WHERE id = $1"},
	}
	for _, w := range writes {
		var execErr error
		if strings.Contains(w.sql, "$1") {
			_, execErr = agentPool.Exec(ctx, w.sql, id)
		} else {
			_, execErr = agentPool.Exec(ctx, w.sql)
		}
		if execErr == nil {
			t.Fatalf("the wall must reject %s on kernel.action (agent role)", w.name)
		}
		if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
			t.Fatalf("%s rejected for the wrong reason: %v", w.name, execErr)
		}
	}
}

func swapUserInfoAction(dsn, user, pass string) string {
	at := strings.Index(dsn, "@")
	scheme := strings.Index(dsn, "://")
	if at < 0 || scheme < 0 {
		return dsn
	}
	return dsn[:scheme+3] + user + ":" + pass + dsn[at:]
}
