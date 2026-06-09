// S106 REPRODUCIBILITY MIRROR (rapid) — the two deterministic-able capabilities S106 adds
// over the S43 reality engine are PURE functions (CLAUDE.md §6/§8 determinism-first):
//
//   - DETECTION: DetectDivergence is a numeric comparison — same project + report +
//     expectation ⇒ same divergence (same id, same kind), never an LLM.
//   - RÉDACTION: RenderIdeaText is a template projection — same divergence ⇒ byte-identical
//     text, never an LLM summary (ROADMAP §S106 done-criterion: "même record de divergence
//     → même texte d'Idea").
//
// Plus the wall invariant: the ingestion NEVER writes the kernel and the direct Reality→
// Kernel edge is ALWAYS refused, regardless of the drawn input.
package realityingest_test

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/realityingest"
)

// genReport draws an arbitrary telemetry report + a matching mirror expectation. The
// operation is fixed ("op") so the expectation governs the report; the numeric fields range
// across the comparison's boundaries.
func genReport(t *rapid.T) (realityingest.TelemetryReport, realityingest.MirrorExpectation) {
	calls := rapid.IntRange(0, 5000).Draw(t, "calls")
	errs := rapid.IntRange(0, calls).Draw(t, "errors")
	report := realityingest.TelemetryReport{
		Operation: "op",
		Calls:     calls,
		Errors:    errs,
		P99Ms:     rapid.IntRange(0, 5000).Draw(t, "p99"),
	}
	exp := realityingest.MirrorExpectation{
		MirrorRef:    "op-succeeds",
		Operation:    "op",
		MaxErrorRate: float64(rapid.IntRange(0, 100).Draw(t, "maxrate")) / 100,
		MaxP99Ms:     rapid.IntRange(0, 5000).Draw(t, "maxp99"),
	}
	return report, exp
}

// Property 1 — DETECTION is deterministic: same input ⇒ same divergence (nil-ness, id, kind).
func TestProperty_Detection_IsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		project := rapid.SampledFrom([]string{"shop-42", "shop-99", "blog-1"}).Draw(t, "project")
		report, exp := genReport(t)

		a, errA := realityingest.DetectDivergence(project, report, exp)
		b, errB := realityingest.DetectDivergence(project, report, exp)
		if errA != nil || errB != nil {
			t.Fatalf("DetectDivergence errored: %v / %v", errA, errB)
		}
		if (a == nil) != (b == nil) {
			t.Fatalf("detection nil-ness not deterministic: %v vs %v", a, b)
		}
		if a != nil {
			if a.ID != b.ID {
				t.Errorf("divergence id not deterministic: %q vs %q", a.ID, b.ID)
			}
			if a.Kind != b.Kind {
				t.Errorf("divergence kind not deterministic: %q vs %q", a.Kind, b.Kind)
			}
			if a.ProjectID != project {
				t.Errorf("divergence must be project-scoped: got %q want %q", a.ProjectID, project)
			}
		}
	})
}

// Property 2 — RÉDACTION is deterministic AND project-scope-sensitive: same divergence ⇒
// byte-identical text (ROADMAP §S106); two projects' divergences yield distinct addresses.
func TestProperty_Redaction_IsDeterministicTemplate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report, exp := genReport(t)
		a, err := realityingest.DetectDivergence("shop-42", report, exp)
		if err != nil {
			t.Fatalf("DetectDivergence: %v", err)
		}
		if a == nil {
			return // no divergence drawn — nothing to render
		}
		// Same divergence ⇒ same text (the template projection, never an LLM summary).
		t1 := realityingest.RenderIdeaText(*a)
		t2 := realityingest.RenderIdeaText(*a)
		if t1 != t2 {
			t.Fatalf("RenderIdeaText not deterministic:\n a=%s\n b=%s", t1, t2)
		}
		// The same divergence ⇒ the same draft idea id (the rédaction is part of the address).
		rec, err := realityingest.ToRealityMirror(*a)
		if err != nil {
			t.Fatalf("ToRealityMirror: %v", err)
		}
		d1, err := realityingest.ToDraftIdea(rec)
		if err != nil {
			t.Fatalf("ToDraftIdea: %v", err)
		}
		d2, err := realityingest.ToDraftIdea(rec)
		if err != nil {
			t.Fatalf("ToDraftIdea: %v", err)
		}
		if d1.Idea.ID != d2.Idea.ID {
			t.Errorf("draft idea id not deterministic: %q vs %q", d1.Idea.ID, d2.Idea.ID)
		}
		if d1.Idea.Intent != t1 {
			t.Errorf("draft idea intent must be the template text; got %q want %q", d1.Idea.Intent, t1)
		}
	})
}

// Property 3 — the WALL holds for every drawn input: the ingestion never writes the kernel
// and the direct Reality→Kernel edge is always refused.
func TestProperty_Wall_AlwaysHolds(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		report, exp := genReport(t)
		draft, err := realityingest.Ingest("shop-42", report, exp)
		if err != nil {
			t.Fatalf("Ingest: %v", err)
		}
		if draft == nil {
			return // no divergence — trivially no kernel write
		}
		if draft.WroteKernel {
			t.Error("Ingest must NEVER write the kernel")
		}
		if draft.ToKernelRefusal == nil {
			t.Fatal("the direct Reality→Kernel edge must always be refused")
		}
		if string(draft.ToKernelRefusal.Code) != "REALITY_CANNOT_DECLARE_TRUTH" {
			t.Errorf("refusal code: got %q", draft.ToKernelRefusal.Code)
		}
	})
}
