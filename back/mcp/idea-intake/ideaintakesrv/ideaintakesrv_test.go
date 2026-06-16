package ideaintakesrv

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
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
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
		"../../../migrations/ideas_lifecycle_baseline.sql",
		// S53/S54: the live schema gives ideas.idea its project_id scope column
		// (the per-project inbox, S64). The store always reads it.
		"../../../migrations/projects_baseline.sql",
		"../../../migrations/project_scope_baseline.sql",
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
	return &server{store: NewStoreFromPool(pool), converter: markitdown.HTMLConverter{}}
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

// TestConvertToMarkdownCapturesIdeaWithProvenance is the MK03 integration mirror: reflects=
// mcp.idea-intake.convert_to_markdown, test_kind=integration, liveness=live. It drives the
// ingestion door end-to-end through the REAL ideas Store (Testcontainers Postgres): a fixture HTML
// document → markdown → a persisted idea draft with provenance, readable back via idea_status and
// the idea_list triage queue. THE WALL: the only schema touched is `ideas` (INSERT) — no kernel
// write exists anywhere on this path (there is no kernel grant on this server).
func TestConvertToMarkdownCapturesIdeaWithProvenance(t *testing.T) {
	s := startServer(t)
	ctx := context.Background()

	const fixture = `<html><head><title>Checkout Spec</title><style>x{}</style></head><body>
<nav>Home &gt; Specs</nav>
<h1>Checkout Service Specification</h1>
<p>The <strong>checkout</strong> behaviour.</p>
<ul><li>A cart line quantity is always strictly positive.</li></ul>
<footer>(c) 2026</footer>
</body></html>`

	_, out, err := s.convertToMarkdown(ctx, nil, convertInput{
		Content: fixture, Mime: "text/html", Source: "checkout-spec.html", Proposes: "policy",
	})
	if err != nil {
		t.Fatalf("convert_to_markdown: %v", err)
	}

	// The conversion did real work: the document's H1 survived as a markdown heading, chrome dropped.
	if !strings.Contains(out.Markdown, "# Checkout Service Specification") {
		t.Fatalf("markdown missing heading:\n%s", out.Markdown)
	}
	if strings.Contains(out.Markdown, "<script") || strings.Contains(out.Markdown, "Home &gt;") {
		t.Fatalf("chrome not stripped:\n%s", out.Markdown)
	}

	// The captured idea is a DRAFT (ingestion freezes nothing — the wall), with NO mirror.
	if out.Idea.Status != "draft" {
		t.Fatalf("idea status = %q, want draft", out.Idea.Status)
	}
	if out.Idea.HasMirror {
		t.Fatal("an ingested idea must have no mirror (the wall)")
	}
	// Provenance is PRESERVED: the source filename is kept verbatim, on the human on-ramp.
	if !strings.Contains(out.Idea.Detail, "checkout-spec.html") {
		t.Fatalf("provenance %q does not preserve the source", out.Idea.Detail)
	}
	if out.Idea.Source != "human" {
		t.Fatalf("provenance source = %q, want human", out.Idea.Source)
	}
	// The idea's intent IS the converted markdown (the document's substance becomes the candidate).
	if out.Idea.Intent != out.Markdown {
		t.Fatal("idea intent must be the converted markdown")
	}

	// It is PERSISTED and readable back via idea_status (round-trips through the real store).
	_, st, err := s.statusTool(ctx, nil, idInput{ID: out.Idea.ID})
	if err != nil {
		t.Fatalf("idea_status: %v", err)
	}
	if st.Status != "draft" || st.Detail != out.Idea.Detail {
		t.Fatalf("round-trip mismatch: %+v", st)
	}

	// It shows up in the draft lane of the triage queue.
	_, drafts, err := s.list(ctx, nil, listInput{Status: "draft"})
	if err != nil || len(drafts.Ideas) != 1 {
		t.Fatalf("draft lane: %v count=%d", err, len(drafts.Ideas))
	}

	// Re-ingesting the SAME document lands at the SAME id (content-addressed, idempotent door).
	_, out2, err := s.convertToMarkdown(ctx, nil, convertInput{
		Content: fixture, Mime: "text/html", Source: "checkout-spec.html", Proposes: "policy",
	})
	if err != nil {
		t.Fatalf("re-ingest: %v", err)
	}
	if out2.Idea.ID != out.Idea.ID {
		t.Fatalf("re-ingestion drifted: %q != %q", out2.Idea.ID, out.Idea.ID)
	}
}
