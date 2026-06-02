package scope_test

// Persistence mirror: reflects=kernel.scope-migration, test_kind=integration,
// liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S15
// truth-scope migration applied:
//   - kernel.truth gains a NULLABLE column scope jsonb (KRD §13.7);
//   - existing rows are untouched (a row inserted WITHOUT scope is valid: the column is
//     nullable — the expand-only contract; a non-active idea may be scope-less);
//   - a scope value object serialized by SerializeTruthBody round-trips into the jsonb
//     column and reads back identically (content-addressed body ⊇ scope);
//   - the agent role keeps SELECT-only on kernel.truth (the wall) — INSERT is refused.
//
// This is the end-to-end proof the migration applies (the Atlas Pro `migrate lint` is
// not available; the AIDOS convention proves migrations via Testcontainers on `go test`).

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startScopePostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply the S02 baseline then the S15 scope migration, in order (expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_truth_scope_baseline.sql",
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

// TestScopeColumnIsNullableAndExpandOnly — a pre-existing-style row (no scope supplied)
// inserts fine: the column is nullable, existing rows untouched, a non-active idea may
// be scope-less.
func TestScopeColumnIsNullableAndExpandOnly(t *testing.T) {
	pool := startScopePostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version) VALUES ('t-unscoped', '{"kind":"truth"}'::jsonb, 't-unscoped')`,
	); err != nil {
		t.Fatalf("insert unscoped truth (expand-only) should succeed: %v", err)
	}

	var raw *string
	if err := pool.QueryRow(ctx,
		"SELECT scope::text FROM kernel.truth WHERE id = 't-unscoped'").Scan(&raw); err != nil {
		t.Fatalf("select scope column: %v", err)
	}
	if raw != nil {
		t.Fatalf("expand-only: unscoped row should read NULL scope, got %v", *raw)
	}
}

// TestScopeRoundTrips — a serialized TruthScope round-trips through the jsonb column.
func TestScopeRoundTrips(t *testing.T) {
	pool := startScopePostgres(t)
	ctx := context.Background()

	s := scope.TruthScope{
		Region:      scope.RegionEU,
		Tenant:      "acme",
		Target:      scope.TargetMobile,
		UserSegment: scope.SegmentPremium,
		Environment: scope.EnvProd,
		TimeWindow:  scope.TimeWindow{From: "2026-01-01", To: "2026-12-31"},
	}
	body, err := scope.SerializeTruthBody(s)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	// Extract the scope sub-object to store in the projected column.
	var bodyMap map[string]json.RawMessage
	if err := json.Unmarshal(body, &bodyMap); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, scope) VALUES ('t-scoped', $1::jsonb, 't-scoped', $2::jsonb)`,
		string(body), string(bodyMap["scope"]),
	); err != nil {
		t.Fatalf("insert scoped truth should succeed: %v", err)
	}

	var raw string
	if err := pool.QueryRow(ctx,
		"SELECT scope::text FROM kernel.truth WHERE id = 't-scoped'").Scan(&raw); err != nil {
		t.Fatalf("select scope: %v", err)
	}
	var got scope.TruthScope
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatalf("unmarshal stored scope: %v", err)
	}
	if got != s {
		t.Fatalf("scope did not round-trip: got %+v want %+v", got, s)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT
// kernel.truth (incl. the new scope column) but never INSERT — truth-writes flow through
// the aidos CLI writer role, not the agent. aidos_agent + the SELECT grant + the write
// REVOKE are created by the S02 records baseline (already applied by startScopePostgres);
// this proves the new scope column inherits the wall (no GRANT was added by S15).
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startScopePostgres(t)
	ctx := context.Background()

	// aidos_agent SELECT on the new scope column works (SELECT-only is the wall).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT scope FROM kernel.truth LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.truth.scope must succeed: %v", err)
	}
	// aidos_agent INSERT is refused — the scope column did not open a write door.
	_, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; INSERT INTO kernel.truth (id, body, version, scope) VALUES ('x', '{\"kind\":\"truth\"}'::jsonb, 'x', '{\"region\":\"FR\"}'::jsonb); RESET ROLE")
	if err == nil {
		t.Fatalf("agent INSERT into kernel.truth must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
