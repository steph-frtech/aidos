package propagation_test

// Property mirror (∀) for the weighted, thresholded red propagation (KRD §112 + ADR 0018).
// reflects=kernel.propagation · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure FireParent /
// ValidateWeight; the §112 RULE itself is the human's, above the line, pinned by the fixture).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §112 + ADR 0018:
//
//  1. TOTALITY + DETERMINISM. For any graph + changed-set, FireParent returns exactly one of
//     {GREEN, RED}, never panics, and the same input always yields the same verdict.
//  2. COSMETIC-DOES-NOT-REDDEN. A changed-set confined to cosmetic children can never push the
//     activation ≥ a positive threshold (cosmetic activation is 0), so the parent stays GREEN.
//  3. NO CRITICAL ADMISSION WITHOUT EVIDENCE. A critical link with empty weight_evidence always
//     yields a non-empty BlockReason (CRITICAL_WEIGHT_WITHOUT_EVIDENCE); a critical link WITH
//     evidence, and any cosmetic/load-bearing link, is always accepted (nil).
//  4. MONOTONE TIER ORDERING. Activation(critical) ≥ Activation(load-bearing) ≥ Activation(cosmetic).

import (
	"fmt"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/propagation"
	"pgregory.net/rapid"
)

var allWeights = []propagation.Weight{
	propagation.WeightCosmetic,
	propagation.WeightLoadBearing,
	propagation.WeightCritical,
}

// genGraph draws a random single-parent composition: a parent "p" with a declared threshold and n
// children, each carrying a drawn weight; a random subset of children is marked changed. The
// agent invents no edge outside the drawn structure.
func genGraph(t *rapid.T) (propagation.Graph, []propagation.Weight) {
	n := rapid.IntRange(0, 6).Draw(t, "n")
	thr := rapid.SampledFrom([]float64{0, 1, 2}).Draw(t, "thr")
	edges := make([]propagation.Link, n)
	weights := make([]propagation.Weight, n)
	var changed []string
	for i := 0; i < n; i++ {
		w := rapid.SampledFrom(allWeights).Draw(t, fmt.Sprintf("w-%d", i))
		weights[i] = w
		child := fmt.Sprintf("c%d", i)
		edges[i] = propagation.Link{
			Parent: propagation.Ref{ID: "p", Version: "v1"},
			Child:  propagation.Ref{ID: child, Version: "v1"},
			Weight: w,
		}
		if rapid.Bool().Draw(t, fmt.Sprintf("changed-%d", i)) {
			changed = append(changed, child)
		}
	}
	g := propagation.Graph{
		Parents: map[string]propagation.Parent{
			"p": {LayerID: "p", Version: "v1", ActivationThreshold: thr},
		},
		Edges:   edges,
		Changed: changed,
	}
	return g, weights
}

// TestFireParentTotalAndDeterministic — always GREEN|RED, never panics, same input ⇒ same verdict.
func TestFireParentTotalAndDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g, _ := genGraph(t)
		v1 := propagation.FireParent(g, "p")
		v2 := propagation.FireParent(g, "p")
		if v1 != propagation.VerdictGreen && v1 != propagation.VerdictRed {
			t.Fatalf("verdict must be GREEN|RED, got %q", v1)
		}
		if v1 != v2 {
			t.Fatalf("FireParent must be deterministic: %q != %q", v1, v2)
		}
	})
}

// TestCosmeticDoesNotRedden — a change confined to cosmetic children never reddens a parent whose
// threshold exceeds the cosmetic activation (0).
func TestCosmeticDoesNotRedden(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		thr := rapid.SampledFrom([]float64{1, 2}).Draw(t, "thr") // positive threshold
		n := rapid.IntRange(0, 6).Draw(t, "n")
		edges := make([]propagation.Link, n)
		var changed []string
		for i := 0; i < n; i++ {
			child := fmt.Sprintf("c%d", i)
			edges[i] = propagation.Link{
				Parent: propagation.Ref{ID: "p", Version: "v1"},
				Child:  propagation.Ref{ID: child, Version: "v1"},
				Weight: propagation.WeightCosmetic, // ONLY cosmetic
			}
			if rapid.Bool().Draw(t, fmt.Sprintf("changed-%d", i)) {
				changed = append(changed, child)
			}
		}
		g := propagation.Graph{
			Parents: map[string]propagation.Parent{"p": {LayerID: "p", Version: "v1", ActivationThreshold: thr}},
			Edges:   edges,
			Changed: changed,
		}
		if v := propagation.FireParent(g, "p"); v != propagation.VerdictGreen {
			t.Fatalf("cosmetic-only changes must never redden a parent with threshold>0, got %q", v)
		}
	})
}

// TestNoCriticalAdmissionWithoutEvidence — a critical link without evidence is always rejected;
// any other admissible link is always accepted.
func TestNoCriticalAdmissionWithoutEvidence(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		w := rapid.SampledFrom(allWeights).Draw(t, "w")
		hasEvidence := rapid.Bool().Draw(t, "hasEvidence")
		ev := ""
		if hasEvidence {
			ev = rapid.StringMatching(`INC-[0-9]{4}-[0-9]{3}`).Draw(t, "ev")
		}
		br := propagation.ValidateWeight(propagation.Link{Weight: w, WeightEvidence: ev})
		if w == propagation.WeightCritical && ev == "" {
			if br == nil {
				t.Fatalf("a critical link without evidence must be rejected")
			}
			if br.Code != propagation.CodeCriticalWeightWithoutEvidence {
				t.Fatalf("rejection code must be %q, got %q", propagation.CodeCriticalWeightWithoutEvidence, br.Code)
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("a wall without a fix path is a prison: how_to_fix must be non-empty")
			}
		} else if br != nil {
			t.Fatalf("an admissible link (%q, evidence=%q) must be accepted, got block %+v", w, ev, br)
		}
	})
}

// TestMonotoneTierOrdering — Activation(critical) ≥ Activation(load-bearing) ≥ Activation(cosmetic).
func TestMonotoneTierOrdering(t *testing.T) {
	c := propagation.Activation(propagation.WeightCosmetic)
	l := propagation.Activation(propagation.WeightLoadBearing)
	cr := propagation.Activation(propagation.WeightCritical)
	if !(cr >= l && l >= c) {
		t.Fatalf("tier ordering must be monotone: critical(%g) ≥ load-bearing(%g) ≥ cosmetic(%g)", cr, l, c)
	}
	if !(cr > c) {
		t.Fatalf("critical must be strictly stronger than cosmetic")
	}
}
