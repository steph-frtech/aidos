package changesetsrv

// End-to-end MCP smoke mirror: reflects=mcp.changeset, test_kind=integration, liveness=live.
//
// Spins up a throwaway Postgres (Testcontainers), applies S02 + S20 migrations, wires the server
// against the real changeset Store, and drives the canonical "add order discount" lifecycle through
// the MCP tool handlers — proving the capability door end-to-end:
//   open (DRAFT) → apply complete (APPLIED, applied_at set) → revert (NEW DRAFT inverse, source
//   stays APPLIED) → apply inverse (APPLIED) → discard a fresh DRAFT (removed). Plus the
//   incomplete-apply block (INCOMPLETE_CHANGESET).
//
// This mirror moved here verbatim from the old package-main binary when the handlers were extracted
// into this library (S59): it tests the SAME handlers, now reusable by both the stdio binary and the
// gateway dispatcher. Only the migration paths shifted (two dirs deeper) and the test is now an
// in-package test (package changesetsrv) so it drives the unexported handlers directly — exactly what
// it tested before.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startServer(t *testing.T) *server {
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
	for _, f := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/changesets_lifecycle_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	pool.Close()

	st, err := cs.NewStore(ctx, dsn)
	if err != nil {
		t.Fatalf("open changeset store: %v", err)
	}
	t.Cleanup(st.Close)
	// deterministic clock for the test.
	fixed := time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC)
	return &server{store: st, now: func() time.Time { return fixed }}
}

func TestMCP_FullLifecycle(t *testing.T) {
	s := startServer(t)
	ctx := context.Background()

	// open → DRAFT
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "add order discount", ParentPhase: "phase-7",
		SpecDelta:   &deltaIO{Kind: "add", Target: "Order.discount"},
		MirrorDelta: &deltaIO{Kind: "add", Target: "Order.discount.fixture"},
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if opened.Status != "DRAFT" {
		t.Fatalf("open status = %q, want DRAFT", opened.Status)
	}

	// apply (complete) → APPLIED with applied_at
	_, applied, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if applied.Blocked || applied.Status != "APPLIED" || applied.AppliedAt == "" {
		t.Fatalf("apply = %+v, want APPLIED with applied_at", applied)
	}

	// revert → NEW DRAFT inverse, reverts=source; source stays APPLIED
	_, rev, err := s.revert(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("revert: %v", err)
	}
	if rev.Blocked || rev.Reverts != opened.ID || rev.Status != "DRAFT" || rev.InverseID == opened.ID {
		t.Fatalf("revert = %+v, want a new DRAFT inverse reverting the source", rev)
	}
	_, srcStatus, err := s.status(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("status source: %v", err)
	}
	if srcStatus.Status != "APPLIED" {
		t.Fatalf("source status after revert = %q, want APPLIED (immutable, unchanged)", srcStatus.Status)
	}

	// apply the inverse → APPLIED
	_, invApplied, err := s.apply(ctx, nil, idInput{ID: rev.InverseID})
	if err != nil {
		t.Fatalf("apply inverse: %v", err)
	}
	if invApplied.Status != "APPLIED" {
		t.Fatalf("inverse apply status = %q, want APPLIED", invApplied.Status)
	}
}

func TestMCP_IncompleteApplyBlocked(t *testing.T) {
	s := startServer(t)
	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{
		Label: "spec without mirror", ParentPhase: "phase-7",
		SpecDelta: &deltaIO{Kind: "add", Target: "Order.discount"}, // NO mirror_delta
	})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, res, err := s.apply(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !res.Blocked || res.BlockCode != string(cs.CodeIncompleteChangeSet) {
		t.Fatalf("incomplete apply = %+v, want blocked INCOMPLETE_CHANGESET", res)
	}
}

func TestMCP_DiscardRemovesDraft(t *testing.T) {
	s := startServer(t)
	ctx := context.Background()
	_, opened, err := s.open(ctx, nil, openInput{Label: "throwaway", ParentPhase: "p"})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, res, err := s.discard(ctx, nil, idInput{ID: opened.ID})
	if err != nil {
		t.Fatalf("discard: %v", err)
	}
	if res.Status != "DISCARDED" {
		t.Fatalf("discard status = %q, want DISCARDED", res.Status)
	}
	if _, _, err := s.status(ctx, nil, idInput{ID: opened.ID}); err == nil {
		t.Fatal("a discarded DRAFT must be gone (status lookup should fail)")
	}
}
