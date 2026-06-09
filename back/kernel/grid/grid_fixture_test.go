package grid_test

// Fixture mirror for FK03 — the grille (niveau × facette → cell), the two axes of FKE-1.4.
// reflects=kernel.grid, test_kind=fixture, cert_language=go-fixture, liveness=live,
// authority=below (a means-test over Resolve/MarkStale/AffectedCells/Project — CLAUDE.md §8).
//
// The cases ARE the FK03 done-criteria, written before the code (red→green):
//
//   - LAW 1 — chaque vérité résout à une cellule (niveau, facette) DÉTERMINISTE.
//   - LAW 2 — un changement BAS marque les rungs source AU-DESSUS (couplage latéral, la verticale couple).
//   - LAW 3 — les facettes N'INTERAGISSENT PAS (axe orthogonal séparant).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/grid"
)

// ── LAW 1 — deterministic resolution to a single cell ──

func TestResolve_EveryTruthResolvesToOneDeterministicCell(t *testing.T) {
	c1, err := grid.Resolve(grid.RungOperation, facets.FacetSecurity)
	if err != nil {
		t.Fatalf("Resolve(operation, S): unexpected error %v", err)
	}
	if c1.Rung != grid.RungOperation || c1.Facet != facets.FacetSecurity {
		t.Fatalf("Resolve(operation, S) = %v, want operation×S", c1)
	}
	// Determinism: same coordinate ⇒ same cell, same hash.
	c2, _ := grid.Resolve(grid.RungOperation, facets.FacetSecurity)
	if c1.Hash() != c2.Hash() {
		t.Fatalf("Resolve not deterministic: %s != %s", c1.Hash(), c2.Hash())
	}
	if c1.Hash() == "" {
		t.Fatalf("cell hash empty")
	}
}

func TestResolve_DistinctCoordinatesDistinctCells(t *testing.T) {
	a, _ := grid.Resolve(grid.RungEntity, facets.FacetBudgets)
	b, _ := grid.Resolve(grid.RungEntity, facets.FacetReliability)
	if a.Hash() == b.Hash() {
		t.Fatalf("different facet on same rung collided: %s", a.Hash())
	}
	c, _ := grid.Resolve(grid.RungProduct, facets.FacetBudgets)
	if a.Hash() == c.Hash() {
		t.Fatalf("different rung on same facet collided: %s", a.Hash())
	}
}

func TestResolve_RefusesUnknownRung(t *testing.T) {
	if _, err := grid.Resolve(grid.Rung("saga"), facets.FacetFunctional); err == nil {
		t.Fatalf("Resolve(saga, F) should refuse an out-of-ladder rung")
	}
	// the transversal bands (invariant/policy) are NOT grid rungs.
	if _, err := grid.Resolve(grid.Rung("invariant"), facets.FacetFunctional); err == nil {
		t.Fatalf("Resolve(invariant, F) should refuse: invariant is the I facet, not a rung")
	}
}

func TestResolve_RefusesUnknownFacet(t *testing.T) {
	if _, err := grid.Resolve(grid.RungEntity, facets.Facet("Z")); err == nil {
		t.Fatalf("Resolve(entity, Z) should refuse an out-of-octuor facet")
	}
}

// ── LAW 2 — lateral coupling: a low change marks the source rungs above ──

func TestMarkStale_LowChangeMarksSourceRungsAbove(t *testing.T) {
	// A change at the BOTTOM (entity) marks every source rung above it stale, top-down.
	got := grid.MarkStale(grid.RungEntity)
	want := []grid.Rung{
		grid.RungProduct, grid.RungJourney, grid.RungView,
		grid.RungControl, grid.RungAction, grid.RungOperation,
	}
	if len(got) != len(want) {
		t.Fatalf("MarkStale(entity) = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("MarkStale(entity)[%d] = %q, want %q (top-down order)", i, got[i], want[i])
		}
	}
}

