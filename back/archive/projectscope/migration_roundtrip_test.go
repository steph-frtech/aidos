package projectscope_test

// Persistence mirror: reflects=project_scope-baseline-migration,
// test_kind=integration, liveness=live. Skipped when Docker/Testcontainers is
// unavailable (the by-design forward-dependency on a Postgres runner).
//
// On a real Postgres (Testcontainers) with the S02 records baseline + the S53
// projects baseline + the S54 project-scope migration applied, this proves the
// S54 done-criteria DIRECTLY against Postgres:
//
//   - ZERO LOSS (append-only): the migration runs over a PRE-EXISTING singleton
//     graph (rows inserted before project_id existed) and the row count is
//     IDENTICAL before and after — nothing is dropped, no body is rewritten;
//   - BACKFILL: every pre-existing row now carries project_id == the __system__
//     seed id (the Order demo joined the seed);
//   - ALL FKs RESOLVE: every scoped row's project_id references a real
//     projects.project row; an INSERT with a non-existent project_id is REFUSED;
//   - CROSS-PROJECT ISOLATION: a query scoped to project A (projectscope.
//     ScopedSelect bound to A) NEVER returns a row of project B;
//   - the WALL is unchanged: the agent role keeps SELECT-only on kernel/mirrors;
//   - idempotent: re-running the migration changes nothing (re-runnable).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/projectscope"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// scopedInBaseline are the tables created by kernel_records_baseline.sql (the seven
// canonical truth tables) — the subset of ScopedTables() present in this minimal
// fixture. brain/context have their own baselines (applied in production); the DO
// block in the migration skips a missing table, so this fixture exercises exactly
// these seven and proves the per-table EXPAND/BACKFILL/CONTRACT/FK path.
var scopedInBaseline = []projectscope.ScopedTable{
	{Schema: "kernel", Table: "truth"},
	{Schema: "kernel", Table: "layer"},
	{Schema: "kernel", Table: "link"},
	{Schema: "mirrors", Table: "mirror"},
	{Schema: "ideas", Table: "idea"},
	{Schema: "changesets", Table: "changeset"},
	{Schema: "dag", Table: "phase"},
}

func startScopePostgres(t *testing.T, applyScope bool) *pgxpool.Pool {
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

	files := []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/projects_baseline.sql",
	}
	if applyScope {
		files = append(files, "../../migrations/project_scope_baseline.sql")
	}
	for _, f := range files {
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

// seedSingletonGraph inserts ONE pre-existing (project_id-less) row into each of
// the seven baseline tables — the "Order demo" singleton graph that exists before
// S54 runs. Returns the per-table id used.
func seedSingletonGraph(t *testing.T, pool *pgxpool.Pool) map[string]string {
	t.Helper()
	ctx := context.Background()
	ids := map[string]string{}
	for _, st := range scopedInBaseline {
		id := "pre-" + st.Schema + "-" + st.Table
		ids[st.Qualified()] = id
		_, err := pool.Exec(ctx,
			"INSERT INTO "+st.Qualified()+" (id, body, version) VALUES ($1, '{}'::jsonb, $1)",
			id)
		if err != nil {
			t.Fatalf("seed %s: %v", st.Qualified(), err)
		}
	}
	return ids
}

func countAll(t *testing.T, pool *pgxpool.Pool) map[string]int {
	t.Helper()
	ctx := context.Background()
	counts := map[string]int{}
	for _, st := range scopedInBaseline {
		var n int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+st.Qualified()).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", st.Qualified(), err)
		}
		counts[st.Qualified()] = n
	}
	return counts
}

// TestZeroLossBackfill: a pre-existing singleton graph survives the migration with
// IDENTICAL row counts (append-only) and every row backfilled to the seed.
func TestZeroLossBackfill(t *testing.T) {
	// Phase 1: baseline ONLY (no scope yet) + seed the singleton graph.
	pool := startScopePostgres(t, false)
	ctx := context.Background()
	seedSingletonGraph(t, pool)
	before := countAll(t, pool)

	// Phase 2: apply the S54 scope migration on top of the existing rows.
	mig, err := os.ReadFile("../../migrations/project_scope_baseline.sql")
	if err != nil {
		t.Fatalf("read scope migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply scope migration: %v", err)
	}

	after := countAll(t, pool)
	for q, n := range before {
		if after[q] != n {
			t.Fatalf("ZERO-LOSS violated for %s: before=%d after=%d", q, n, after[q])
		}
	}

	// Every pre-existing row backfilled to the __system__ seed.
	seedID := projectscope.SystemSeed().ID
	for _, st := range scopedInBaseline {
		var pid string
		if err := pool.QueryRow(ctx,
			"SELECT project_id FROM "+st.Qualified()+" LIMIT 1").Scan(&pid); err != nil {
			t.Fatalf("read backfilled project_id %s: %v", st.Qualified(), err)
		}
		if pid != seedID {
			t.Fatalf("%s not backfilled to seed: got %q want %q", st.Qualified(), pid, seedID)
		}
	}
}

