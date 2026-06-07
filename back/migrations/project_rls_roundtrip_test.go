package migrations_test

// S55 RLS persistence mirror (LEVEL 2 of the project-aware wall). reflects=
// project_rls_baseline-migration · test_kind=integration · liveness=live. Skipped
// when Docker/Testcontainers is unavailable (by-design forward-dependency on a real
// Postgres runner).
//
// On a real Postgres (Testcontainers) with the records baseline + projects baseline
// + S54 project-scope migration + S55 RLS migration applied, this proves the S55
// done-criteria DIRECTLY against Postgres, acting as the FENCED aidos_agent role:
//
//   - PROJECT ISOLATION UNDER RLS: with app.project = A and app.identity set, the
//     agent sees ONLY project-A rows — a project-B row is invisible (independent of
//     the hook; this is the level-2 backstop);
//   - CROSS-PROJECT WRITE REFUSED: an INSERT/UPDATE targeting project B while scoped
//     to A is refused by the policy WITH CHECK (the AGENT_CROSS_PROJECT_WRITE the
//     hook also refuses — the two layers refuse the SAME op, independently);
//   - FORGED / MISSING IDENTITY: with app.project set but app.identity UNSET (a
//     forged gateway claim that never propagated a real identity), the agent sees
//     ZERO rows — the RLS keys on identity, not the project claim alone (S61 layer);
//   - FAULT-INJECTION INDEPENDENCE: dropping the RLS policy re-opens cross-project
//     reads (proving the RLS was the thing refusing) — the level-2 layer reddens on
//     its own, independent of the level-1 hook;
//   - IDEMPOTENT: re-running the RLS migration is a no-op.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startRLSPostgres(t *testing.T) (*pgxpool.Pool, string) {
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
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool new: %v", err)
	}
	t.Cleanup(pool.Close)

	files := []string{
		"kernel_records_baseline.sql",
		"projects_baseline.sql",
		"project_scope_baseline.sql",
		"project_rls_baseline.sql",
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

	// Grant the fenced agent role read/write on the ideas table so RLS — not a missing
	// GRANT — is what fences it (ideas is below-the-line; the agent legitimately writes
	// it within its project). The wall (kernel/mirrors) keeps SELECT-only via the
	// migration's REVOKEs.
	for _, stmt := range []string{
		"GRANT USAGE ON SCHEMA ideas TO aidos_agent",
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ideas.idea TO aidos_agent",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("grant ideas to agent: %v", err)
		}
	}

	// Two real projects A and B.
	for _, p := range []struct{ id, slug string }{{"proj-A", "alpha"}, {"proj-B", "beta"}} {
		body := `{"kind":"project","slug":"` + p.slug + `","name":"` + p.slug +
			`","owner_ref":"o","created_at":"2026-06-07T09:00:00Z","lifecycle":"active"}`
		if _, err := pool.Exec(ctx,
			"INSERT INTO projects.project (id, body, version) VALUES ($1,$2::jsonb,$1)", p.id, body); err != nil {
			t.Fatalf("insert project %s: %v", p.id, err)
		}
	}
	// One ideas row per project (owner role bypasses RLS for the fixture seed).
	for _, r := range []struct{ id, proj string }{{"row-A", "proj-A"}, {"row-B", "proj-B"}} {
		if _, err := pool.Exec(ctx,
			"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ($1,'{}'::jsonb,$1,$2)",
			r.id, r.proj); err != nil {
			t.Fatalf("seed idea %s: %v", r.id, err)
		}
	}
	return pool, dsn
}

// agentConn opens a connection as the fenced aidos_agent role with the two session
// GUCs set (or unset, to simulate a forged/missing claim). project=="" leaves
// app.project unset; identity=="" leaves app.identity unset.
func agentConn(t *testing.T, dsn, project, identity string) *pgx.Conn {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close(ctx) })
	// Act as the fenced role (SET ROLE applies RLS even on a superuser connection).
	if _, err := conn.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role: %v", err)
	}
	if project != "" {
		if _, err := conn.Exec(ctx, "SELECT set_config('app.project', $1, false)", project); err != nil {
			t.Fatalf("set app.project: %v", err)
		}
	}
	if identity != "" {
		if _, err := conn.Exec(ctx, "SELECT set_config('app.identity', $1, false)", identity); err != nil {
			t.Fatalf("set app.identity: %v", err)
		}
	}
	return conn
}

func countIdeas(t *testing.T, conn *pgx.Conn, where string) int {
	t.Helper()
	var n int
	q := "SELECT count(*) FROM ideas.idea"
	if where != "" {
		q += " WHERE " + where
	}
	if err := conn.QueryRow(context.Background(), q).Scan(&n); err != nil {
		t.Fatalf("count ideas (%s): %v", where, err)
	}
	return n
}

