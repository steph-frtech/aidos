package composes_test

// Property mirror (∀) for the recursive compositional-truth aggregate (KRD §108–§112).
// reflects=kernel.composes · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Aggregate — the
// recursive RULE itself is the human's, above the line, pinned by the fixture). Run via
// `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §109–§112:
//
//  1. THE LAW HOLDS AT EVERY NODE. Over every randomly generated finite composes DAG of layers
//     with per-node own_mirror ∈ {GREEN, RED}:
//        Aggregate(L)==GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child via composes(L): Aggregate(child)==GREEN.
//  2. MONOTONE REDDENING. Flipping any one reachable descendant's own_mirror GREEN→RED across a
//     load-bearing path never turns a previously RED ancestor GREEN; and once activation ≥ the
//     ancestor's threshold it turns the directly-affected ancestor RED.
//  3. COSMETIC ISOLATION. A change confined to cosmetic children with activation < threshold
//     leaves the parent's aggregate unchanged.
//  4. NO FABRICATION / TOTALITY. The aggregate reads only declared edges/weights/thresholds; on
//     a cycle it returns the typed *CycleError, never recurses forever, never invents an edge;
//     on a DAG it never panics and always returns a verdict ∈ {GREEN, RED}.

import (
	"errors"
	"fmt"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/composes"
	"pgregory.net/rapid"
)

// genDAG draws a random finite DAG over n nodes id "n0".."n{n-1}": an edge i→j is only ever
// added with i < j, which guarantees acyclicity by construction (a topological pre-order). Each
// node draws its own_mirror ∈ {GREEN, RED}; each edge draws a weight ∈ {load-bearing, cosmetic};
// each node's threshold is drawn from the declared set. This builds the universe of DAGs the law
// must hold over — the agent invents no edge outside what is declared in the drawn structure.
func genDAG(t *rapid.T) (composes.Tree, []string) {
	n := rapid.IntRange(1, 6).Draw(t, "n")
	ids := make([]string, n)
	nodes := make(map[string]composes.Node, n)
	for i := 0; i < n; i++ {
		id := fmt.Sprintf("n%d", i)
		ids[i] = id
		v := composes.VerdictGreen
		if rapid.Bool().Draw(t, "red-"+id) {
			v = composes.VerdictRed
		}
		thr := rapid.SampledFrom([]float64{0, 1.0, 2.0}).Draw(t, "thr-"+id)
		nodes[id] = composes.Node{LayerID: id, Version: "v1", OwnMirror: v, ActivationThreshold: thr}
	}
	var edges []composes.Composes
	for i := 0; i < n; i++ {
		for j := i + 1; j < n; j++ {
			if rapid.Bool().Draw(t, fmt.Sprintf("edge-%d-%d", i, j)) {
				w := composes.WeightLoadBearing
				if rapid.Bool().Draw(t, fmt.Sprintf("cosmetic-%d-%d", i, j)) {
					w = composes.WeightCosmetic
				}
				edges = append(edges, composes.Composes{
					Parent: composes.Ref{ID: ids[i], Version: "v1"},
					Child:  composes.Ref{ID: ids[j], Version: "v1"},
					Weight: w,
				})
			}
		}
	}
	return composes.Tree{Nodes: nodes, Edges: edges}, ids
}

// TestLawHoldsAtEveryNode — Aggregate(L)==GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child : Aggregate(child)==GREEN.
func TestLawHoldsAtEveryNode(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		tree, ids := genDAG(t)
		for _, id := range ids {
			res, err := composes.Aggregate(tree, id)
			if err != nil {
				t.Fatalf("aggregate on an acyclic DAG must not error at %s: %v", id, err)
			}
			// independently recompute the law at this node
			wantGreen := tree.Nodes[id].OwnMirror == composes.VerdictGreen
			for _, e := range tree.Edges {
				if e.Parent.ID != id {
					continue
				}
				cres, cerr := composes.Aggregate(tree, e.Child.ID)
				if cerr != nil {
					t.Fatalf("child aggregate must not error: %v", cerr)
				}
				if cres.Verdict != composes.VerdictGreen {
					wantGreen = false
				}
			}
			got := res.Verdict == composes.VerdictGreen
			if got != wantGreen {
				t.Fatalf("law violated at %s: Aggregate=%q, want green=%v", id, res.Verdict, wantGreen)
			}
		}
	})
}

// TestStatusRangeAndTotality — every node aggregates to GREEN or RED (never a third), never panics.
func TestStatusRangeAndTotality(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		tree, ids := genDAG(t)
		for _, id := range ids {
			res, err := composes.Aggregate(tree, id) // must not panic
			if err != nil {
				t.Fatalf("acyclic DAG must not error: %v", err)
			}
			switch res.Verdict {
			case composes.VerdictGreen, composes.VerdictRed:
			default:
				t.Fatalf("verdict out of range at %s: %q", id, res.Verdict)
			}
		}
	})
}