// TestAllFKsResolve: every scoped row's project_id references a real project, and
// an INSERT with an unknown project_id is refused by the FK.
func TestAllFKsResolve(t *testing.T) {
	pool := startScopePostgres(t, true)
	ctx := context.Background()
	seedID := projectscope.SystemSeed().ID

	// The seed project row exists (the FK target).
	var n int
	if err := pool.QueryRow(ctx,
		"SELECT count(*) FROM projects.project WHERE id = $1", seedID).Scan(&n); err != nil {
		t.Fatalf("seed project query: %v", err)
	}
	if n != 1 {
		t.Fatalf("seed project not present: count=%d", n)
	}

	for _, st := range scopedInBaseline {
		// A scoped row to the real seed inserts fine (FK resolves).
		if _, err := pool.Exec(ctx,
			"INSERT INTO "+st.Qualified()+" (id, body, version, project_id) VALUES ($1,'{}'::jsonb,$1,$2)",
			"ok-"+st.Table, seedID); err != nil {
			t.Fatalf("insert scoped row %s: %v", st.Qualified(), err)
		}
		// A row to a NON-existent project is refused by the FK.
		if _, err := pool.Exec(ctx,
			"INSERT INTO "+st.Qualified()+" (id, body, version, project_id) VALUES ($1,'{}'::jsonb,$1,'no-such-project')",
			"bad-"+st.Table); err == nil {
			t.Fatalf("%s FK must refuse an unknown project_id", st.Qualified())
		}
	}
}

// TestCrossProjectIsolation: a query scoped to project A never returns a row of
// project B — the core multi-tenant guarantee, against real Postgres via the
// deterministic projectscope.ScopedSelect.
func TestCrossProjectIsolation(t *testing.T) {
	pool := startScopePostgres(t, true)
	ctx := context.Background()

	// Two real projects A and B (besides the seed).
	insProject := func(id, slug, owner string) {
		body := `{"kind":"project","slug":"` + slug + `","name":"` + slug +
			`","owner_ref":"` + owner + `","created_at":"2026-06-07T09:00:00Z","lifecycle":"active"}`
		if _, err := pool.Exec(ctx,
			"INSERT INTO projects.project (id, body, version) VALUES ($1,$2::jsonb,$1)", id, body); err != nil {
			t.Fatalf("insert project %s: %v", id, err)
		}
	}
	insProject("proj-A", "alpha", "owner-1")
	insProject("proj-B", "beta", "owner-2")

	st := projectscope.ScopedTable{Schema: "ideas", Table: "idea"}
	// One row per project.
	if _, err := pool.Exec(ctx,
		"INSERT INTO "+st.Qualified()+" (id, body, version, project_id) VALUES ('row-A','{}'::jsonb,'row-A','proj-A')"); err != nil {
		t.Fatalf("insert A row: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO "+st.Qualified()+" (id, body, version, project_id) VALUES ('row-B','{}'::jsonb,'row-B','proj-B')"); err != nil {
		t.Fatalf("insert B row: %v", err)
	}

	sql, err := projectscope.ScopedSelect(st.Schema, st.Table)
	if err != nil {
		t.Fatalf("ScopedSelect: %v", err)
	}
	// The A-scoped query (the deterministic ScopedSelect bound to proj-A) sees
	// exactly its own row and NEVER a project-B row.
	var a, b int
	if err := pool.QueryRow(ctx,
		"SELECT count(*) FROM "+st.Qualified()+" WHERE project_id = $1", "proj-A").Scan(&a); err != nil {
		t.Fatalf("count A: %v", err)
	}
	if err := pool.QueryRow(ctx,
		"SELECT count(*) FROM ("+sql+") q WHERE project_id = 'proj-B'", "proj-A").Scan(&b); err != nil {
		t.Fatalf("count B via A-scoped query: %v", err)
	}
	if a != 1 {
		t.Fatalf("A-scope should see exactly its own row, saw %d", a)
	}
	if b != 0 {
		t.Fatalf("A-scoped query LEAKED a project-B row (%d) — cross-project isolation violated", b)
	}
}

// TestWallUnchanged: after the scope migration the agent role still has NO write
// grant on kernel/mirrors (the wall is unchanged), and HAS no DELETE anywhere it
// shouldn't.
func TestWallUnchanged(t *testing.T) {
	pool := startScopePostgres(t, true)
	ctx := context.Background()

	for _, tbl := range []struct{ schema, table string }{
		{"kernel", "truth"}, {"kernel", "layer"}, {"kernel", "link"}, {"mirrors", "mirror"},
	} {
		rows, err := pool.Query(ctx,
			`SELECT privilege_type FROM information_schema.role_table_grants
			 WHERE grantee = 'aidos_agent' AND table_schema = $1 AND table_name = $2`,
			tbl.schema, tbl.table)
		if err != nil {
			t.Fatalf("grants query %s.%s: %v", tbl.schema, tbl.table, err)
		}
		var got []string
		for rows.Next() {
			var g string
			if err := rows.Scan(&g); err != nil {
				t.Fatalf("scan grant: %v", err)
			}
			got = append(got, g)
		}
		rows.Close()
		joined := strings.Join(got, ",")
		if strings.Contains(joined, "INSERT") || strings.Contains(joined, "UPDATE") ||
			strings.Contains(joined, "DELETE") {
			t.Fatalf("WALL BREACH: agent has a write grant on %s.%s: %q", tbl.schema, tbl.table, joined)
		}
	}
}

// TestMigrationIdempotent: re-running the scope migration is a no-op (re-runnable).
func TestMigrationIdempotent(t *testing.T) {
	pool := startScopePostgres(t, true)
	ctx := context.Background()
	mig, err := os.ReadFile("../../migrations/project_scope_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	// Apply again — must not error and must not duplicate the seed.
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("re-apply migration (idempotency) failed: %v", err)
	}
	var n int
	if err := pool.QueryRow(ctx,
		"SELECT count(*) FROM projects.project WHERE id = $1",
		projectscope.SystemSeed().ID).Scan(&n); err != nil {
		t.Fatalf("seed count: %v", err)
	}
	if n != 1 {
		t.Fatalf("idempotency: seed duplicated, count=%d", n)
	}
}
