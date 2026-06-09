package facets_test

// Property mirror (∀) for FK02 — the facet validator + content-addressed round-trip.
// reflects=kernel.facets, test_kind=property, cert_language=rapid, liveness=live,
// authority=below (a means-test over Validate/Hash, not a new truth — CLAUDE.md §8).
// Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are the human red of KRD FKE-1.3, NOT invented to be satisfied:
//
//  1. TOTAL & DETERMINISTIC (the reproducibility mirror, CLAUDE.md §6/§8). For EVERY
//     FacetSet — arbitrary instances — Validate returns a verdict and Hash a digest,
//     never panic; same FacetSet ⇒ same verdict, same hash (pure functions).
//  2. NO FUNCTIONAL ⇒ INVALID. A set without F is always invalid (F is incompressible).
//  3. F PRESENT ∧ EVERY HARD FACET PROVEN ⇒ VALID. With F and every non-soft facet
//     carrying its proof pair (and no empty/unknown/dup), the set is valid.
//  4. CONTENT-ADDRESSED ROUND-TRIP. Hash is order-independent and KernelID-independent:
//     permuting the instances or changing the KernelID leaves Hash unchanged; changing a
//     facet declaration changes it.
//  5. SOFT X NEVER BLOCKS. An X facet missing its proof pair is advisory — it never flips
//     Valid on its own.

import (
	"math/rand"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"pgregory.net/rapid"
)

var allFacets = []facets.Facet{
	facets.FacetFunctional, facets.FacetInvariants, facets.FacetSecurity,
	facets.FacetBudgets, facets.FacetReliability, facets.FacetEvolvability,
	facets.FacetMaintainability, facets.FacetExperience,
}

// drawInstance draws a facet instance over the closed eight-lens set with arbitrary
// intent/proof flags.
func drawInstance(t *rapid.T, label string) facets.Instance {
	idx := rapid.IntRange(0, len(allFacets)-1).Draw(t, label+"-facet")
	return facets.Instance{
		Facet:        allFacets[idx],
		HasIntent:    rapid.Bool().Draw(t, label+"-intent"),
		HasProofPair: rapid.Bool().Draw(t, label+"-proof"),
	}
}

// drawFacetSet draws an arbitrary FacetSet (0..8 instances, possibly duplicate facets).
func drawFacetSet(t *rapid.T) facets.FacetSet {
	n := rapid.IntRange(0, 8).Draw(t, "n")
	out := make([]facets.Instance, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, drawInstance(t, "inst"))
	}
	return facets.FacetSet{
		KernelID:  rapid.StringMatching(`[a-z]{0,6}`).Draw(t, "kernel"),
		Instances: out,
	}
}

// TestValidate_TotalDeterministic — Validate is total (never panics) and deterministic
// over arbitrary FacetSets (the reproducibility mirror).
func TestValidate_TotalDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fs := drawFacetSet(t)
		a := facets.Validate(fs)
		b := facets.Validate(fs)
		if a.Valid != b.Valid || a.HasFunctional != b.HasFunctional || len(a.Issues) != len(b.Issues) {
			t.Fatalf("Validate not deterministic: %+v vs %+v", a, b)
		}
		for i := range a.Issues {
			if a.Issues[i] != b.Issues[i] {
				t.Fatalf("issue[%d] not deterministic: %+v vs %+v", i, a.Issues[i], b.Issues[i])
			}
		}
	})
}

// TestValidate_NoFunctionalInvalid — any set lacking F is invalid (F incompressible).
func TestValidate_NoFunctionalInvalid(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fs := drawFacetSet(t)
		// drop any functional facet.
		filtered := fs.Instances[:0:0]
		for _, in := range fs.Instances {
			if in.Facet != facets.FacetFunctional {
				filtered = append(filtered, in)
			}
		}
		fs.Instances = filtered
		res := facets.Validate(fs)
		if res.HasFunctional {
			t.Fatalf("HasFunctional should be false after dropping F")
		}
		if res.Valid {
			t.Fatalf("a set without F must be invalid, got valid: %+v", fs)
		}
	})
}

// TestValidate_AllHardProvenValid — F present ∧ every distinct facet carrying intent+proof
// (no empty/unknown/dup) ⇒ valid.
func TestValidate_AllHardProvenValid(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// pick a subset of the eight that always includes F.
		insts := []facets.Instance{{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true}}
		for _, f := range allFacets {
			if f == facets.FacetFunctional {
				continue
			}
			if rapid.Bool().Draw(t, "include-"+string(f)) {
				insts = append(insts, facets.Instance{Facet: f, HasIntent: true, HasProofPair: true})
			}
		}
		res := facets.Validate(facets.FacetSet{Instances: insts})
		if !res.Valid {
			t.Fatalf("F + all-proven distinct facets must be valid, got issues: %+v", res.Issues)
		}
		if !res.HasFunctional {
			t.Fatalf("HasFunctional must be true")
		}
	})
}

// TestHash_OrderAndKernelIndependent — Hash is content-addressed: permuting the instances
// and changing the KernelID leave the digest unchanged (the done-criterion "round-trip
// content-adressé").
func TestHash_OrderAndKernelIndependent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		fs := drawFacetSet(t)
		base := facets.Hash(fs)

		// permute the instances.
		perm := make([]facets.Instance, len(fs.Instances))
		copy(perm, fs.Instances)
		seed := rapid.Int64().Draw(t, "seed")
		r := rand.New(rand.NewSource(seed))
		r.Shuffle(len(perm), func(i, j int) { perm[i], perm[j] = perm[j], perm[i] })

		permuted := facets.FacetSet{KernelID: fs.KernelID + "-other", Instances: perm}
		if got := facets.Hash(permuted); got != base {
			t.Fatalf("Hash not order/kernel-independent: base=%s permuted=%s", base, got)
		}
	})
}

// TestHash_SensitiveToDeclaration — changing a facet declaration (a flag) changes the hash
// (the content address tracks the facet coordinate, not just its presence).
func TestHash_SensitiveToDeclaration(t *testing.T) {
	base := facets.FacetSet{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetSecurity, HasIntent: true, HasProofPair: true},
	}}
	flipped := facets.FacetSet{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetSecurity, HasIntent: true, HasProofPair: false}, // proof pair flipped
	}}
	if facets.Hash(base) == facets.Hash(flipped) {
		t.Fatalf("Hash must change when a facet declaration changes")
	}
}

// TestSoftX_NeverBlocks — an X facet missing its proof pair (alongside a valid F) is
// advisory: it never flips Valid (§13.6).
func TestSoftX_NeverBlocks(t *testing.T) {
	res := facets.Validate(facets.FacetSet{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetExperience, HasIntent: true, HasProofPair: false},
	}})
	if !res.Valid {
		t.Fatalf("soft X missing its proof pair must not block, got: %+v", res.Issues)
	}
	advisorySeen := false
	for _, is := range res.Issues {
		if is.Facet == facets.FacetExperience && is.Advisory {
			advisorySeen = true
		}
	}
	if !advisorySeen {
		t.Fatalf("expected an advisory issue for X, got: %+v", res.Issues)
	}
}
