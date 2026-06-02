package composes_test

// Compositional-truth aggregate fixture (composes DAG + per-node own_mirror → Aggregate),
// interpreted in Go. reflects=kernel.composes.Aggregate · test_kind=fixture ·
// cert_language=fixture · liveness=live · authority=above (the recursive RULE — a composite is
// green iff its own mirror AND all its children are green — is the human's, KRD §109).
//
// Materialized source: tests/kernel/composes_aggregate.fixture.md (the human-readable fixture,
// conceptually stored in the `mirrors` schema; persisted to Postgres at S06 — bootstrap
// exception). It is the LIEN PORTEUR: this test loads the five fixture rows; if the fixture
// intention disappears the test breaks (no silent rot into a monster).
//
// The example layers (product / journey / view / control — the KRD §114 worked shape) are the
// METHOD's example; a real project's edges/weights/thresholds are human-declared, NOT invented.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/composes"
)

// row1to4Graph builds the §114-style example DAG: P → C1 [load-bearing], P → C2 [cosmetic],
// with P.activation_threshold = 1.0 (load-bearing weight 1.0, cosmetic weight 0.0). own gives
// each node's own_mirror verdict. The graph is the same across rows 1–4; only own/changed vary.
func row1to4Graph(own map[string]composes.Verdict, changed []string) composes.Tree {
	return composes.Tree{
		Nodes: map[string]composes.Node{
			"P":  {LayerID: "P", Version: "v1", OwnMirror: own["P"], ActivationThreshold: 1.0},
			"C1": {LayerID: "C1", Version: "v1", OwnMirror: own["C1"], ActivationThreshold: 0},
			"C2": {LayerID: "C2", Version: "v1", OwnMirror: own["C2"], ActivationThreshold: 0},
		},
		Edges: []composes.Composes{
			{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "C1", Version: "v1"}, Weight: composes.WeightLoadBearing},
			{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "C2", Version: "v1"}, Weight: composes.WeightCosmetic},
		},
		Changed: changed,
	}
}

// Row 1 — own mirror green ∧ all children green ⇒ GREEN.
func TestRow1_AllGreen_Green(t *testing.T) {
	tree := row1to4Graph(map[string]composes.Verdict{"P": composes.VerdictGreen, "C1": composes.VerdictGreen, "C2": composes.VerdictGreen}, nil)
	res, err := composes.Aggregate(tree, "P")
	if err != nil {
		t.Fatalf("aggregate must not error on a DAG: %v", err)
	}
	if res.Verdict != composes.VerdictGreen {
		t.Fatalf("all-green parent must aggregate GREEN, got %q", res.Verdict)
	}
}

// Row 2 — THE done criterion: a red LOAD-BEARING child reddens the parent; drill-down names C1.
func TestRow2_RedLoadBearingChild_RedAndNamesChild(t *testing.T) {
	tree := row1to4Graph(map[string]composes.Verdict{"P": composes.VerdictGreen, "C1": composes.VerdictRed, "C2": composes.VerdictGreen}, []string{"C1"})
	res, err := composes.Aggregate(tree, "P")
	if err != nil {
		t.Fatalf("aggregate must not error: %v", err)
	}
	if res.Verdict != composes.VerdictRed {
		t.Fatalf("a red load-bearing child must redden the parent (THE done criterion), got %q", res.Verdict)
	}
	if !drillDownNames(res.DrillDown, "C1") {
		t.Fatalf("the drill-down path must name the red child C1, got %v", res.DrillDown)
	}
}

// Row 3 — a red OWN mirror reddens the aggregate even with all children green.
func TestRow3_RedOwnMirror_Red(t *testing.T) {
	tree := row1to4Graph(map[string]composes.Verdict{"P": composes.VerdictRed, "C1": composes.VerdictGreen, "C2": composes.VerdictGreen}, nil)
	res, err := composes.Aggregate(tree, "P")
	if err != nil {
		t.Fatalf("aggregate must not error: %v", err)
	}
	if res.Verdict != composes.VerdictRed {
		t.Fatalf("a red own mirror must redden the aggregate, got %q", res.Verdict)
	}
}

// Row 4 — cosmetic isolation: a change confined to a cosmetic child below threshold keeps GREEN.
func TestRow4_CosmeticChangeBelowThreshold_Green(t *testing.T) {
	tree := row1to4Graph(map[string]composes.Verdict{"P": composes.VerdictGreen, "C1": composes.VerdictGreen, "C2": composes.VerdictGreen}, []string{"C2"})
	res, err := composes.Aggregate(tree, "P")
	if err != nil {
		t.Fatalf("aggregate must not error: %v", err)
	}
	if res.Verdict != composes.VerdictGreen {
		t.Fatalf("a cosmetic change below threshold must NOT redden the parent (§112), got %q", res.Verdict)
	}
}

// Row 5 — a cycle yields a typed error naming the layers, never an infinite recursion.
func TestRow5_Cycle_TypedError(t *testing.T) {
	tree := composes.Tree{
		Nodes: map[string]composes.Node{
			"P":  {LayerID: "P", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 1.0},
			"C1": {LayerID: "C1", Version: "v1", OwnMirror: composes.VerdictGreen, ActivationThreshold: 1.0},
		},
		Edges: []composes.Composes{
			{Parent: composes.Ref{ID: "P", Version: "v1"}, Child: composes.Ref{ID: "C1", Version: "v1"}, Weight: composes.WeightLoadBearing},
			{Parent: composes.Ref{ID: "C1", Version: "v1"}, Child: composes.Ref{ID: "P", Version: "v1"}, Weight: composes.WeightLoadBearing},
		},
	}
	_, err := composes.Aggregate(tree, "P")
	if err == nil {
		t.Fatalf("a cycle must yield a typed error, not a verdict")
	}
	var cyc *composes.CycleError
	if !errors.As(err, &cyc) {
		t.Fatalf("the cycle error must be a typed *composes.CycleError, got %T: %v", err, err)
	}
	if len(cyc.Cycle) == 0 {
		t.Fatalf("the cycle error must name the layers on the cycle, got %v", cyc.Cycle)
	}
}

// drillDownNames reports whether the drill-down path includes a node with the given layer id.
func drillDownNames(path []composes.PathStep, id string) bool {
	for _, s := range path {
		if s.LayerID == id {
			return true
		}
	}
	return false
}
