package prooftype_test

// FK05 fixture mirror — the done-criteria as executable cases (KRD §S00 bootstrap exception:
// the mirror is materialized as a file + executable test; Postgres persistence is back-filled at
// the `mirrors` schema step). Each case is a Given/When/Then over the PURE N→E mapping and the
// additive E-typed contract. They prove: (1) the mapping is total and exact for every N; (2) the
// added types E4/E6/E7 are reached ONLY via the right facet/formal flag; (3) the double-labelling
// preserves the N verbatim (zéro miroir N modifié); (4) a kernel displays its E-typed evidence.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
)

// Case 1 — the N→E mapping is exact and total for every N (KRD FKE-16 mapping line).
// Given each of the six N-levels, When mapped, Then it yields exactly its declared E-set.
func TestMapNToE_ExactForEveryLevel(t *testing.T) {
	want := map[prooftype.NLevel][]prooftype.ELevel{
		prooftype.N0: {prooftype.E3},
		prooftype.N1: {prooftype.E5},
		prooftype.N2: {prooftype.E3},
		prooftype.N3: {prooftype.E3},
		prooftype.N4: {prooftype.E1, prooftype.E2},
		prooftype.N5: {prooftype.E3, prooftype.E4},
	}
	for n, exp := range want {
		got := prooftype.MapNToE(n)
		if !reflect.DeepEqual(got, exp) {
			t.Fatalf("MapNToE(%s) = %v, want %v", n, got, exp)
		}
	}
}

// Case 2 — an unknown/zero N maps to the EMPTY set (total, never a panic).
func TestMapNToE_UnknownIsEmpty(t *testing.T) {
	got := prooftype.MapNToE(prooftype.NLevel("N9"))
	if len(got) != 0 {
		t.Fatalf("MapNToE(unknown) = %v, want empty", got)
	}
	if z := prooftype.MapNToE(prooftype.NLevel("")); len(z) != 0 {
		t.Fatalf("MapNToE(\"\") = %v, want empty", z)
	}
}

// Case 3 — E4 (security: gosec/gitleaks/evals-injection) is reached ONLY by the S facet.
// Given an N4 kernel WITHOUT S, Then E4 is absent; WITH S, Then E4 is present.
func TestContract_E4OnlyViaSecurityFacet(t *testing.T) {
	plain := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N4})
	if containsE(plain.Required, prooftype.E4) {
		t.Fatalf("N4 without S must NOT require E4; got %v", plain.Required)
	}
	withS := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N4, Facets: []facets.Facet{facets.FacetSecurity},
	})
	if !containsE(withS.Required, prooftype.E4) {
		t.Fatalf("N4 with S must require E4 (security); got %v", withS.Required)
	}
	if !containsE(withS.FromFacets, prooftype.E4) {
		t.Fatalf("E4 must be attributed to FromFacets; got %v", withS.FromFacets)
	}
}

// Case 4 — E6 (runtime proof / monitoring / rollback) is reached by R (fiabilité) or V.
func TestContract_E6ViaReliabilityOrEvolvability(t *testing.T) {
	withR := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N2, Facets: []facets.Facet{facets.FacetReliability},
	})
	if !containsE(withR.Required, prooftype.E6) {
		t.Fatalf("R must require E6 (runtime/rollback); got %v", withR.Required)
	}
	withV := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N2, Facets: []facets.Facet{facets.FacetEvolvability},
	})
	if !containsE(withV.Required, prooftype.E6) {
		t.Fatalf("V must require E6 (migration runtime/rollback); got %v", withV.Required)
	}
	plain := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N2})
	if containsE(plain.Required, prooftype.E6) {
		t.Fatalf("plain N2 must NOT require E6; got %v", plain.Required)
	}
}

// Case 5 — E7 (formal) is reached ONLY by the RequiresFormal flag (the rare T2 cap), never by an
// ordinary N or facet.
func TestContract_E7OnlyViaFormalFlag(t *testing.T) {
	ordinary := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N1,
		Facets: []facets.Facet{facets.FacetInvariants, facets.FacetSecurity, facets.FacetReliability},
	})
	if containsE(ordinary.Required, prooftype.E7) {
		t.Fatalf("an ordinary kernel must NOT require E7; got %v", ordinary.Required)
	}
	formal := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N1, RequiresFormal: true})
	if !containsE(formal.Required, prooftype.E7) {
		t.Fatalf("a formal-cap kernel must require E7; got %v", formal.Required)
	}
}