func TestMarkStale_MidChangeMarksOnlyAbove(t *testing.T) {
	// A change at action marks product, journey, view, control — NOT operation/entity below.
	got := grid.MarkStale(grid.RungAction)
	want := []grid.Rung{grid.RungProduct, grid.RungJourney, grid.RungView, grid.RungControl}
	if len(got) != len(want) {
		t.Fatalf("MarkStale(action) = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("MarkStale(action)[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	for _, r := range got {
		if r == grid.RungOperation || r == grid.RungEntity {
			t.Fatalf("MarkStale(action) wrongly marked a rung BELOW: %q", r)
		}
	}
}

func TestMarkStale_TopChangeMarksNothingAbove(t *testing.T) {
	// A change at the summit (product) has nothing above it — empty mark.
	if got := grid.MarkStale(grid.RungProduct); len(got) != 0 {
		t.Fatalf("MarkStale(product) = %v, want [] (product is the summit)", got)
	}
}

func TestMarkStale_NeverMarksTransversalBandOrTheChangedRung(t *testing.T) {
	got := grid.MarkStale(grid.RungOperation)
	for _, r := range got {
		if r == grid.RungOperation {
			t.Fatalf("MarkStale includes the changed rung itself: %q", r)
		}
		if r == grid.Rung("invariant") || r == grid.Rung("policy") {
			t.Fatalf("MarkStale crossed a transversal band: %q", r)
		}
	}
}

// ── LAW 3 — facet orthogonality: the facets do not interact ──

func TestAffectedCells_StaleCellsHoldTheFacetConstant(t *testing.T) {
	aff := grid.AffectedCells(grid.Change{Rung: grid.RungOperation, Facet: facets.FacetSecurity})
	if aff.Changed.Rung != grid.RungOperation || aff.Changed.Facet != facets.FacetSecurity {
		t.Fatalf("changed cell = %v, want operation×S", aff.Changed)
	}
	// every stale cell stays on the SAME facet (S) — the verticale couples, the facet is held.
	for _, c := range aff.StaleCells {
		if c.Facet != facets.FacetSecurity {
			t.Fatalf("stale cell %v left the changed facet S — the mark crossed a facet (forbidden)", c)
		}
	}
	// the stale rungs are exactly the 5 rungs above operation (product..action; operation depth=5).
	if len(aff.StaleRungs) != 5 {
		t.Fatalf("AffectedCells(operation,S) StaleRungs = %v, want the 5 rungs above operation", aff.StaleRungs)
	}
}

func TestAffectedCells_OtherFacetsUntouched(t *testing.T) {
	aff := grid.AffectedCells(grid.Change{Rung: grid.RungOperation, Facet: facets.FacetSecurity})
	// the seven OTHER facets are all listed as untouched — none equals S.
	if len(aff.UntouchedFacets) != 7 {
		t.Fatalf("UntouchedFacets = %v, want the 7 other facets", aff.UntouchedFacets)
	}
	for _, f := range aff.UntouchedFacets {
		if f == facets.FacetSecurity {
			t.Fatalf("the changed facet S appears among UntouchedFacets")
		}
		if !f.IsCanonical() {
			t.Fatalf("untouched facet %q is not canonical", f)
		}
	}
}

func TestProject_AChangeOnAnotherFacetLeavesThisColumnIdentical(t *testing.T) {
	// Two truths on facet B (budgets) at operation + entity, plus a truth on facet S.
	base := []grid.Truth{
		{ID: "t-op-B", Rung: grid.RungOperation, Facet: facets.FacetBudgets},
		{ID: "t-ent-B", Rung: grid.RungEntity, Facet: facets.FacetBudgets},
		{ID: "t-op-S", Rung: grid.RungOperation, Facet: facets.FacetSecurity},
	}
	colBefore := grid.Project(base, facets.FacetBudgets)

	// "Change" the S facet: add/replace a security truth. The B column must be byte-identical.
	changed := append([]grid.Truth{}, base...)
	changed = append(changed, grid.Truth{ID: "t-ent-S", Rung: grid.RungEntity, Facet: facets.FacetSecurity})
	colAfter := grid.Project(changed, facets.FacetBudgets)

	if len(colBefore.Truths) != 2 || len(colAfter.Truths) != 2 {
		t.Fatalf("B column should carry exactly 2 truths, before=%v after=%v", colBefore.Truths, colAfter.Truths)
	}
	for i := range colBefore.Truths {
		if colBefore.Truths[i] != colAfter.Truths[i] {
			t.Fatalf("the B column changed when only the S facet changed — facets interacted (forbidden)")
		}
	}
	// the B column is sorted top-down: operation (depth 5) before entity (depth 6).
	if colBefore.Truths[0] != "t-op-B" || colBefore.Truths[1] != "t-ent-B" {
		t.Fatalf("B column not top-down sorted: %v", colBefore.Truths)
	}
}

func TestBuild_OneColumnPerCanonicalFacet(t *testing.T) {
	g := grid.Build([]grid.Truth{
		{ID: "a", Rung: grid.RungEntity, Facet: facets.FacetFunctional},
	})
	if len(g.Columns) != len(facets.Facets()) {
		t.Fatalf("Build columns = %d, want %d (one per facet)", len(g.Columns), len(facets.Facets()))
	}
	for i, f := range facets.Facets() {
		if g.Columns[i].Facet != f {
			t.Fatalf("column %d facet = %q, want canonical %q", i, g.Columns[i].Facet, f)
		}
	}
	if g.Hash() == "" {
		t.Fatalf("grid hash empty")
	}
}
