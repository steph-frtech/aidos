package main

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Fault-injection mirror (DB level 2, Testcontainers + real Postgres). This is the
// proof the GRANTs hold, not just the hook (CLAUDE.md §5 hook-honesty — break what
// it watches, assert it fails closed):
//
//   - as the agent DB role (aidos_agent), an INSERT into a kernel/mirrors/fitness
//     table ⇒ a permission-denied SQL error (the wall, level 2);
//   - the same INSERT as the privileged aidos role ⇒ succeeds (the door to truth).
//
// We exercise the role boundary with SET ROLE inside one superuser connection,
// which applies the target role's GRANTs to subsequent statements — exactly the
// privilege a LOGIN agent role would carry.

func startWallPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
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

	// Apply the S02 kernel baseline (creates kernel/mirrors tables + roles) and the
	// S04 wall grants (fitness schema + REVOKEs). Order matters: S02 then S04.
	for _, mig := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/wall_grants_baseline.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}

// insertAsRole runs an INSERT into the given truth table under SET ROLE, in a
// transaction it always rolls back (append-only; we only probe the privilege).
func insertAsRole(ctx context.Context, pool *pgxpool.Pool, role, table string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+pgx.Identifier{role}.Sanitize()); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		"INSERT INTO "+table+" (id, body, version) VALUES ($1, $2::jsonb, $3)",
		"deadbeef", `{"probe":true}`, "deadbeef",
	)
	return err
}

func TestWallGrantsDenyAgentRole(t *testing.T) {
	ctx := context.Background()
	pool := startWallPostgres(t)

	truthTables := []string{"kernel.truth", "mirrors.mirror", "fitness.waterline"}

	for _, table := range truthTables {
		// Agent role: INSERT must be denied (permission-denied).
		err := insertAsRole(ctx, pool, "aidos_agent", table)
		if err == nil {
			t.Fatalf("WALL BREACH: aidos_agent INSERT into %s succeeded; the wall (level 2) failed", table)
		}
		if !strings.Contains(strings.ToLower(err.Error()), "permission denied") {
			t.Fatalf("aidos_agent INSERT into %s failed but not with permission-denied: %v", table, err)
		}
	}
}

func TestWallGrantsAllowAidosRole(t *testing.T) {
	ctx := context.Background()
	pool := startWallPostgres(t)

	truthTables := []string{"kernel.truth", "mirrors.mirror", "fitness.waterline"}

	for _, table := range truthTables {
		// aidos role: the same INSERT must succeed (the door to truth).
		if err := insertAsRole(ctx, pool, "aidos", table); err != nil {
			t.Fatalf("aidos INSERT into %s should succeed (it is the door to truth): %v", table, err)
		}
	}
}
