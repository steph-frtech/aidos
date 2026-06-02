package truthtyping_test

// Persistence mirror: reflects=kernel.truthtyping-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S14
// truth-typing migration applied:
//   - kernel.truth gains two NULLABLE columns truth_kind, verifiability_level;
//   - existing rows are untouched (a row inserted WITHOUT the typing columns is valid:
//     the columns are nullable — the expand-only contract);
//   - each of the seven §13.4 kinds and five §13.5 levels is accepted;
//   - an out-of-enum value is rejected by the CHECK constraint (a DB-level error, not a
//     silent string) — defense in depth alongside truthtyping.Classify.
//
// This is the end-to-end proof the migration applies (the Atlas Pro `migrate lint` is
// not available; the AIDOS convention proves migrations via Testcontainers on `go test`).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startTruthTypingPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply the S02 baseline then the S14 typing migration, in order (expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_truth_typing_baseline.sql",
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

// TestTypingColumnsAreNullableAndExpandOnly — a pre-existing-style row (no typing
// columns supplied) inserts fine: the columns are nullable, existing rows untouched.
func TestTypingColumnsAreNullableAndExpandOnly(t *testing.T) {
	pool := startTruthTypingPostgres(t)
	ctx := context.Background()

	// Insert a row WITHOUT the typing columns (mimics an existing, not-yet-typed truth).
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version) VALUES ('t-untyped', '{"kind":"truth"}'::jsonb, 't-untyped')`,
	); err != nil {
		t.Fatalf("insert untyped truth (expand-only) should succeed: %v", err)
	}

	var tk, vl *string
	if err := pool.QueryRow(ctx,
		"SELECT truth_kind, verifiability_level FROM kernel.truth WHERE id = 't-untyped'").
		Scan(&tk, &vl); err != nil {
		t.Fatalf("select typing columns: %v", err)
	}
	if tk != nil || vl != nil {
		t.Fatalf("expand-only: untyped row should read NULL/NULL, got %v/%v", tk, vl)
	}
}

// TestEveryEnumMemberAccepted — each of the seven kinds and five levels is accepted.
func TestEveryEnumMemberAccepted(t *testing.T) {
	pool := startTruthTypingPostgres(t)
	ctx := context.Background()

	for i, k := range truthtyping.Kinds() {
		id := "tk-" + string(k)
		if _, err := pool.Exec(ctx,
			`INSERT INTO kernel.truth (id, body, version, truth_kind) VALUES ($1, '{"kind":"truth"}'::jsonb, $1, $2)`,
			id, string(k),
		); err != nil {
			t.Fatalf("kind %q (#%d) should be accepted: %v", k, i, err)
		}
	}
	for i, l := range truthtyping.Levels() {
		id := "vl-" + string(l)
		if _, err := pool.Exec(ctx,
			`INSERT INTO kernel.truth (id, body, version, verifiability_level) VALUES ($1, '{"kind":"truth"}'::jsonb, $1, $2)`,
			id, string(l),
		); err != nil {
			t.Fatalf("level %q (#%d) should be accepted: %v", l, i, err)
		}
	}
}

// TestOutOfEnumRejectedByCheck — an out-of-enum value is a DB-level error, not a
// silent string (the CHECK constraint).
func TestOutOfEnumRejectedByCheck(t *testing.T) {
	pool := startTruthTypingPostgres(t)
	ctx := context.Background()

	cases := []struct {
		name, col, val string
	}{
		{"bad-kind", "truth_kind", "vibes"},
		{"bad-level", "verifiability_level", "maybe"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := pool.Exec(ctx,
				`INSERT INTO kernel.truth (id, body, version, `+c.col+`) VALUES ($1, '{"kind":"truth"}'::jsonb, $1, $2)`,
				c.name, c.val,
			)
			if err == nil {
				t.Fatalf("out-of-enum %s=%q must be rejected by CHECK, but it succeeded", c.col, c.val)
			}
			if !strings.Contains(strings.ToLower(err.Error()), "check") &&
				!strings.Contains(strings.ToLower(err.Error()), "constraint") {
				t.Fatalf("rejected for the wrong reason: %v", err)
			}
		})
	}
}
