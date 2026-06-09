package grid_test

// Property mirror (∀) for FK03 — the grille's three laws as invariants + the reproducibility
// mirror. reflects=kernel.grid, test_kind=property, cert_language=rapid, liveness=live,
// authority=below (a means-test over Resolve/MarkStale/AffectedCells/Project — CLAUDE.md §8).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are the human red of KRD FKE-1.4, NOT invented to be satisfied:
//
//  1. TOTAL & DETERMINISTIC (the reproducibility mirror, CLAUDE.md §6/§8). For EVERY (rung,
//     facet) Resolve/MarkStale/AffectedCells/Project never panic; same input ⇒ same output.
//  2. LAW 1 — a resolved cell round-trips its coordinate; distinct coordinates ⇒ distinct hashes.
//  3. LAW 2 — MarkStale(rung) returns EXACTLY the source rungs strictly above `rung` (smaller
//     depth), top-down, never the changed rung, never a rung below, never a transversal band.
//  4. LAW 3 — AffectedCells holds the facet CONSTANT across every stale cell, and the seven
//     OTHER facets are untouched; Project on facet A is invariant under any change confined to
//     facet B (the facets do not interact).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/grid"
	"pgregory.net/rapid"
)

func genRung(t *rapid.T) grid.Rung {
	rungs := grid.Rungs()
	return rungs[rapid.IntRange(0, len(rungs)-1).Draw(t, "rung")]
}

func genFacet(t *rapid.T) facets.Facet {
	fs := facets.Facets()
	return fs[rapid.IntRange(0, len(fs)-1).Draw(t, "facet")]
}

// INV 1 + 2 — Resolve is total, deterministic, round-trips, distinct ⇒ distinct.
func TestProp_ResolveDeterministicAndInjective(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		r1, r2 := genRung(t), genRung(t)
		f1, f2 := genFacet(t), genFacet(t)

		c1, err := grid.Resolve(r1, f1)
		if err != nil {
			t.Fatalf("Resolve(%q,%q) errored on a valid coordinate: %v", r1, f1, err)
		}
		// determinism: same coordinate ⇒ same hash.
		again, _ := grid.Resolve(r1, f1)
		if c1.Hash() != again.Hash() {
			t.Fatalf("Resolve not deterministic for (%q,%q)", r1, f1)
		}
		// round-trip the coordinate.
		if c1.Rung != r1 || c1.Facet != f1 {
			t.Fatalf("Resolve did not round-trip: got %v", c1)
		}
		// injectivity: distinct coordinate ⇒ distinct hash.
		c2, _ := grid.Resolve(r2, f2)
		if (r1 != r2 || f1 != f2) && c1.Hash() == c2.Hash() {
			t.Fatalf("hash collision between distinct cells (%q,%q) vs (%q,%q)", r1, f1, r2, f2)
		}
	})
}

// INV 3 — LAW 2: MarkStale returns exactly the source rungs strictly above, top-down.
func TestProp_MarkStaleIsExactlyTheRungsAbove(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		r := genRung(t)
		stale := grid.MarkStale(r)
		d := r.Depth()
		if len(stale) != d {
			t.Fatalf("MarkStale(%q) returned %d rungs, want %d (= depth, all strictly above)", r, len(stale), d)
		}
		prevDepth := -1
		for _, s := range stale {
			// every stale rung is a source rung, strictly above, in increasing depth (top-down).
			if !s.IsSourceRung() {
				t.Fatalf("MarkStale(%q) returned a non-source rung %q", r, s)
			}
			if s == r {
				t.Fatalf("MarkStale(%q) included the changed rung itself", r)
			}
			if s.Depth() >= d {
				t.Fatalf("MarkStale(%q) marked a rung NOT above: %q (depth %d >= %d)", r, s, s.Depth(), d)
			}
			if s.Depth() <= prevDepth {
				t.Fatalf("MarkStale(%q) not in top-down order at %q", r, s)
			}
			prevDepth = s.Depth()
		}
	})
}

