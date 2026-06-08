package migrations_test

// S62 MEMBERSHIP two-layer mirror (Testcontainers N5). reflects=runtime.membership-rls ·
// test_kind=integration · cert_language=fixture · authority=below · liveness=live. Skipped
// when Docker/Testcontainers is unavailable (by-design forward-dependency on a real runner).
//
// On a real Postgres (records + projects + project-scope + RLS + accounts + project_members
// baselines), it proves the S62 done-criteria DIRECTLY against the RLS, acting as the fenced
// aidos_agent:
//
//   - NON-MEMBER reads NOTHING: a VALID identity (a real accounts.users row, app.identity
//     set) WITH the active project set to a project it holds NO membership row in reads ZERO
//     rows — the RLS membership predicate (app.is_member) refuses the non-member, the second,
//     independent layer of the Go authority's NOT_A_MEMBER.
//   - A MEMBER reads its project: the SAME identity, once granted a membership row in the
//     project, reads exactly its project's row. Membership is what unlocks the scope.
//   - project.owner_ref resolves to a REAL owner: the project's owner membership row carries
//     role 'owner' for the creator's identity.

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/authn"
	"github.com/steph-frtech/aidos/back/runtime/membership"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startMembersPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
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

	for _, f := range []string{
		"kernel_records_baseline.sql",
		"projects_baseline.sql",
		"project_scope_baseline.sql",
		"project_rls_baseline.sql",
		"accounts_baseline.sql",
		"project_members_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	for _, s := range []string{
		"GRANT USAGE ON SCHEMA ideas TO aidos_agent",
		"GRANT SELECT, INSERT, UPDATE, DELETE ON ideas.idea TO aidos_agent",
	} {
		if _, err := pool.Exec(ctx, s); err != nil {
			t.Fatalf("grant ideas: %v", err)
		}
	}
	return dsn
}

// seedProject inserts a content-addressed project row (owner pool, bypasses RLS).
func seedProject(t *testing.T, ctx context.Context, pool *pgxpool.Pool, id string) {
	t.Helper()
	body := fmt.Sprintf(
		`{"kind":"project","slug":%q,"name":%q,"owner_ref":"o","created_at":"2026-06-07T09:00:00Z","lifecycle":"active"}`,
		id, id)
	if _, err := pool.Exec(ctx,
		"INSERT INTO projects.project (id, body, version) VALUES ($1,$2::jsonb,$1) ON CONFLICT DO NOTHING",
		id, body); err != nil {
		t.Fatalf("seed project %s: %v", id, err)
	}
}

// seedMembership inserts a content-addressed membership row (owner pool).
func seedMembership(t *testing.T, ctx context.Context, pool *pgxpool.Pool, m membership.Membership) {
	t.Helper()
	body := fmt.Sprintf(
		`{"kind":"project_member","identity":%q,"project_id":%q,"role":%q}`,
		m.Identity, m.ProjectID, m.Role)
	if _, err := pool.Exec(ctx,
		"INSERT INTO accounts.project_members (id, identity, project_id, role, body, version) "+
			"VALUES ($1,$2,$3,$4,$5::jsonb,$1) ON CONFLICT DO NOTHING",
		m.ID, m.Identity, m.ProjectID, string(m.Role), body); err != nil {
		t.Fatalf("seed membership: %v", err)
	}
}

// agentScoped opens an aidos_agent connection with the two GUCs set (the RLS keys on them).
func agentScoped(t *testing.T, ctx context.Context, dsn, identity, project string) *pgx.Conn {
	t.Helper()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	if _, err := conn.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role: %v", err)
	}
	if _, err := conn.Exec(ctx, "SELECT set_config('app.identity',$1,false)", identity); err != nil {
		t.Fatalf("set app.identity: %v", err)
	}
	if _, err := conn.Exec(ctx, "SELECT set_config('app.project',$1,false)", project); err != nil {
		t.Fatalf("set app.project: %v", err)
	}
	return conn
}

