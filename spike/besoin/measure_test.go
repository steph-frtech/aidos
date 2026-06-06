// measure_test.go — THROWAWAY (EL01 spike). The falsifiable assertions + the reproducibility
// mirror. These tests ARE the spike's proof: the BesoinGraph backlog STRICTLY DOMINATES the flat
// prompt (the falsifiable claim), the verdict is COMPUTED (never declared), and the whole
// measurement is reproducible (determinism-first). No clock, no rng, no LLM.
package besoin

import "testing"

// TestVerdictIsGo — the spike's headline: on the S46 checkout, the BesoinGraph capture strictly
// dominates the flat prompt, so the necessity verdict is GO. If the BesoinGraph were NOT richer,
// this would fail and the track would (correctly) be NO-GO — the claim is FALSIFIABLE.
func TestVerdictIsGo(t *testing.T) {
	v := Decide()
	if !v.Go {
		t.Fatalf("expected GO (BesoinGraph should strictly dominate the flat prompt); rationale=%s", v.Rationale)
	}
}

// TestBacklogStrictlyRicher — the core falsifiable measurement: the architecturally-ordered backlog
// is strictly richer than the flat prompt on EVERY counted axis. Counts, not LLM judgment.
func TestBacklogStrictlyRicher(t *testing.T) {
	cmp := Compare("t", checkoutGraph(), checkoutFlat())

	if cmp.Flat.NumIdeas != 1 {
		t.Fatalf("flat prompt should yield exactly 1 undifferentiated candidate, got %d", cmp.Flat.NumIdeas)
	}
	if cmp.Graph.NumIdeas != 5 { // product, control, action, operation, entity (journey+view are NoEmit)
		t.Fatalf("graph should emit 5 mapping Ideas, got %d", cmp.Graph.NumIdeas)
	}
	if cmp.Graph.NoEmitSeeded != 2 { // journey + view seed anchors, emit nothing
		t.Fatalf("expected 2 NoEmit rungs seeding anchors, got %d", cmp.Graph.NoEmitSeeded)
	}
	if cmp.DeltaIdeas < MinIdeaGain {
		t.Fatalf("Idea gain %d below declared floor %d", cmp.DeltaIdeas, MinIdeaGain)
	}
	if !(cmp.DeltaResolved > 0 && cmp.DeltaFullyTyped > 0 && cmp.DeltaAnchored > 0) {
		t.Fatalf("graph must strictly dominate on resolved(+%d), typed(+%d), anchored(+%d)",
			cmp.DeltaResolved, cmp.DeltaFullyTyped, cmp.DeltaAnchored)
	}
	if !cmp.GraphOrdered || cmp.FlatOrdered {
		t.Fatalf("graph must be ordered (%v) and flat prompt unordered (%v)", cmp.GraphOrdered, cmp.FlatOrdered)
	}
}

// TestFlatPromptIsUntyped — the honest control: a single free-text box yields NO typed, resolved,
// or anchored Idea. This is what the wall forbids (prompt→code with everything guessed).
func TestFlatPromptIsUntyped(t *testing.T) {
	fl := Measure(EmitFromFlat(checkoutFlat()))
	if fl.NumResolved != 0 || fl.NumFullyTyped != 0 || fl.NumAnchored != 0 {
		t.Fatalf("flat prompt must yield 0 resolved/typed/anchored, got %d/%d/%d",
			fl.NumResolved, fl.NumFullyTyped, fl.NumAnchored)
	}
	if fl.Ordered {
		t.Fatalf("flat prompt is one blob, must not be ordered")
	}
}