// TestRLSProjectIsolation: scoped to A with a propagated identity, the agent sees
// ONLY project-A rows — a project-B row is invisible (level-2 backstop, independent
// of the hook).
func TestRLSProjectIsolation(t *testing.T) {
	_, dsn := startRLSPostgres(t)
	conn := agentConn(t, dsn, "proj-A", "alice")

	total := countIdeas(t, conn, "")
	if total != 1 {
		t.Fatalf("A-scoped agent must see exactly 1 (its own) idea, saw %d", total)
	}
	if b := countIdeas(t, conn, "project_id = 'proj-B'"); b != 0 {
		t.Fatalf("RLS LEAKED a project-B row to an A-scoped agent (%d)", b)
	}
}

// TestRLSCrossProjectWriteRefused: an INSERT/UPDATE targeting project B while scoped
// to A is refused by the policy WITH CHECK — the same AGENT_CROSS_PROJECT_WRITE the
// hook refuses, enforced independently by Postgres.
func TestRLSCrossProjectWriteRefused(t *testing.T) {
	_, dsn := startRLSPostgres(t)
	conn := agentConn(t, dsn, "proj-A", "alice")
	ctx := context.Background()

	// Cross-project INSERT (row claims proj-B while scoped to proj-A) → refused.
	_, err := conn.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ('x','{}'::jsonb,'x','proj-B')")
	if err == nil {
		t.Fatal("RLS WITH CHECK must refuse a cross-project INSERT (proj-B while scoped to proj-A)")
	}

	// Same-project INSERT (proj-A) → allowed.
	if _, err := conn.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ('ok','{}'::jsonb,'ok','proj-A')"); err != nil {
		t.Fatalf("same-project INSERT must be allowed: %v", err)
	}
}

// TestRLSForgedIdentityRefused: app.project set to A but app.identity UNSET (a
// gateway claim that never propagated a real identity) sees ZERO rows — the RLS keys
// on identity, not the project claim alone (the S61 defense-in-depth fixture).
func TestRLSForgedIdentityRefused(t *testing.T) {
	_, dsn := startRLSPostgres(t)
	conn := agentConn(t, dsn, "proj-A", "") // project claimed, NO identity

	if n := countIdeas(t, conn, ""); n != 0 {
		t.Fatalf("a project claim WITHOUT a propagated identity must see ZERO rows, saw %d", n)
	}
}

// TestRLSNoScopeFailsClosed: neither GUC set → zero rows (fail-closed default).
func TestRLSNoScopeFailsClosed(t *testing.T) {
	_, dsn := startRLSPostgres(t)
	conn := agentConn(t, dsn, "", "")
	if n := countIdeas(t, conn, ""); n != 0 {
		t.Fatalf("no active scope must see ZERO rows, saw %d", n)
	}
}

// TestRLSFaultInjectionIndependent: DROP the RLS policy and the cross-project read
// re-opens — proving the RLS was the thing refusing (the level-2 layer reddens on
// its own, independent of the level-1 hook). This is the fault-injection criterion
// for the RLS layer.
func TestRLSFaultInjectionIndependent(t *testing.T) {
	pool, dsn := startRLSPostgres(t)
	ctx := context.Background()

	// Before fault injection: A-scoped agent sees only its row.
	conn := agentConn(t, dsn, "proj-A", "alice")
	if total := countIdeas(t, conn, ""); total != 1 {
		t.Fatalf("pre-injection A-scope must see 1, saw %d", total)
	}

	// Inject the fault: REMOVE the RLS guard on ideas.idea (owner role) — drop the
	// policy AND disable row security (a forced table with no policy denies all rows,
	// so removing the guard means disabling RLS, the realistic "the wall is gone" case).
	for _, stmt := range []string{
		"DROP POLICY IF EXISTS ideas_idea_project_rls ON ideas.idea",
		"ALTER TABLE ideas.idea NO FORCE ROW LEVEL SECURITY",
		"ALTER TABLE ideas.idea DISABLE ROW LEVEL SECURITY",
	} {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			t.Fatalf("inject fault (%s): %v", stmt, err)
		}
	}

	// A fresh agent connection now sees BOTH rows — the RLS was indeed the guard.
	conn2 := agentConn(t, dsn, "proj-A", "alice")
	if total := countIdeas(t, conn2, ""); total != 2 {
		t.Fatalf("after dropping RLS, A-scope should see all %d rows (proving RLS was the guard), saw %d", 2, total)
	}
}

// TestRLSMigrationIdempotent: re-running the RLS migration is a no-op (re-runnable).
func TestRLSMigrationIdempotent(t *testing.T) {
	pool, _ := startRLSPostgres(t)
	ctx := context.Background()
	mig, err := os.ReadFile("project_rls_baseline.sql")
	if err != nil {
		t.Fatalf("read RLS migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("re-apply RLS migration (idempotency): %v", err)
	}
}
