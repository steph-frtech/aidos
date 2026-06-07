package migrations_test

// S61 AUTH two-layer mirror (Godog N0 + Testcontainers N5). reflects=runtime.auth-login-
// session-scoped · test_kind=acceptance/integration · cert_language=godog · authority=
// below · liveness=live. Skipped when Docker/Testcontainers is unavailable (by-design
// forward-dependency on a real Postgres runner).
//
// On a real Postgres (records + projects + project-scope + RLS + accounts baselines), it
// proves the S61 done-criteria DIRECTLY against Postgres, acting as the fenced aidos_agent:
//
//   - GODOG login→session→scoped access: a verified user (accounts.users row, the
//     authn.NewUser content address) opens a session; with app.identity = that user AND
//     app.project = the project the user is scoped to, the agent reads its project's row;
//   - TWO INDEPENDENT LAYERS: a VALID identity at the gateway (app.identity set to a real
//     user) but WITHOUT the corresponding RLS scope (app.project = a project that
//     identity holds no row in) reads NOTHING — the RLS is a second, independent layer,
//     not a mirror of the gateway. A gateway that authenticated the user does not, by
//     itself, grant data access.

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/cucumber/godog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/authn"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startAccountsPostgres(t *testing.T) string {
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
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	// Grant the agent role read/write on ideas so RLS — not a missing GRANT — fences it.
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

type accState struct {
	dsn      string
	user     authn.User // the verified, content-addressed user (the session subject)
	conn     *pgx.Conn
	seen     int
	sessTok  string
	scopedTo string // the project this user holds a row in
}

func TestAccountsLoginSessionScopedBDD(t *testing.T) {
	dsn := startAccountsPostgres(t)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn) // owner pool: seeds + asserts (bypasses RLS)
	if err != nil {
		t.Fatalf("owner pool: %v", err)
	}
	t.Cleanup(pool.Close)

	st := &accState{dsn: dsn}

	suite := godog.TestSuite{
		Name: "accounts-login-session-scoped",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Step(`^a user authenticates via OIDC with email "([^"]*)" from provider "([^"]*)"$`,
				func(email, prov string) error {
					u, err := authn.NewUser(email, authn.IdentityProvider(prov))
					if err != nil {
						return err
					}
					st.user = u
					// Persist the content-addressed user row (auth zone, below the line).
					_, err = pool.Exec(ctx,
						"INSERT INTO accounts.users (id, email, identity_provider, body, version) "+
							"VALUES ($1,$2,$3,$4::jsonb,$1) ON CONFLICT (id) DO NOTHING",
						u.ID, u.Email, string(u.Provider),
						fmt.Sprintf(`{"kind":"user","email":%q,"identity_provider":%q}`, u.Email, u.Provider))
					return err
				})
			sc.Step(`^the gateway opens a session for the user$`, func() error {
				st.sessTok = "tok-" + st.user.ID[:8]
				_, err := pool.Exec(ctx,
					"INSERT INTO accounts.sessions (token_id, user_id, expires_at) VALUES ($1,$2, now()+interval '1 hour')",
					st.sessTok, st.user.ID)
				return err
			})
			sc.Step(`^a project "([^"]*)" the user is scoped to with one idea row$`, func(proj string) error {
				st.scopedTo = proj
				if _, err := pool.Exec(ctx,
					"INSERT INTO projects.project (id, body, version) VALUES ($1,$2::jsonb,$1)",
					proj, `{"kind":"project","slug":"s","name":"n","owner_ref":"o","created_at":"2026-06-07T09:00:00Z","lifecycle":"active"}`); err != nil {
					return err
				}
				_, err := pool.Exec(ctx,
					"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ($1,'{}'::jsonb,$1,$2)",
					"idea-"+proj, proj)
				return err
			})
			sc.Step(`^the propagated identity and active project key the RLS$`, func() error {
				conn, err := pgx.Connect(ctx, st.dsn)
				if err != nil {
					return err
				}
				st.conn = conn
				if _, err := conn.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
					return err
				}
				// BOTH GUCs — the same identity the gateway verified (authn.Principal.GUCs).
				g := st.user.AsPrincipal().GUCs()
				if _, err := conn.Exec(ctx, "SELECT set_config('app.identity',$1,false)", g.Identity); err != nil {
					return err
				}
				_, err = conn.Exec(ctx, "SELECT set_config('app.project',$1,false)", st.scopedTo)
				return err
			})
			sc.Step(`^the agent reads its project's idea$`, func() error {
				if err := st.conn.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&st.seen); err != nil {
					return err
				}
				if st.seen != 1 {
					return fmt.Errorf("scoped agent must read exactly its 1 idea, saw %d", st.seen)
				}
				_ = st.conn.Close(ctx)
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"testdata/accounts-login-session-scoped.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("accounts-login-session-scoped Godog suite failed")
	}
}

// TestAuthValidIdentityNoRLSRowReadsNothing: the FIXTURE done-criterion — a VALID identity
// at the gateway (a real, verified user; app.identity set to its subject) but WITHOUT the
// corresponding RLS scope (app.project = a project the user holds NO row in) reads NOTHING.
// The RLS is a second, INDEPENDENT layer: authenticating the user at the gateway does not,
// by itself, grant data access — the two layers redden independently (S61 two-layer).
func TestAuthValidIdentityNoRLSRowReadsNothing(t *testing.T) {
	dsn := startAccountsPostgres(t)
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("owner pool: %v", err)
	}
	t.Cleanup(pool.Close)

	// A real verified user (valid identity at the gateway).
	u, err := authn.NewUser("alice@x", "oidc")
	if err != nil {
		t.Fatalf("new user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO accounts.users (id, email, identity_provider, body, version) VALUES ($1,$2,$3,'{}'::jsonb,$1)",
		u.ID, u.Email, string(u.Provider)); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	// Two projects; alice's data lives in proj-A. proj-B exists but alice holds no row.
	for _, p := range []string{"proj-A", "proj-B"} {
		body := fmt.Sprintf(
			`{"kind":"project","slug":%q,"name":%q,"owner_ref":"o","created_at":"2026-06-07T09:00:00Z","lifecycle":"active"}`,
			p, p)
		if _, err := pool.Exec(ctx,
			"INSERT INTO projects.project (id, body, version) VALUES ($1,$2::jsonb,$1)",
			p, body); err != nil {
			t.Fatalf("seed project %s: %v", p, err)
		}
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version, project_id) VALUES ('row-A','{}'::jsonb,'row-A','proj-A')"); err != nil {
		t.Fatalf("seed idea: %v", err)
	}
	for _, s := range []string{
		"GRANT USAGE ON SCHEMA ideas TO aidos_agent",
		"GRANT SELECT ON ideas.idea TO aidos_agent",
	} {
		if _, err := pool.Exec(ctx, s); err != nil {
			t.Fatalf("grant: %v", err)
		}
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("agent connect: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close(ctx) })
	if _, err := conn.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
		t.Fatalf("set role: %v", err)
	}
	// VALID identity at the gateway, but scoped to proj-B (where alice holds no idea row).
	g := u.AsPrincipal().GUCs()
	if _, err := conn.Exec(ctx, "SELECT set_config('app.identity',$1,false)", g.Identity); err != nil {
		t.Fatalf("set app.identity: %v", err)
	}
	if _, err := conn.Exec(ctx, "SELECT set_config('app.project','proj-B',false)"); err != nil {
		t.Fatalf("set app.project: %v", err)
	}

	var n int
	if err := conn.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Fatalf("a valid identity WITHOUT the matching RLS scope must read ZERO rows (two layers), saw %d", n)
	}
}
