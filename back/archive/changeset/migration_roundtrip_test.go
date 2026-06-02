package changeset_test

// Persistence mirror: reflects=changesets.changeset-lifecycle, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline (which creates the
// changesets schema + changesets.changeset) + the S20 changesets_lifecycle migration applied:
//   - changesets.changeset_lifecycle exists with the status CHECK pinning the closed set
//     {DRAFT, APPLIED, REVERTED} — a FAILED status is REFUSED by the CHECK (the done criterion at
//     the persistence level: there is no FAILED);
//   - changesets.changeset_envelope exists as a VIEW joining the S02 body to the S20 lifecycle stamp;
//   - the migration is EXPAND-ONLY (it adds a new table + a view; the S02 changesets.changeset shape
//     is untouched — no ALTER);
//   - the lifecycle log is APPEND-ONLY: a status change (DRAFT→APPLIED→REVERTED) is a NEW version
//     row, and the agent role has SELECT-only (INSERT refused — the wall).
//
// This is the end-to-end proof the migration applies (AIDOS convention: Testcontainers on
// `go test`, the Atlas Pro `migrate lint` not being available).

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

func startChangesetPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply S02 baseline (creates the changesets schema + changesets.changeset) → S20 lifecycle.
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/changesets_lifecycle_baseline.sql",
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

// insertEnvelope stores a content-addressed envelope body in S02 changesets.changeset.
func insertEnvelope(t *testing.T, pool *pgxpool.Pool, id, body string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO changesets.changeset (id, body, version) VALUES ($1, $2::jsonb, $1)`, id, body); err != nil {
		t.Fatalf("insert envelope %s: %v", id, err)
	}
}

// TestFailedStatusRefusedByCheck — THE done criterion at the persistence level: the status CHECK
// refuses a FAILED stamp. There is NO FAILED.
func TestFailedStatusRefusedByCheck(t *testing.T) {
	pool := startChangesetPostgres(t)
	ctx := context.Background()
	insertEnvelope(t, pool, "cs-failed", `{"label":"x"}`)
	_, err := pool.Exec(ctx,
		`INSERT INTO changesets.changeset_lifecycle (id, status, version) VALUES ('cs-failed', 'FAILED', 'v1')`)
	if err == nil {
		t.Fatalf("a FAILED status MUST be refused by the status CHECK — there is no FAILED")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestDraftHasNoAppliedAt — the applied_at-iff-committed CHECK: a DRAFT must have NULL applied_at.
func TestDraftHasNoAppliedAt(t *testing.T) {
	pool := startChangesetPostgres(t)
	ctx := context.Background()
	insertEnvelope(t, pool, "cs-draft", `{"label":"d"}`)
	if _, err := pool.Exec(ctx,
		`INSERT INTO changesets.changeset_lifecycle (id, status, version) VALUES ('cs-draft', 'DRAFT', 'v1')`); err != nil {
		t.Fatalf("a DRAFT with NULL applied_at must insert: %v", err)
	}
	_, err := pool.Exec(ctx,
		`INSERT INTO changesets.changeset_lifecycle (id, status, applied_at, version) VALUES ('cs-draft', 'DRAFT', now(), 'v2')`)
	if err == nil {
		t.Fatalf("a DRAFT with a non-null applied_at MUST be refused by the CHECK")
	}
}

// TestAppendOnlyLifecycle_DRAFT_APPLIED_REVERTED — a status change is a NEW version row; the log
// strictly grows (append-only). The envelope view surfaces the latest stamp.
func TestAppendOnlyLifecycle_DRAFT_APPLIED_REVERTED(t *testing.T) {
	pool := startChangesetPostgres(t)
	ctx := context.Background()
	insertEnvelope(t, pool, "cs-A", `{"label":"add order discount","spec_delta":{"kind":"add"},"mirror_delta":{"kind":"add"}}`)

	for _, row := range []struct {
		status  string
		applied bool
		version string
	}{
		{"DRAFT", false, "v1"},
		{"APPLIED", true, "v2"},
		{"REVERTED", true, "v3"},
	} {
		appliedExpr := "NULL"
		if row.applied {
			appliedExpr = "now()"
		}
		if _, err := pool.Exec(ctx,
			`INSERT INTO changesets.changeset_lifecycle (id, status, applied_at, version) VALUES ('cs-A', $1, `+appliedExpr+`, $2)`,
			row.status, row.version); err != nil {
			t.Fatalf("append lifecycle row %s: %v", row.status, err)
		}
	}
	var count int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM changesets.changeset_lifecycle WHERE id = 'cs-A'`).Scan(&count); err != nil {
		t.Fatalf("count lifecycle rows: %v", err)
	}
	if count != 3 {
		t.Fatalf("append-only log length = %d, want 3 (every stamp appends, never overwrites)", count)
	}
	// the envelope view surfaces the spec+mirror pair from the ONE body.
	var label string
	var hasSpec, hasMirror bool
	if err := pool.QueryRow(ctx,
		`SELECT label, spec_delta IS NOT NULL, mirror_delta IS NOT NULL FROM changesets.changeset_envelope WHERE id = 'cs-A' LIMIT 1`).
		Scan(&label, &hasSpec, &hasMirror); err != nil {
		t.Fatalf("select envelope view: %v", err)
	}
	if label != "add order discount" || !hasSpec || !hasMirror {
		t.Fatalf("envelope view did not surface the atomic spec+mirror pair: label=%q spec=%v mirror=%v", label, hasSpec, hasMirror)
	}
}

// TestExpandOnly_PriorChangesetTableUntouched — the S02 changesets.changeset shape is unaltered.
func TestExpandOnly_PriorChangesetTableUntouched(t *testing.T) {
	pool := startChangesetPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO changesets.changeset (id, body, version) VALUES ('cs-orig', '{"label":"orig"}'::jsonb, 'cs-orig')`); err != nil {
		t.Fatalf("S02 changesets.changeset must still accept its original shape (expand-only): %v", err)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT the new table + the
// view but never INSERT — the lifecycle table opens no write door for the agent.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startChangesetPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM changesets.changeset_lifecycle LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on changesets.changeset_lifecycle must succeed: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM changesets.changeset_envelope LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on changesets.changeset_envelope view must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO changesets.changeset_lifecycle (id, status, version) VALUES ('x', 'DRAFT', 'x'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into changesets.changeset_lifecycle must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
