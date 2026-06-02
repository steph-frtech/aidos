package main

// End-to-end MCP smoke mirror: reflects=mcp.idea-intake, test_kind=integration,
// liveness=live. Spins up a throwaway Postgres (Testcontainers), applies the S02 +
// S27 migrations, wires the server against the real ideas Store, and drives the
// canonical "order-discount-idea" lifecycle through the MCP tool handlers — proving
// the capability door end-to-end:
//   capture (draft, has_mirror=false) → grill → spike → harvest → reject (traced,
//   still present) → list (the triage queue). There is NO promote-to-kernel tool;
//   promotion is the /goal flow gated by NO_MIRROR_NO_KERNEL.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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
	t.Cleanup(pool.Close)
	return &server{store: NewStoreFromPool(pool)}
}

func TestIdeaIntakeLifecycleEndToEnd(t *testing.T) {
	s := startServer(t)
	ctx := context.Background()

	// capture (human provenance) → draft, no mirror.
	_, cap, err := s.capture(ctx, nil, captureInput{
		Proposes: "policy", Intent: "give regulars a discount",
		Source: "human", Detail: "finalement je veux une remise",
	})
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	if cap.Status != "draft" {
		t.Fatalf("status = %q, want draft", cap.Status)
	}
	if cap.HasMirror {
		t.Fatal("a captured idea must have no mirror (KRD §118)")
	}
	id := cap.ID

	// grill → spike → harvest.
	if _, g, err := s.grill(ctx, nil, idInput{ID: id}); err != nil || g.Status != "grilled" {
		t.Fatalf("grill: %v status=%v", err, g.Status)
	}
	if _, sp, err := s.spike(ctx, nil, idInput{ID: id}); err != nil || sp.Status != "spiking" {
		t.Fatalf("spike: %v status=%v", err, sp.Status)
	}
	if _, h, err := s.harvest(ctx, nil, idInput{ID: id}); err != nil || h.Status != "harvested" {
		t.Fatalf("harvest: %v status=%v", err, h.Status)
	}

	// read back the status.
	if _, st, err := s.statusTool(ctx, nil, idInput{ID: id}); err != nil || st.Status != "harvested" {
		t.Fatalf("status: %v status=%v", err, st.Status)
	}

	// an illegal transition is refused by the lifecycle (the mirror blocks it).
	if _, _, err := s.spike(ctx, nil, idInput{ID: id}); err == nil {
		t.Fatal("spike from harvested must be refused (illegal transition)")
	}

	// reject a second idea — traced, still present.
	_, cap2, _ := s.capture(ctx, nil, captureInput{
		Proposes: "policy", Intent: "duplicate discount", Source: "human", Detail: "encore une remise",
	})
	if _, r, err := s.reject(ctx, nil, rejectInput{ID: cap2.ID, Reason: "duplicates existing policy"}); err != nil {
		t.Fatalf("reject: %v", err)
	} else if r.Status != "rejected" || r.RejectReason != "duplicates existing policy" {
		t.Fatalf("reject not traced: %+v", r)
	}

	// list — the rejected idea is still present (kept, never deleted).
	_, all, err := s.list(ctx, nil, listInput{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(all.Ideas) != 2 {
		t.Fatalf("list returned %d ideas, want 2 (rejected idea kept)", len(all.Ideas))
	}
	// filter by rejected lane.
	_, rejected, err := s.list(ctx, nil, listInput{Status: "rejected"})
	if err != nil || len(rejected.Ideas) != 1 {
		t.Fatalf("rejected lane: %v count=%d", err, len(rejected.Ideas))
	}
}