// Case 6 — the SOFT facet X NEVER adds a hard E (§13.6: informs, never blocks).
func TestContract_SoftFacetXAddsNoE(t *testing.T) {
	withX := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N0, Facets: []facets.Facet{facets.FacetExperience},
	})
	base := prooftype.ContractFor(prooftype.KernelProof{NLevel: prooftype.N0})
	if !reflect.DeepEqual(withX.Required, base.Required) {
		t.Fatalf("X must add no hard E: with X %v != base %v", withX.Required, base.Required)
	}
	if len(withX.FromFacets) != 0 {
		t.Fatalf("X must contribute no FromFacets; got %v", withX.FromFacets)
	}
}

// Case 7 — DOUBLE-ÉTIQUETAGE ADDITIF: Tag preserves the N verbatim while adding the E contract
// (FK05 done-criterion: "zéro miroir N existant modifié"). The N out equals the N in, byte-identical.
func TestTag_PreservesNVerbatimAndAddsE(t *testing.T) {
	in := prooftype.KernelProof{
		NLevel: prooftype.N5, Facets: []facets.Facet{facets.FacetSecurity},
	}
	tag := prooftype.Tag(in)
	if tag.N != prooftype.N5 {
		t.Fatalf("Tag must preserve N verbatim; got N=%s want N5", tag.N)
	}
	// The E contract is the additive annotation: N5 → {E3,E4} base, S → {E4} (already present).
	if !containsE(tag.E.Required, prooftype.E3) || !containsE(tag.E.Required, prooftype.E4) {
		t.Fatalf("Tag must display E-typed evidence; got %v", tag.E.Required)
	}
	if tag.E.NLevel != prooftype.N5 {
		t.Fatalf("the E contract must carry the same N (double-label); got %s", tag.E.NLevel)
	}
}

// Case 8 — a kernel DISPLAYS its E-typed evidence: an N4 unit kernel that also instantiates S and R
// shows the full union {E1,E2 (from N4), E4 (from S), E6 (from R)} — exactly, sorted, deduplicated.
func TestContract_DisplaysFullETypedEvidence(t *testing.T) {
	c := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N4,
		Facets: []facets.Facet{facets.FacetSecurity, facets.FacetReliability},
	})
	want := []prooftype.ELevel{prooftype.E1, prooftype.E2, prooftype.E4, prooftype.E6}
	if !reflect.DeepEqual(c.Required, want) {
		t.Fatalf("full E-typed contract = %v, want %v", c.Required, want)
	}
	// Breakdown is honest: E1,E2 from N; E4,E6 from facets.
	if !reflect.DeepEqual(c.FromN, []prooftype.ELevel{prooftype.E1, prooftype.E2}) {
		t.Fatalf("FromN = %v, want [E1 E2]", c.FromN)
	}
	if !reflect.DeepEqual(c.FromFacets, []prooftype.ELevel{prooftype.E4, prooftype.E6}) {
		t.Fatalf("FromFacets = %v, want [E4 E6]", c.FromFacets)
	}
}

// Case 9 — determinism: the same KernelProof, mapped twice, yields byte-identical contracts; and
// facet INPUT ORDER does not change the output (the union is canonical).
func TestContract_DeterministicAndOrderIndependent(t *testing.T) {
	a := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N5,
		Facets: []facets.Facet{facets.FacetSecurity, facets.FacetReliability, facets.FacetInvariants},
	})
	b := prooftype.ContractFor(prooftype.KernelProof{
		NLevel: prooftype.N5,
		Facets: []facets.Facet{facets.FacetInvariants, facets.FacetReliability, facets.FacetSecurity},
	})
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("contract must be order-independent and deterministic:\n a=%+v\n b=%+v", a, b)
	}
}

func containsE(es []prooftype.ELevel, e prooftype.ELevel) bool {
	for _, x := range es {
		if x == e {
			return true
		}
	}
	return false
}
