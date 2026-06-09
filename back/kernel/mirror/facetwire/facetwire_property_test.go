package facetwire

import (
	"math/rand"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"pgregory.net/rapid"
)

// nonFuncFacetGen draws one of the five FK08 non-functional facets.
func nonFuncFacetGen() *rapid.Generator[facets.Facet] {
	cols := NonFunctionalColumns()
	return rapid.Custom(func(t *rapid.T) facets.Facet {
		return cols[rapid.IntRange(0, len(cols)-1).Draw(t, "facetIdx")]
	})
}

// columnGen draws an arbitrary facet column: each of the six rungs gets random declared/proven
// flags, in a RANDOM order (so the invariance-under-reordering property has something to bite).
func columnGen() *rapid.Generator[Column] {
	return rapid.Custom(func(t *rapid.T) Column {
		f := nonFuncFacetGen().Draw(t, "facet")
		rungs := make([]RungState, 0, len(Rungs()))
		for _, r := range Rungs() {
			rungs = append(rungs, RungState{
				Rung:     r,
				Declared: rapid.Bool().Draw(t, "declared"),
				Proven:   rapid.Bool().Draw(t, "proven"),
			})
		}
		return Column{KernelID: "k", Facet: f, Rungs: rungs}
	})
}

// shuffleRungs returns a copy of the column with its rungs in a different order.
func shuffleRungs(col Column, seed int64) Column {
	out := Column{KernelID: col.KernelID, Facet: col.Facet}
	out.Rungs = make([]RungState, len(col.Rungs))
	copy(out.Rungs, col.Rungs)
	rng := rand.New(rand.NewSource(seed))
	rng.Shuffle(len(out.Rungs), func(i, j int) { out.Rungs[i], out.Rungs[j] = out.Rungs[j], out.Rungs[i] })
	return out
}

// TestProp_WireColumn_Deterministic: same column ⇒ same verdict and same divergence set
// (the reproducibility mirror — determinism-first, §8).
func TestProp_WireColumn_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		col := columnGen().Draw(t, "col")
		a := WireColumn(col)
		b := WireColumn(col)
		if a.Verdict != b.Verdict {
			t.Fatalf("non-deterministic verdict: %s vs %s", a.Verdict, b.Verdict)
		}
		if len(a.Divergences) != len(b.Divergences) {
			t.Fatalf("non-deterministic divergence count")
		}
		for i := range a.Divergences {
			if a.Divergences[i] != b.Divergences[i] {
				t.Fatalf("divergence %d differs across runs", i)
			}
		}
	})
}

// TestProp_WireColumn_InvariantUnderReordering: the verdict and divergence SET are invariant
// under reordering the rungs on the input (the skeleton is order-independent).
func TestProp_WireColumn_InvariantUnderReordering(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		col := columnGen().Draw(t, "col")
		seed := rapid.Int64().Draw(t, "seed")
		a := WireColumn(col)
		b := WireColumn(shuffleRungs(col, seed))
		if a.Verdict != b.Verdict {
			t.Fatalf("reordering changed the verdict: %s vs %s", a.Verdict, b.Verdict)
		}
		if len(a.Divergences) != len(b.Divergences) {
			t.Fatalf("reordering changed the divergence count: %d vs %d", len(a.Divergences), len(b.Divergences))
		}
		for i := range a.Divergences {
			if a.Divergences[i] != b.Divergences[i] {
				t.Fatalf("reordering changed divergence %d", i)
			}
		}
	})
}

// TestProp_SkeletonHash_Deterministic: same skeleton ⇒ byte-identical report hash, invariant
// under column reordering (content-addressing).
func TestProp_SkeletonHash_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(0, len(NonFunctionalColumns())).Draw(t, "n")
		cols := NonFunctionalColumns()
		var chosen []Column
		for i := 0; i < n; i++ {
			chosen = append(chosen, fullColumn(cols[i]))
		}
		sk := Skeleton{KernelID: "k", Columns: chosen}
		a := WireSkeleton(sk)
		// Reverse the columns; the report must be byte-identical (canonical octuor order inside).
		rev := make([]Column, len(chosen))
		for i := range chosen {
			rev[len(chosen)-1-i] = chosen[i]
		}
		b := WireSkeleton(Skeleton{KernelID: "k", Columns: rev})
		if a.Hash != b.Hash {
			t.Fatalf("skeleton hash not invariant under column reordering: %s vs %s", a.Hash, b.Hash)
		}
	})
}

// TestProp_XNeverBlocks is the load-bearing soft-X property: for the experience facet, WHATEVER
// the rung states, the column is ALWAYS green and any divergence is advisory (§13.6). A soft
// facet never clicks the ratchet hard — the property version of the X done-criterion.
func TestProp_XNeverBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		rungs := make([]RungState, 0, len(Rungs()))
		for _, r := range Rungs() {
			rungs = append(rungs, RungState{
				Rung:     r,
				Declared: rapid.Bool().Draw(t, "declared"),
				Proven:   rapid.Bool().Draw(t, "proven"),
			})
		}
		cr := WireColumn(Column{Facet: facets.FacetExperience, Rungs: rungs})
		if !cr.Green() {
			t.Fatalf("the soft X column must always be green, got %s", cr.Verdict)
		}
		for _, d := range cr.Advisories {
			if !d.Advisory {
				t.Fatal("an X divergence must be advisory")
			}
		}
		if len(cr.Divergences) != 0 {
			t.Fatal("the X column must never carry hard (blocking) divergences")
		}
	})
}

// TestProp_OneSidedStructuralIsAlwaysRedForHard: for a HARD facet, a single declared-not-proven
// (or proven-not-declared) rung is ALWAYS a red column — a one-sided structural item is never
// silently green (the structural judge, §8).
func TestProp_OneSidedStructuralIsAlwaysRedForHard(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// pick a HARD facet (exclude X).
		hard := []facets.Facet{facets.FacetSecurity, facets.FacetReliability, facets.FacetEvolvability, facets.FacetMaintainability}
		f := hard[rapid.IntRange(0, len(hard)-1).Draw(t, "f")]
		r := Rungs()[rapid.IntRange(0, len(Rungs())-1).Draw(t, "r")]
		// Exactly one one-sided rung; all others aligned (declared==proven).
		broken := rapid.Bool().Draw(t, "declaredSide")
		col := Column{Facet: f}
		for _, rr := range Rungs() {
			if rr == r {
				col.Rungs = append(col.Rungs, RungState{Rung: rr, Declared: broken, Proven: !broken})
			} else {
				col.Rungs = append(col.Rungs, RungState{Rung: rr, Declared: true, Proven: true})
			}
		}
		if WireColumn(col).Green() {
			t.Fatalf("facet %s: a one-sided rung %s must be red", f, r)
		}
	})
}
