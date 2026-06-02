package entities_test

// Persistence + wall mirror: reflects=kernel.entity-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the kernel_entity migration applied:
//   - an Entity AST round-trips as content-addressed JSONB: id == version ==
//     records.Hash(Canonicalize(body)), and the AST reads back canonically (re-parse +
//     re-canonicalize to the same content hash, attribute ORDER preserved) — proving
//     kernel.entity stores the entity source as the typed JSON AST §23/§26 promises;
//   - the in-DB CHECK (version = id) refuses a non-content-addressed row;
//   - the agent role (aidos_agent) has SELECT-only on kernel.entity — every
//     INSERT/UPDATE/DELETE is rejected with permission denied (the wall, §2).
//
// Reuses records.Hash/Canonicalize as the single content-hash scheme; never re-invents
// hashing. Skipped when Docker/Testcontainers is unavailable (the by-design forward
// dependency: the proof is the executable test, run wherever Docker exists).

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startEntityPostgres(t *testing.T) (*pgxpool.Pool, string) {
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
		t.Fatalf("testcontainers: connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: new: %v", err)
	}
	t.Cleanup(pool.Close)

	mig, err := os.ReadFile("../../migrations/kernel_entity_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}
	return pool, dsn
}

func TestEntityASTRoundTripsAsJSONB(t *testing.T) {
	pool, _ := startEntityPostgres(t)
	ctx := context.Background()

	e := entities.Order()
	body, err := entities.Body(e)
	if err != nil {
		t.Fatalf("body: %v", err)
	}
	id := records.Hash(body)

	if _, err := pool.Exec(ctx,
		"INSERT INTO kernel.entity (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, string(body), id,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var gotID, gotVer string
	var gotBody []byte
	if err := pool.QueryRow(ctx,
		"SELECT id, body, version FROM kernel.entity WHERE id = $1", id).
		Scan(&gotID, &gotBody, &gotVer); err != nil {
		t.Fatalf("select: %v", err)
	}

	var parsed entities.Entity
	if err := json.Unmarshal(gotBody, &parsed); err != nil {
		t.Fatalf("parse from db: %v", err)
	}
	recanon, err := entities.Body(parsed)
	if err != nil {
		t.Fatalf("re-canonicalize: %v", err)
	}
	want := records.Hash(recanon)
	if gotID != want || gotVer != want {
		t.Fatalf("db id/version != content hash: id=%s version=%s want=%s", gotID, gotVer, want)
	}
	// attribute ORDER survives the round-trip (order is semantic).
	got := entities.AttributeSet(parsed)
	wantOrder := entities.AttributeSet(e)
	for i := range wantOrder {
		if got[i] != wantOrder[i] {
			t.Fatalf("attribute order lost: got %v want %v", got, wantOrder)
		}
	}
}

func TestEntityRejectsNonContentAddressedRow(t *testing.T) {
	pool, _ := startEntityPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		"INSERT INTO kernel.entity (id, body, version) VALUES ('abc', '{}'::jsonb, 'def')")
	if err == nil {
		t.Fatal("a row whose version != id must be refused by the content-address CHECK")
	}
}

func TestAgentRoleIsSelectOnlyOnEntity(t *testing.T) {
	adminPool, dsn := startEntityPostgres(t)
	ctx := context.Background()

	e := entities.Order()
	body, _ := entities.Body(e)
	id := records.Hash(body)
	if _, err := adminPool.Exec(ctx,
		"INSERT INTO kernel.entity (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, string(body), id,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoEntity(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	var gotID string
	if err := agentPool.QueryRow(ctx,
		"SELECT id FROM kernel.entity WHERE id = $1", id).Scan(&gotID); err != nil {
		t.Fatalf("agent SELECT should be allowed: %v", err)
	}

	writes := []struct{ name, sql string }{
		{"INSERT", "INSERT INTO kernel.entity (id, body, version) VALUES ('x', '{}'::jsonb, 'x')"},
		{"UPDATE", "UPDATE kernel.entity SET version = id WHERE id = $1"},
		{"DELETE", "DELETE FROM kernel.entity WHERE id = $1"},
	}
	for _, w := range writes {
		var execErr error
		if strings.Contains(w.sql, "$1") {
			_, execErr = agentPool.Exec(ctx, w.sql, id)
		} else {
			_, execErr = agentPool.Exec(ctx, w.sql)
		}
		if execErr == nil {
			t.Fatalf("the wall must reject %s on kernel.entity (agent role)", w.name)
		}
		if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
			t.Fatalf("%s rejected for the wrong reason: %v", w.name, execErr)
		}
	}
}

// swapUserInfoEntity rewrites the user:pass of a postgres DSN.
func swapUserInfoEntity(dsn, user, pass string) string {
	at := strings.Index(dsn, "@")
	scheme := strings.Index(dsn, "://")
	if at < 0 || scheme < 0 {
		return dsn
	}
	return dsn[:scheme+3] + user + ":" + pass + dsn[at:]
}