// INV 4a — LAW 3: AffectedCells holds the facet constant; the other facets are untouched.
func TestProp_AffectedCellsHoldFacetConstantOthersUntouched(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		r, f := genRung(t), genFacet(t)
		aff := grid.AffectedCells(grid.Change{Rung: r, Facet: f})

		// every stale cell stays on the changed facet — the mark never crosses a facet.
		for _, c := range aff.StaleCells {
			if c.Facet != f {
				t.Fatalf("AffectedCells(%q,%q): stale cell %v crossed to another facet", r, f, c)
			}
			if c.Rung.Depth() >= r.Depth() {
				t.Fatalf("AffectedCells(%q,%q): stale cell %v is not above the change", r, f, c)
			}
		}
		// the stale cells correspond 1:1 with the marked rungs.
		if len(aff.StaleCells) != len(aff.StaleRungs) {
			t.Fatalf("stale cells/rungs mismatch: %d vs %d", len(aff.StaleCells), len(aff.StaleRungs))
		}
		// exactly the seven OTHER facets are untouched; none equals the changed facet.
		if len(aff.UntouchedFacets) != len(facets.Facets())-1 {
			t.Fatalf("UntouchedFacets = %d, want %d", len(aff.UntouchedFacets), len(facets.Facets())-1)
		}
		for _, uf := range aff.UntouchedFacets {
			if uf == f {
				t.Fatalf("the changed facet %q appears among UntouchedFacets", f)
			}
		}
	})
}

// INV 4b — LAW 3: Project on facet A is invariant under any change confined to a DIFFERENT
// facet (the facets do not interact — the orthogonal axis truly separates).
func TestProp_ProjectInvariantUnderForeignFacetChange(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fs := facets.Facets()
		a := fs[rapid.IntRange(0, len(fs)-1).Draw(t, "colFacet")]

		// a base of truths on facet A across some rungs.
		n := rapid.IntRange(0, 5).Draw(t, "nA")
		var base []grid.Truth
		rungs := grid.Rungs()
		for i := 0; i < n; i++ {
			r := rungs[rapid.IntRange(0, len(rungs)-1).Draw(t, "ar")]
			base = append(base, grid.Truth{ID: "A" + rapid.StringMatching(`[a-z]{1,4}`).Draw(t, "aid"), Rung: r, Facet: a})
		}
		colBefore := grid.Project(base, a)

		// add an arbitrary number of truths on facets OTHER than A.
		changed := append([]grid.Truth{}, base...)
		m := rapid.IntRange(0, 5).Draw(t, "nB")
		for i := 0; i < m; i++ {
			bf := fs[rapid.IntRange(0, len(fs)-1).Draw(t, "bf")]
			if bf == a {
				continue // a foreign-facet change only
			}
			r := rungs[rapid.IntRange(0, len(rungs)-1).Draw(t, "br")]
			changed = append(changed, grid.Truth{ID: "B" + rapid.StringMatching(`[a-z]{1,4}`).Draw(t, "bid"), Rung: r, Facet: bf})
		}
		colAfter := grid.Project(changed, a)

		if len(colBefore.Truths) != len(colAfter.Truths) {
			t.Fatalf("Project(A) changed length under a foreign-facet change: %v -> %v", colBefore.Truths, colAfter.Truths)
		}
		for i := range colBefore.Truths {
			if colBefore.Truths[i] != colAfter.Truths[i] {
				t.Fatalf("Project(A) changed under a foreign-facet change — facets interacted")
			}
		}
	})
}

// INV 1 — Build is deterministic: same truths ⇒ same grid hash.
func TestProp_BuildDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rungs := grid.Rungs()
		fs := facets.Facets()
		n := rapid.IntRange(0, 8).Draw(t, "n")
		var truths []grid.Truth
		for i := 0; i < n; i++ {
			truths = append(truths, grid.Truth{
				ID:    rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "id"),
				Rung:  rungs[rapid.IntRange(0, len(rungs)-1).Draw(t, "r")],
				Facet: fs[rapid.IntRange(0, len(fs)-1).Draw(t, "f")],
			})
		}
		h1 := grid.Build(truths).Hash()
		h2 := grid.Build(truths).Hash()
		if h1 != h2 {
			t.Fatalf("Build not deterministic: %s != %s", h1, h2)
		}
	})
}
