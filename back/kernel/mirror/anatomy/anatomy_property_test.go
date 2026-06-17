package anatomy

import (
	"testing"

	"pgregory.net/rapid"
)

var declaredStates = []DeclaredState{Declared, DeclaredAbsent}
var provenStates = []ProvenState{ProvenPass, ProvenFail, ProvenPending, ProvenAbsent}

// drawStates draws a complete, valid set of the six pair states (one per closed kind).
func drawStates(t *rapid.T) []PairState {
	out := make([]PairState, 0, len(pairOrder))
	for _, k := range pairOrder {
		d := declaredStates[rapid.IntRange(0, len(declaredStates)-1).Draw(t, "d:"+string(k))]
		p := provenStates[rapid.IntRange(0, len(provenStates)-1).Draw(t, "p:"+string(k))]
		out = append(out, PairState{Kind: k, Declared: d, Proven: p})
	}
	return out
}

// TestComputeVoyant_ExhaustiveTruthTable pins the closed truth-table: RED iff declared∧fail,
// GREEN iff declared∧pass, AMBER everywhere else — deterministic and total.
func TestComputeVoyant_ExhaustiveTruthTable(t *testing.T) {
	for _, d := range declaredStates {
		for _, p := range provenStates {
			got := ComputeVoyant(d, p)
			var want Voyant
			switch {
			case d == Declared && p == ProvenPass:
				want = VoyantGreen
			case d == Declared && p == ProvenFail:
				want = VoyantRed
			default:
				want = VoyantAmber
			}
			if got != want {
				t.Fatalf("ComputeVoyant(%q,%q) = %q, want %q", d, p, got, want)
			}
		}
	}
}

// TestBuild_Deterministic is the reproducibility mirror: the same state ⇒ byte-identical anatomy
// (same voyants, same order, same hash); the six pairs are always present and ORDERED; the
// declared face is always ABOVE the wall ∧ the proven face BELOW; the overall is the worst of six.
func TestBuild_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		states := drawStates(t)
		a, err := Build("k-1", states)
		if err != nil {
			t.Fatalf("a complete valid state must build: %v", err)
		}
		// Determinism.
		b, _ := Build("k-1", states)
		if a.Hash() != b.Hash() {
			t.Fatalf("anatomy not deterministic: %q != %q", a.Hash(), b.Hash())
		}
		// Six pairs, canonical order.
		if len(a.Pairs) != 6 {
			t.Fatalf("must have six pairs: %d", len(a.Pairs))
		}
		for i, p := range a.Pairs {
			if p.Kind != pairOrder[i] {
				t.Fatalf("pair %d kind = %q, want %q (canonical order)", i, p.Kind, pairOrder[i])
			}
			if p.Declared.Side != SideAbove {
				t.Fatalf("declared face must be ABOVE the wall: %+v", p.Declared)
			}
			if p.Proven.Side != SideBelow {
				t.Fatalf("proven face must be BELOW the wall: %+v", p.Proven)
			}
		}
		// Counts sum to six.
		if a.Counts.Green+a.Counts.Red+a.Counts.Amber != 6 {
			t.Fatalf("counts must sum to six: %+v", a.Counts)
		}
		// Overall is the worst of the six.
		worst := VoyantGreen
		for _, p := range a.Pairs {
			if voyantRank(p.Voyant) > voyantRank(worst) {
				worst = p.Voyant
			}
		}
		if a.Overall != worst {
			t.Fatalf("overall = %q, want worst-of-six %q", a.Overall, worst)
		}
	})
}

// TestValidate_RejectsIncomplete pins the monster guards: empty id, unknown kind, duplicate,
// missing pair, invalid state are each refused (Build returns an error, no anatomy).
func TestValidate_RejectsIncomplete(t *testing.T) {
	full := func() []PairState {
		out := make([]PairState, 0, len(pairOrder))
		for _, k := range pairOrder {
			out = append(out, PairState{Kind: k, Declared: Declared, Proven: ProvenPass})
		}
		return out
	}
	if _, err := Build("", full()); err == nil {
		t.Fatal("empty kernel id must be refused")
	}
	missing := full()[:5]
	if _, err := Build("k", missing); err == nil {
		t.Fatal("a missing pair must be refused")
	}
	dup := append(full(), PairState{Kind: PairSpecDoc, Declared: Declared, Proven: ProvenPass})
	if _, err := Build("k", dup); err == nil {
		t.Fatal("a duplicate pair must be refused")
	}
	unknown := full()
	unknown[0].Kind = "ghost"
	if _, err := Build("k", unknown); err == nil {
		t.Fatal("an unknown pair kind must be refused")
	}
	bad := full()
	bad[0].Proven = "exploded"
	if _, err := Build("k", bad); err == nil {
		t.Fatal("an out-of-set proven state must be refused")
	}
}