// TestMonotoneReddening — flipping any one node GREEN→RED never turns a previously RED ancestor
// GREEN (reddening is monotone — adding a defect can only redden, never heal).
func TestMonotoneReddening(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		tree, ids := genDAG(t)
		before := map[string]composes.Verdict{}
		for _, id := range ids {
			r, err := composes.Aggregate(tree, id)
			if err != nil {
				t.Fatalf("err: %v", err)
			}
			before[id] = r.Verdict
		}
		// flip one GREEN node to RED
		var flip string
		for _, id := range ids {
			if tree.Nodes[id].OwnMirror == composes.VerdictGreen {
				flip = id
				break
			}
		}
		if flip == "" {
			return // nothing green to flip
		}
		n := tree.Nodes[flip]
		n.OwnMirror = composes.VerdictRed
		tree.Nodes[flip] = n
		for _, id := range ids {
			r, err := composes.Aggregate(tree, id)
			if err != nil {
				t.Fatalf("err after flip: %v", err)
			}
			if before[id] == composes.VerdictRed && r.Verdict == composes.VerdictGreen {
				t.Fatalf("monotonicity violated: %s was RED, turned GREEN after a GREEN→RED flip of %s", id, flip)
			}
		}
	})
}

// TestCosmeticIsolationBelowThreshold — over a single parent with one cosmetic child changed and
// the parent's threshold above the cosmetic weight, the parent's aggregate equals its own mirror
// (the cosmetic change does not redden a green parent).
func TestCosmeticIsolationBelowThreshold(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// parent green own, one cosmetic green child, threshold strictly above cosmetic weight
		thr := rapid.SampledFrom([]float64{1.0, 2.0}).Draw(t, "thr")
		tree := composes.Tree{
			Nodes: map[string]composes.Node{
				"P": {LayerID: "P", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: thr},
				"K": {LayerID: "K", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 0},
			},
			Edges: []composes.Composes{
				{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "K", Version: "v1"}, Weight: composes.WeightCosmetic},
			},
			Changed: []string{"K"},
		}
		res, err := composes.Aggregate(tree, "P")
		if err != nil {
			t.Fatalf("err: %v", err)
		}
		if res.Verdict != composes.VerdictGreen {
			t.Fatalf("a cosmetic change below threshold must leave a green parent GREEN, got %q", res.Verdict)
		}
	})
}

// TestActivation_CosmeticContributesZero — §112: Activation sums only load-bearing weights of
// CHANGED children; a cosmetic change contributes 0.0, so it stays below any positive threshold
// and ReopensOnChange is false ("épingle un défaut, pas un changement").
func TestActivation_CosmeticContributesZero(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		thr := rapid.SampledFrom([]float64{1.0, 2.0}).Draw(t, "thr")
		tree := composes.Tree{
			Nodes: map[string]composes.Node{
				"P": {LayerID: "P", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: thr},
				"K": {LayerID: "K", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 0},
				"L": {LayerID: "L", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 0},
			},
			Edges: []composes.Composes{
				{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "K", Version: "v1"}, Weight: composes.WeightCosmetic},
				{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "L", Version: "v1"}, Weight: composes.WeightLoadBearing},
			},
			Changed: []string{"K"}, // only the cosmetic child changed
		}
		if got := composes.Activation(tree, "P"); got != 0.0 {
			t.Fatalf("a cosmetic-only change must yield activation 0.0, got %v", got)
		}
		if composes.ReopensOnChange(tree, "P") {
			t.Fatalf("a cosmetic change below threshold must NOT reopen the parent (§112)")
		}
		// flipping to the load-bearing child changing crosses a threshold of 1.0
		tree.Changed = []string{"L"}
		if got := composes.Activation(tree, "P"); got != 1.0 {
			t.Fatalf("a load-bearing change must contribute weight 1.0, got %v", got)
		}
		if thr <= 1.0 && !composes.ReopensOnChange(tree, "P") {
			t.Fatalf("a load-bearing change ≥ threshold %v must reopen the parent", thr)
		}
	})
}

// TestCycleYieldsTypedError — a deliberately cyclic graph yields the typed *CycleError, never a hang.
func TestCycleYieldsTypedError(t *testing.T) {
	tree := composes.Tree{
		Nodes: map[string]composes.Node{
			"a": {LayerID: "a", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 1.0},
			"b": {LayerID: "b", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 1.0},
			"c": {LayerID: "c", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 1.0},
		},
		Edges: []composes.Composes{
			{Parent: composes.Ref{ID: "a", Version: "v1"}, Child: composes.Ref{ID: "b", Version: "v1"}, Weight: composes.WeightLoadBearing},
			{Parent: composes.Ref{ID: "b", Version: "v1"}, Child: composes.Ref{ID: "c", Version: "v1"}, Weight: composes.WeightLoadBearing},
			{Parent: composes.Ref{ID: "c", Version: "v1"}, Child: composes.Ref{ID: "a", Version: "v1"}, Weight: composes.WeightLoadBearing},
		},
	}
	_, err := composes.Aggregate(tree, "a")
	if err == nil {
		t.Fatalf("a cycle must yield a typed error")
	}
	var cyc *composes.CycleError
	if !errors.As(err, &cyc) {
		t.Fatalf("want *composes.CycleError, got %T", err)
	}
}
