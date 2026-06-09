package prooftype_test

// FK05 property mirror (rapid) — the reproducibility + invariant mirror of the N→E mapping and the
// additive E-typed contract (KRD §8 "the judge is deterministic"; CLAUDE.md §6 determinism-first:
// every deterministic-able op carries a reproducibility mirror, same input → same output).
// cert_language=rapid, liveness=live, authority=below (a means-test — CLAUDE.md §8). Four invariants:
//
//	1. MapNToE is TOTAL & DETERMINISTIC — same N → byte-identical, sorted, ascending E set.
//	2. ContractFor is DETERMINISTIC & ORDER-INDEPENDENT — same proof (any facet order) → same contract.
//	3. The double-label is ADDITIVE — Tag.N == in.N verbatim (zéro miroir N modifié), always.
//	4. The added types are GATED — E4 ⇔ S, E6 ⇔ (R ∨ V), E7 ⇔ RequiresFormal; X never adds a hard E.

import (
	"reflect"
	"sort"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"pgregory.net/rapid"
)

// genNLevel draws an arbitrary N-level — usually a real one, occasionally an unknown — so totality
// is exercised on both.
func genNLevel(t *rapid.T) prooftype.NLevel {
	reals := prooftype.NLevels()
	idx := rapid.IntRange(0, len(reals)).Draw(t, "nIdx")
	if idx == len(reals) {
		return prooftype.NLevel(rapid.StringMatching(`N[6-9]`).Draw(t, "unknownN"))
	}
	return reals[idx]
}

// genFacetSet draws an arbitrary subset of the eight facets.
func genFacetSet(t *rapid.T) []facets.Facet {
	all := facets.Facets()
	var out []facets.Facet
	for _, f := range all {
		if rapid.Bool().Draw(t, "include_"+string(f)) {
			out = append(out, f)
		}
	}
	return out
}

// Invariant 1 — MapNToE is total & deterministic: never panics, and two calls on the same N return
// byte-identical, sorted-ascending slices.
func TestProp_MapNToE_TotalDeterministicSorted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := genNLevel(t)
		a := prooftype.MapNToE(n)
		b := prooftype.MapNToE(n)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("MapNToE non-deterministic for %s: %v vs %v", n, a, b)
		}
		if !sort.SliceIsSorted(a, func(i, j int) bool { return a[i] < a[j] }) {
			t.Fatalf("MapNToE(%s) not sorted ascending: %v", n, a)
		}
		// A real N maps to a non-empty set; an unknown maps to empty.
		if n.IsReal() && len(a) == 0 {
			t.Fatalf("real N %s must map to a non-empty E set", n)
		}
		if !n.IsReal() && len(a) != 0 {
			t.Fatalf("unknown N %s must map to empty; got %v", n, a)
		}
	})
}

// Invariant 2 — ContractFor is deterministic & order-independent: shuffling the facet slice yields
// the same contract, and two calls on identical input are byte-identical.
func TestProp_Contract_OrderIndependentDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := genNLevel(t)
		fs := genFacetSet(t)
		formal := rapid.Bool().Draw(t, "formal")
		base := prooftype.ContractFor(prooftype.KernelProof{NLevel: n, Facets: fs, RequiresFormal: formal})

		// Reverse the facet order; the contract must not change.
		rev := make([]facets.Facet, len(fs))
		for i := range fs {
			rev[len(fs)-1-i] = fs[i]
		}
		shuffled := prooftype.ContractFor(prooftype.KernelProof{NLevel: n, Facets: rev, RequiresFormal: formal})
		if !reflect.DeepEqual(base, shuffled) {
			t.Fatalf("contract order-dependent:\n base=%+v\n rev =%+v", base, shuffled)
		}
		// Required is sorted ascending & deduplicated.
		req := base.Required
		if !sort.SliceIsSorted(req, func(i, j int) bool { return req[i] < req[j] }) {
			t.Fatalf("Required not sorted: %v", req)
		}
		for i := 1; i < len(req); i++ {
			if req[i] == req[i-1] {
				t.Fatalf("Required has a duplicate: %v", req)
			}
		}
	})
}

// Invariant 3 — the double-label is ADDITIVE: Tag preserves the N verbatim for every input (the
// FK05 done-criterion "zéro miroir N existant modifié"), and the tag's E contract carries the same N.
func TestProp_Tag_PreservesNVerbatim(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := prooftype.KernelProof{
			NLevel:         genNLevel(t),
			Facets:         genFacetSet(t),
			RequiresFormal: rapid.Bool().Draw(t, "formal"),
		}
		tag := prooftype.Tag(in)
		if tag.N != in.NLevel {
			t.Fatalf("Tag mutated N: in=%s out=%s", in.NLevel, tag.N)
		}
		if tag.E.NLevel != in.NLevel {
			t.Fatalf("E contract carries wrong N: in=%s e.N=%s", in.NLevel, tag.E.NLevel)
		}
		// The tag's contract equals ContractFor (the cache is the function — like truthlevel parity).
		if !reflect.DeepEqual(tag.E, prooftype.ContractFor(in)) {
			t.Fatalf("Tag.E diverges from ContractFor for %+v", in)
		}
	})
}

// Invariant 4 — the added types are GATED exactly: E4 ⇔ S, E6 ⇔ (R ∨ V), E7 ⇔ RequiresFormal, and
// the soft facet X never adds a hard E.
func TestProp_AddedTypesGated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fs := genFacetSet(t)
		formal := rapid.Bool().Draw(t, "formal")
		// Use N0 as base: its E set is {E3}, which contains none of E4/E6/E7 — so any E4/E6/E7 in the
		// contract can only come from the facet/formal gate, making the iff exact.
		c := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N0, Facets: fs, RequiresFormal: formal})

		hasS := containsFacetSet(fs, facets.FacetSecurity)
		hasRorV := containsFacetSet(fs, facets.FacetReliability) || containsFacetSet(fs, facets.FacetEvolvability)

		if containsE(c.Required, prooftype.E4) != hasS {
			t.Fatalf("E4 must be present iff S; fs=%v required=%v", fs, c.Required)
		}
		if containsE(c.Required, prooftype.E6) != hasRorV {
			t.Fatalf("E6 must be present iff (R∨V); fs=%v required=%v", fs, c.Required)
		}
		if containsE(c.Required, prooftype.E7) != formal {
			t.Fatalf("E7 must be present iff RequiresFormal; formal=%v required=%v", formal, c.Required)
		}
		// X never adds a hard E: a kernel with ONLY X added to the base has the base contract.
		onlyX := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N0, Facets: []facets.Facet{facets.FacetExperience}})
		base := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N0})
		if !reflect.DeepEqual(onlyX.Required, base.Required) {
			t.Fatalf("X added a hard E: %v vs base %v", onlyX.Required, base.Required)
		}
	})
}

func containsFacetSet(fs []facets.Facet, f facets.Facet) bool {
	for _, x := range fs {
		if x == f {
			return true
		}
	}
	return false
}
