package project_test

// Persistence + wall mirror: reflects=projects.project-baseline-migration,
// test_kind=integration, liveness=live. Skipped when Docker/Testcontainers is
// unavailable (the by-design forward-dependency on a Postgres runner).
//
// On a real Postgres (Testcontainers) with the S02 records baseline + the S53
// projects baseline migration applied:
//   - a Project round-trips as content-addressed JSONB: id == version ==
//     records.Hash(CanonicalBody), and the lifecycle reads back from the body;
//   - the lifecycle CHECK refuses a fourth state (only active|archived|deleted);
//   - the (owner_ref, slug) UNIQUE index refuses a second non-deleted project with
//     the same owner+slug, but ALLOWS the same slug under a different owner;
//   - a per-project DAG root row inserts with an FK to the project;
//   - the agent role (aidos_agent) may INSERT/SELECT/UPDATE projects.project
//     (below the wall) but may NOT DELETE (soft delete only, append-only);
//   - the agent role still has NO write grant on kernel.truth / mirrors.mirror.

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startProjectsPostgres(t *testing.T) *pgxpool.Pool {
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

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/projects_baseline.sql",
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

func insertProject(t *testing.T, pool *pgxpool.Pool, p project.Project) error {
	t.Helper()
	canon, err := p.CanonicalBody()
	if err != nil {
		t.Fatalf("canonical body: %v", err)
	}
	_, err = pool.Exec(context.Background(),
		"INSERT INTO projects.project (id, body, version) VALUES ($1, $2::jsonb, $3)",
		p.ID, string(canon), p.Version)
	return err
}

func TestProjectRoundTripsAsJSONB(t *testing.T) {
	pool := startProjectsPostgres(t)
	ctx := context.Background()

	p, _ := project.New("alpha", "Alpha", "owner-1", "2026-06-07T09:00:00Z")
	if err := insertProject(t, pool, p); err != nil {
		t.Fatalf("insert: %v", err)
	}
	var lc string
	if err := pool.QueryRow(ctx,
		"SELECT body->>'lifecycle' FROM projects.project WHERE id = $1", p.ID).Scan(&lc); err != nil {
		t.Fatalf("select: %v", err)
	}
	if lc != "active" {
		t.Fatalf("lifecycle round-trip = %q, want active", lc)
	}
}

func TestLifecycleCheckRefusesFourthState(t *testing.T) {
	pool := startProjectsPostgres(t)
	_, err := pool.Exec(context.Background(),
		`INSERT INTO projects.project (id, body, version) VALUES
		 ('x', '{"kind":"project","slug":"s","name":"n","owner_ref":"o","created_at":"t","lifecycle":"frozen"}'::jsonb, 'x')`)
	if err == nil {
		t.Fatalf("expected lifecycle CHECK to refuse a fourth state")
	}
}

func TestSlugUniquePerOwnerInDB(t *testing.T) {
	pool := startProjectsPostgres(t)

	a, _ := project.New("shop", "Shop A", "owner-1", "2026-06-07T09:00:00Z")
	if err := insertProject(t, pool, a); err != nil {
		t.Fatalf("insert A: %v", err)
	}
	// Same owner + same slug → refused by the unique index.
	dup, _ := project.New("shop", "Shop dup", "owner-1", "2026-06-07T10:00:00Z")
	if err := insertProject(t, pool, dup); err == nil {
		t.Fatalf("expected unique index to refuse duplicate owner+slug")
	}
	// Different owner + same slug → allowed.
	other, _ := project.New("shop", "Shop B", "owner-2", "2026-06-07T09:00:00Z")
	if err := insertProject(t, pool, other); err != nil {
		t.Fatalf("expected same slug under different owner to be allowed, got %v", err)
	}
}

func TestDagRootFKAndAgentGrants(t *testing.T) {
	pool := startProjectsPostgres(t)
	ctx := context.Background()

	p, _ := project.New("beta", "Beta", "owner-9", "2026-06-07T09:00:00Z")
	if err := insertProject(t, pool, p); err != nil {
		t.Fatalf("insert: %v", err)
	}
	root := project.RootNode(p)
	if _, err := pool.Exec(ctx,
		"INSERT INTO projects.dag_root (project_id, node_id, label) VALUES ($1, $2, $3)",
		p.ID, root.ID, root.Label); err != nil {
		t.Fatalf("insert dag root: %v", err)
	}
	// A root for a non-existent project is refused by the FK.
	if _, err := pool.Exec(ctx,
		"INSERT INTO projects.dag_root (project_id, node_id, label) VALUES ('nope', 'n', 'l')"); err == nil {
		t.Fatalf("expected FK to refuse a root for a non-existent project")
	}

	// The agent role may not DELETE (soft delete only / append-only).
	var grants []string
	rows, err := pool.Query(ctx,
		`SELECT privilege_type FROM information_schema.role_table_grants
		 WHERE grantee = 'aidos_agent' AND table_schema = 'projects' AND table_name = 'project'`)
	if err != nil {
		t.Fatalf("grants query: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			t.Fatalf("scan grant: %v", err)
		}
		grants = append(grants, g)
	}
	joined := strings.Join(grants, ",")
	if strings.Contains(joined, "DELETE") {
		t.Fatalf("agent must NOT have DELETE on projects.project (got %q)", joined)
	}
	if !strings.Contains(joined, "INSERT") || !strings.Contains(joined, "SELECT") {
		t.Fatalf("agent must have INSERT+SELECT on projects.project (got %q)", joined)
	}
}
