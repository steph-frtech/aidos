// capture_scoped_bdd_test.go — the S64 « Capturez votre idée » mirror (Godog N0 +
// Testcontainers N5). reflects=mcp.idea-intake.capture-scoped-human ·
// test_kind=acceptance/integration · cert_language=godog · authority=below ·
// liveness=live. Skipped when Docker/Testcontainers is unavailable (by-design
// forward-dependency on a real Postgres).
//
// It proves the S64 done-criterion DIRECTLY against Postgres: a human free-text idea,
// captured WITH its provenance and SCOPED to the active project, lands as a REAL draft
// `ideas` record and is then VISIBLE in that project's live inbox — and ONLY that
// project's inbox (the per-project inbox replacing the global fixture). The capture
// rides the same idea-intake MCP handler the Workbench server action calls; the
// project_id is the S54 scope column; the lifecycle (draft) is pure ideas.Capture. The
// wall (CLAUDE.md §2): the capture writes the `ideas` schema (staging above the line),
// NEVER the kernel — the fenced agent role is refused a kernel write independently.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/cucumber/godog"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func dockerAvailableS64() bool {
	if os.Getenv("DOCKER_HOST") != "" {
		return true
	}
	_, err := os.Stat("/var/run/docker.sock")
	return err == nil
}

// startScopedPostgres spins a throwaway Postgres, applies the S02 + S27 + S53 + S54
// migrations (records → ideas lifecycle → projects → project scope), and seeds the two
// test projects the FK on ideas.idea.project_id resolves to.
func startScopedPostgres(t *testing.T) *pgxpool.Pool {
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
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(pool.Close)
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/ideas_lifecycle_baseline.sql",
		"../../migrations/projects_baseline.sql",
		"../../migrations/project_scope_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	// Seed the two test projects the ideas.project_id FK resolves to. Below the wall,
	// content-addressed shape (the body is illustrative; only the id/FK matters here).
	for _, p := range []string{"proj-alpha", "proj-beta"} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO projects.project (id, body, version)
			 VALUES ($1, $2::jsonb, $1) ON CONFLICT (id) DO NOTHING`,
			p, fmt.Sprintf(`{"kind":"project","slug":%q,"name":%q,"owner_ref":"t","created_at":"1970-01-01T00:00:00Z","lifecycle":"active"}`, p, p)); err != nil {
			t.Fatalf("seed project %s: %v", p, err)
		}
	}
	return pool
}

type scopedState struct {
	srv      *server
	pool     *pgxpool.Pool
	captured ideaOutput
	captures map[string]ideaOutput // intent → captured output
	lastErr  error
}

func TestCaptureScopedBDD(t *testing.T) {
	if !dockerAvailableS64() {
		t.Skip("docker unavailable — by-design forward-dependency on a real Postgres runner")
	}
	ctx := context.Background()
	pool := startScopedPostgres(t)
	st := &scopedState{
		srv:      &server{store: NewStoreFromPool(pool), converter: markitdown.HTMLConverter{}},
		pool:     pool,
		captures: map[string]ideaOutput{},
	}

	suite := godog.TestSuite{
		Name: "idea-intake-capture-scoped",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Before(func(ctx context.Context, _ *godog.Scenario) (context.Context, error) {
				// A clean slate per scenario — the inbox assertions count exact rows.
				if _, err := pool.Exec(ctx, "DELETE FROM ideas.idea"); err != nil {
					return ctx, err
				}
				st.captures = map[string]ideaOutput{}
				st.captured = ideaOutput{}
				st.lastErr = nil
				return ctx, nil
			})

			sc.Step(`^an empty live ideas store$`, func() error {
				var n int
				if err := pool.QueryRow(ctx, "SELECT count(*) FROM ideas.idea").Scan(&n); err != nil {
					return err
				}
				if n != 0 {
					return fmt.Errorf("ideas store not empty: %d rows", n)
				}
				return nil
			})

			sc.Step(`^I capture the idea "([^"]*)" proposing "([^"]*)" for project "([^"]*)" with provenance "([^"]*)"$`,
				func(intent, proposes, project, provenance string) error {
					_, out, err := st.srv.capture(ctx, nil, captureInput{
						Proposes:  proposes,
						Intent:    intent,
						Source:    "human",
						Detail:    provenance,
						ProjectID: project,
					})
					if err != nil {
						return err
					}
					st.captured = out
					st.captures[intent] = out
					return nil
				})

			sc.Step(`^the captured idea has status "([^"]*)"$`, func(want string) error {
				if st.captured.Status != want {
					return fmt.Errorf("status = %q, want %q", st.captured.Status, want)
				}
				return nil
			})
			sc.Step(`^the captured idea has provenance source "([^"]*)"$`, func(want string) error {
				if st.captured.Source != want {
					return fmt.Errorf("provenance source = %q, want %q", st.captured.Source, want)
				}
				return nil
			})
			sc.Step(`^the captured idea is scoped to project "([^"]*)"$`, func(want string) error {
				if st.captured.ProjectID != want {
					return fmt.Errorf("project = %q, want %q", st.captured.ProjectID, want)
				}
				return nil
			})
			sc.Step(`^the captured idea carries no mirror$`, func() error {
				if st.captured.HasMirror {
					return fmt.Errorf("captured idea carries a mirror — an idea must not")
				}
				return nil
			})
			sc.Step(`^the captured idea provenance detail is "([^"]*)"$`, func(want string) error {
				if st.captured.Detail != want {
					return fmt.Errorf("provenance detail = %q, want %q", st.captured.Detail, want)
				}
				return nil
			})

			sc.Step(`^the live inbox of project "([^"]*)" contains the idea$`, func(project string) error {
				_, out, err := st.srv.list(ctx, nil, listInput{ProjectID: project})
				if err != nil {
					return err
				}
				for _, i := range out.Ideas {
					if i.ID == st.captured.ID && i.ProjectID == project {
						return nil
					}
				}
				return fmt.Errorf("idea %s not visible in inbox of %s", st.captured.ID, project)
			})

			sc.Step(`^the live inbox of project "([^"]*)" contains exactly (\d+) idea$`, func(project string, n int) error {
				_, out, err := st.srv.list(ctx, nil, listInput{ProjectID: project})
				if err != nil {
					return err
				}
				if len(out.Ideas) != n {
					return fmt.Errorf("inbox of %s has %d ideas, want %d", project, len(out.Ideas), n)
				}
				return nil
			})

			sc.Step(`^the live inbox of project "([^"]*)" does not contain the idea of project "([^"]*)"$`,
				func(project, otherProject string) error {
					other, ok := findByProject(st.captures, otherProject)
					if !ok {
						return fmt.Errorf("no captured idea for project %s", otherProject)
					}
					_, out, err := st.srv.list(ctx, nil, listInput{ProjectID: project})
					if err != nil {
						return err
					}
					for _, i := range out.Ideas {
						if i.ID == other.ID {
							return fmt.Errorf("inbox of %s leaks idea %s of %s", project, other.ID, otherProject)
						}
					}
					return nil
				})

			sc.Step(`^no kernel truth was written by the capture$`, func() error {
				// The fenced aidos_agent role has NO GRANT to write kernel.truth — prove
				// the capture path could never bypass the wall.
				if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
					return fmt.Errorf("set role: %w", err)
				}
				_, st.lastErr = pool.Exec(ctx,
					"INSERT INTO kernel.truth (id, version, body) VALUES ($1,$2,$3)", "t1", "v1", "{}")
				_, _ = pool.Exec(ctx, "RESET ROLE")
				if st.lastErr == nil {
					return fmt.Errorf("kernel write was NOT refused — the wall was bypassed")
				}
				if !strings.Contains(strings.ToLower(st.lastErr.Error()), "permission denied") {
					return fmt.Errorf("expected permission-denied, got: %v", st.lastErr)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"capture_scoped.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("idea-intake-capture-scoped Godog suite failed")
	}
}

func findByProject(captures map[string]ideaOutput, project string) (ideaOutput, bool) {
	for _, c := range captures {
		if c.ProjectID == project {
			return c, true
		}
	}
	return ideaOutput{}, false
}
