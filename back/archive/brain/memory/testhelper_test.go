package memory_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// startPgvectorPostgres spins up a throwaway Postgres WITH the pgvector extension available
// (the pgvector/pgvector image), applies the S30 + S31 brain migrations, and returns a ready pool.
// It is the real backend for the write-then-recall fixture's pgx run.
func startPgvectorPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"pgvector/pgvector:pg16",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(120*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start pgvector postgres: %v", err)
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

	// Prelude: the brain migrations re-assert the wall by REVOKEing writes on the truth schemas, so
	// those schemas must exist (in production they are created by the kernel/wall baselines applied
	// earlier in the chain). Create them empty here so the brain migration applies in isolation.
	if _, err := pool.Exec(ctx, `
		CREATE SCHEMA IF NOT EXISTS kernel;
		CREATE SCHEMA IF NOT EXISTS mirrors;
		CREATE SCHEMA IF NOT EXISTS fitness;`); err != nil {
		t.Fatalf("apply truth-schema prelude: %v", err)
	}

	for _, mig := range []string{
		"../../../migrations/brain_memory_item_baseline.sql",
		"../../../migrations/brain_memory_pgvector_baseline.sql",
	} {
		sql, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}
