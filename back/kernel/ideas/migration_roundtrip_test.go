package ideas_test

// Persistence + wall mirror: reflects=ideas.idea-lifecycle-migration,
// test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 records baseline + the S27
// ideas_lifecycle migration applied:
//   - an Idea round-trips as content-addressed JSONB: id == version ==
//     records.Hash(Canonicalize(i)), and the body reads back canonically;
//   - the lifecycle status CHECK refuses a sixth status (only the closed five);
//   - the agent role (aidos_agent) may INSERT/SELECT/UPDATE ideas.idea (staging
//     ABOVE the wall — capture and advance) but may NOT DELETE (a rejected idea is
//     kept, append-only/traced);
//   - the agent role still has NO write grant on kernel.truth / mirrors.mirror (the
//     wall holds — the asymmetry IS the contract).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startIdeasPostgres(t *testing.T) (*pgxpool.Pool, string) {
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

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/ideas_lifecycle_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool, dsn
}

// ideaRow builds the canonical content-addressed row for an Idea, with the lifecycle
// status carried in the body (the CHECK reads body->>'status').
func ideaRow(t *testing.T, i ideas.Idea) (id, body string) {
	t.Helper()
	canon, err := ideas.Canonicalize(i)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	id = records.Hash(canon)
	// The persisted body adds the lifecycle status (metadata) to the canonical
	// sketch; id stays the hash of the sketch (identity), per the package contract.
	b := `{"proposes":"` + string(i.Proposes) + `","intent":"` + i.Intent +
		`","provenance":{"source":"` + string(i.Provenance.Source) + `","detail":"` + i.Provenance.Detail +
		`"},"status":"` + string(i.Status) + `"}`
	return id, b
}

func TestIdeaRoundTripsAsJSONB(t *testing.T) {
	pool, _ := startIdeasPostgres(t)
	ctx := context.Background()

	i, _ := ideas.Capture(ideas.ProposesPolicy, "give regulars a discount",
		ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: "remise"})
	id, body := ideaRow(t, i)

	if _, err := pool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var gotStatus string
	if err := pool.QueryRow(ctx,
		"SELECT body->>'status' FROM ideas.idea WHERE id = $1", id).Scan(&gotStatus); err != nil {
		t.Fatalf("select: %v", err)
	}
	if gotStatus != "draft" {
		t.Fatalf("status round-trip = %q, want draft", gotStatus)
	}
}

func TestLifecycleStatusCheckRefusesSixthStatus(t *testing.T) {
	pool, _ := startIdeasPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		`INSERT INTO ideas.idea (id, body, version)
		 VALUES ('x', '{"status":"promoted"}'::jsonb, 'x')`)
	if err == nil {
		t.Fatal("a sixth status must be refused by the lifecycle CHECK (the closed five only)")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("expected a CHECK violation, got: %v", err)
	}
}

func TestAgentRoleCanCaptureAndAdvanceButNotDelete(t *testing.T) {
	adminPool, dsn := startIdeasPostgres(t)
	ctx := context.Background()

	agentDSN := strings.Replace(dsn, "://aidos:", "://aidos_agent:", 1)
	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'aidos'"); err != nil {
		t.Fatalf("grant login to agent: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	t.Cleanup(agentPool.Close)

	i, _ := ideas.Capture(ideas.ProposesPolicy, "discount",
		ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: "remise"})
	id, body := ideaRow(t, i)

	// INSERT (capture) — allowed above the wall.
	if _, err := agentPool.Exec(ctx,
		"INSERT INTO ideas.idea (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id); err != nil {
		t.Fatalf("agent INSERT on ideas.idea must be allowed (staging above the wall): %v", err)
	}
	// UPDATE (advance status grilled) — allowed.
	if _, err := agentPool.Exec(ctx,
		`UPDATE ideas.idea SET body = jsonb_set(body, '{status}', '"grilled"') WHERE id = $1`, id); err != nil {
		t.Fatalf("agent UPDATE (advance status) must be allowed: %v", err)
	}
	// DELETE — refused (a rejected idea is kept, append-only/traced).
	if _, err := agentPool.Exec(ctx, "DELETE FROM ideas.idea WHERE id = $1", id); err == nil {
		t.Fatal("agent DELETE on ideas.idea must be refused (rejected ideas are kept, never deleted)")
	}
}

func TestAgentRoleStillCannotWriteKernelOrMirrors(t *testing.T) {
	adminPool, dsn := startIdeasPostgres(t)
	ctx := context.Background()

	agentDSN := strings.Replace(dsn, "://aidos:", "://aidos_agent:", 1)
	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'aidos'"); err != nil {
		t.Fatalf("grant login: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	t.Cleanup(agentPool.Close)

	// The wall holds: the agent cannot write a kernel truth nor a mirror, even
	// though it may now write the ideas staging schema. The promotion path is the
	// aidos CLI role via /goal, gated by NO_MIRROR_NO_KERNEL.
	if _, err := agentPool.Exec(ctx,
		"INSERT INTO kernel.truth (id, body, version) VALUES ('t', '{}'::jsonb, 't')"); err == nil {
		t.Fatal("agent INSERT into kernel.truth must be refused (the wall)")
	}
	if _, err := agentPool.Exec(ctx,
		"INSERT INTO mirrors.mirror (id, body, version) VALUES ('m', '{}'::jsonb, 'm')"); err == nil {
		t.Fatal("agent INSERT into mirrors.mirror must be refused (the wall)")
	}
}