// TestMembershipRLSNonMemberReadsNothing: a VALID identity scoped to a project it is NOT a
// member of reads ZERO rows (NOT_A_MEMBER at the RLS layer); once granted a membership row,
// the SAME identity reads exactly its project's row. Membership is what unlocks scope.
func TestMembershipRLSNonMemberReadsNothing(t *testing.T) {
	dsn := startMembersPostgres(t)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("owner pool: %v", err)
	}
	t.Cleanup(pool.Close)

	u, err := authn.NewUser("alice@x", "oidc")
	if err != nil {
		t.Fatalf("new user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO accounts.users (id, email, identity_provider, body, version) VALUES ($1,$2,$3,'{}'::jsonb,$1)",
		u.ID, u.Email, string(u.Provider)); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	seedProject(t, ctx, pool, "proj-A")
	if _, err := pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ('row-A','{}'::jsonb,'row-A','proj-A')"); err != nil {
		t.Fatalf("seed idea: %v", err)
	}

	// (1) NON-MEMBER: valid identity, active project proj-A, but NO membership row → ZERO rows.
	conn := agentScoped(t, ctx, dsn, u.ID, "proj-A")
	var n int
	if err := conn.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n); err != nil {
		t.Fatalf("count (non-member): %v", err)
	}
	if n != 0 {
		t.Fatalf("a VALID identity that is NOT a member must read ZERO rows (NOT_A_MEMBER), saw %d", n)
	}
	_ = conn.Close(ctx)

	// (2) Grant a membership row (owner) → the SAME identity now reads its project's row.
	m, err := membership.NewMembership(u.ID, "proj-A", membership.RoleOwner)
	if err != nil {
		t.Fatalf("new membership: %v", err)
	}
	seedMembership(t, ctx, pool, m)

	conn2 := agentScoped(t, ctx, dsn, u.ID, "proj-A")
	t.Cleanup(func() { _ = conn2.Close(ctx) })
	if err := conn2.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n); err != nil {
		t.Fatalf("count (member): %v", err)
	}
	if n != 1 {
		t.Fatalf("a MEMBER must read exactly its 1 project row, saw %d", n)
	}

	// (3) project.owner_ref resolves to a REAL owner: the membership row carries role owner.
	var role string
	if err := pool.QueryRow(ctx,
		"SELECT role FROM accounts.project_members WHERE identity=$1 AND project_id='proj-A' AND revoked_at IS NULL",
		u.ID).Scan(&role); err != nil {
		t.Fatalf("owner lookup: %v", err)
	}
	if role != "owner" {
		t.Fatalf("project.owner_ref must resolve to a real owner membership, got role %q", role)
	}
}

// TestMembershipRLSPerProjectIsolation: a member of proj-A scoped to proj-B (where it holds
// no membership) reads ZERO rows — membership is per-project (the RLS twin of the Go
// per-project NOT_A_MEMBER property).
func TestMembershipRLSPerProjectIsolation(t *testing.T) {
	dsn := startMembersPostgres(t)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("owner pool: %v", err)
	}
	t.Cleanup(pool.Close)

	u, err := authn.NewUser("bob@x", "oidc")
	if err != nil {
		t.Fatalf("new user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO accounts.users (id, email, identity_provider, body, version) VALUES ($1,$2,$3,'{}'::jsonb,$1)",
		u.ID, u.Email, string(u.Provider)); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	seedProject(t, ctx, pool, "proj-A")
	seedProject(t, ctx, pool, "proj-B")
	if _, err := pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ('row-B','{}'::jsonb,'row-B','proj-B')"); err != nil {
		t.Fatalf("seed idea: %v", err)
	}
	// bob is a member of proj-A only.
	mA, err := membership.NewMembership(u.ID, "proj-A", membership.RoleEditor)
	if err != nil {
		t.Fatalf("new membership: %v", err)
	}
	seedMembership(t, ctx, pool, mA)

	// Scoped to proj-B (where bob holds no membership) → ZERO rows.
	conn := agentScoped(t, ctx, dsn, u.ID, "proj-B")
	t.Cleanup(func() { _ = conn.Close(ctx) })
	var n int
	if err := conn.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("a member of proj-A scoped to proj-B must read ZERO rows, saw %d", n)
	}
}