// TestBacklogIsTopologicallyOrdered — "the doc follows the architecture": the emitted Ideas appear
// in the canonical §23 rung order, with strictly increasing topo rank. NoEmit rungs (journey/view)
// never appear in the Idea list, only in anchors_above.
func TestBacklogIsTopologicallyOrdered(t *testing.T) {
	bl := EmitFromGraph(checkoutGraph())
	wantOrder := []Rung{RungProduct, RungControl, RungAction, RungOperation, RungEntity}
	if len(bl.Items) != len(wantOrder) {
		t.Fatalf("expected %d ordered items, got %d", len(wantOrder), len(bl.Items))
	}
	for i, it := range bl.Items {
		if it.Rung != wantOrder[i] {
			t.Fatalf("item %d: expected rung %s, got %s", i, wantOrder[i], it.Rung)
		}
		if it.TopoRank != i {
			t.Fatalf("item %d: expected topo rank %d, got %d", i, i, it.TopoRank)
		}
		// journey/view must never be in the emitted Idea list.
		if it.Rung == RungJourney || it.Rung == RungView {
			t.Fatalf("NoEmit rung %s leaked into the Idea list", it.Rung)
		}
	}
	// the deepest mapping rung (entity) must carry anchors from product + the NoEmit journey/view.
	last := bl.Items[len(bl.Items)-1]
	hasJourney, hasView := false, false
	for _, a := range last.AnchorsAbove {
		if a == string(RungJourney) {
			hasJourney = true
		}
		if a == string(RungView) {
			hasView = true
		}
	}
	if !hasJourney || !hasView {
		t.Fatalf("entity Idea must carry NoEmit journey/view in anchors_above, got %v", last.AnchorsAbove)
	}
}

// TestReproducible — the reproducibility mirror (determinism-first §6/§8): same need → same
// comparison + same hashes + same verdict, replayed 100×. Pure function, no clock/rng/LLM.
func TestReproducible(t *testing.T) {
	first := Decide()
	for i := 0; i < 100; i++ {
		v := Decide()
		if v.Go != first.Go {
			t.Fatalf("run %d: verdict Go changed %v -> %v", i, first.Go, v.Go)
		}
		if v.Cmp.Graph.Hash != first.Cmp.Graph.Hash || v.Cmp.Flat.Hash != first.Cmp.Flat.Hash {
			t.Fatalf("run %d: hashes changed", i)
		}
		if v.Cmp.DeltaIdeas != first.Cmp.DeltaIdeas {
			t.Fatalf("run %d: DeltaIdeas changed %d -> %d", i, first.Cmp.DeltaIdeas, v.Cmp.DeltaIdeas)
		}
	}
	if !first.Reproducible {
		t.Fatalf("Decide must report reproducible")
	}
}

// TestGraphHashStable — content-addressing: the same graph/prompt hashes identically across calls,
// and two distinct captures of the same need differ (graph hash != flat hash).
func TestGraphHashStable(t *testing.T) {
	g := checkoutGraph()
	if g.Hash() != g.Hash() {
		t.Fatal("graph hash not stable")
	}
	p := checkoutFlat()
	if p.Hash() != p.Hash() {
		t.Fatal("flat hash not stable")
	}
	if g.Hash() == p.Hash() {
		t.Fatal("graph and flat capture must hash differently")
	}
}

// TestHarvestIsDraftNoTruth — the wall: the harvested lesson is a DRAFT Idea with NO mirror and NO
// frozen version (the double absence = a need, not a truth). It carries its OpenQuestions, never an
// invented fact. This is the falsifiable proof that harvest PROPOSES and never freezes.
func TestHarvestIsDraftNoTruth(t *testing.T) {
	d := Harvest()
	if d.HasMirror {
		t.Fatal("harvested Idea must have NO mirror (HARVEST_CANNOT_FREEZE)")
	}
	if d.HasVersion {
		t.Fatal("harvested Idea must have NO frozen version")
	}
	if d.Status != "draft" {
		t.Fatalf("harvested Idea must be draft, got %q", d.Status)
	}
	if d.ProvenanceKind != "human" {
		t.Fatalf("provenance must be human, got %q", d.ProvenanceKind)
	}
	if d.Intent == "" {
		t.Fatal("harvested Idea must carry the durable lesson")
	}
	if len(d.OpenQuestions) == 0 {
		t.Fatal("harvested Idea must declare its OpenQuestions, never an invented fact")
	}
}

// TestSortedRungsCanonical — the rung order is total + closed (no rung missing, none duplicated).
func TestSortedRungsCanonical(t *testing.T) {
	got := sortedRungs()
	want := []Rung{RungProduct, RungJourney, RungView, RungControl, RungAction, RungOperation, RungEntity}
	if len(got) != len(want) {
		t.Fatalf("expected %d rungs, got %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("rung %d: expected %s, got %s", i, want[i], got[i])
		}
	}
}
