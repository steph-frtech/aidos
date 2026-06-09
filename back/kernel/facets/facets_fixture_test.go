package facets_test

// FK02 fixture mirror — the done-criteria of the collapsible facet-set, written as
// state→verdict fixtures (FKE-1.3). reflects=FK02-facets, test_kind=fixture, liveness=live.
//
// The four done-criteria of FK02:
//
//  1. A kernel with NO functional facet is REFUSED ("un kernel sans facette fonctionnelle refusé").
//  2. A declared facet WITHOUT its proof pair is a MONSTER ("une facette déclarée sans ses paires = monstre").
//  3. A pure function carries F+I+M; a PII endpoint carries all eight (the collapsible legal shapes).
//  4. Round-trip is content-addressed (proven in the property test — same facets → same hash).
//
// X is the SOFT exception (§13.6): its missing proof pair is ADVISORY, not a hard monster.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// full builds an instance with intent + proof pair (a fully-proven facet).
func full(f facets.Facet) facets.Instance {
	return facets.Instance{Facet: f, HasIntent: true, HasProofPair: true}
}

// intentOnly builds an instance with intent but NO proof pair (a monster, unless soft).
func intentOnly(f facets.Facet) facets.Instance {
	return facets.Instance{Facet: f, HasIntent: true, HasProofPair: false}
}

func TestFacetSet_DoneCriteria(t *testing.T) {
	cases := []struct {
		name          string
		set           facets.FacetSet
		wantValid     bool
		wantHasF      bool
		wantIssueCode string // a code expected among the issues ("" = none)
	}{
		{
			// done-criterion 1: a kernel with no functional facet is refused.
			name:          "no functional facet is refused",
			set:           facets.FacetSet{Instances: []facets.Instance{full(facets.FacetInvariants)}},
			wantValid:     false,
			wantHasF:      false,
			wantIssueCode: facets.ErrNoFunctionalFacet.Error(),
		},
		{
			// done-criterion 2: a declared facet without its proof pair = monster.
			name: "declared facet without proof pair is a monster",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				intentOnly(facets.FacetSecurity),
			}},
			wantValid:     false,
			wantHasF:      true,
			wantIssueCode: facets.ErrMissingProofPair.Error(),
		},
		{
			// empty facet is refused (never instantiate an empty facet).
			name: "empty facet is refused",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				{Facet: facets.FacetBudgets}, // no intent, no proof pair
			}},
			wantValid:     false,
			wantHasF:      true,
			wantIssueCode: facets.ErrEmptyFacet.Error(),
		},
		{
			// done-criterion 3a: a pure function carries F+I+M (collapsed, legal).
			name: "pure function: F+I+M is a legal collapsed kernel",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				full(facets.FacetInvariants),
				full(facets.FacetMaintainability),
			}},
			wantValid:     true,
			wantHasF:      true,
			wantIssueCode: "",
		},
		{
			// done-criterion 3b: a PII endpoint carries all eight.
			name: "PII endpoint: all eight facets is legal",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				full(facets.FacetInvariants),
				full(facets.FacetSecurity),
				full(facets.FacetBudgets),
				full(facets.FacetReliability),
				full(facets.FacetEvolvability),
				full(facets.FacetMaintainability),
				full(facets.FacetExperience),
			}},
			wantValid:     true,
			wantHasF:      true,
			wantIssueCode: "",
		},
		{
			// the incompressible minimum: a declarative view-kernel = F + X.
			name: "declarative view kernel: F + X is legal",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				full(facets.FacetExperience),
			}},
			wantValid:     true,
			wantHasF:      true,
			wantIssueCode: "",
		},
		{
			// the soft exception: X missing its proof pair is ADVISORY, not a hard monster.
			name: "soft X missing its proof pair is advisory (still valid)",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				intentOnly(facets.FacetExperience),
			}},
			wantValid:     true, // advisory does not flip Valid
			wantHasF:      true,
			wantIssueCode: facets.ErrMissingProofPair.Error(),
		},
		{
			// an unknown (out-of-closed-set) facet is rejected.
			name: "unknown facet is rejected",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				{Facet: "Z", HasIntent: true, HasProofPair: true},
			}},
			wantValid:     false,
			wantHasF:      true,
			wantIssueCode: facets.ErrUnknownFacet.Error(),
		},
		{
			// a duplicate facet is rejected.
			name: "duplicate facet is rejected",
			set: facets.FacetSet{Instances: []facets.Instance{
				full(facets.FacetFunctional),
				full(facets.FacetInvariants),
				full(facets.FacetInvariants),
			}},
			wantValid:     false,
			wantHasF:      true,
			wantIssueCode: facets.ErrDuplicateFacet.Error(),
		},
		{
			// the empty set fails rule 1 (no F) and is total (no panic).
			name:          "empty set is refused (no functional facet)",
			set:           facets.FacetSet{},
			wantValid:     false,
			wantHasF:      false,
			wantIssueCode: facets.ErrNoFunctionalFacet.Error(),
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := facets.Validate(tc.set)
			if got.Valid != tc.wantValid {
				t.Fatalf("Valid = %v, want %v (issues=%+v)", got.Valid, tc.wantValid, got.Issues)
			}
			if got.HasFunctional != tc.wantHasF {
				t.Fatalf("HasFunctional = %v, want %v", got.HasFunctional, tc.wantHasF)
			}
			if tc.wantIssueCode != "" {
				found := false
				for _, is := range got.Issues {
					if is.Code == tc.wantIssueCode {
						found = true
						break
					}
				}
				if !found {
					t.Fatalf("expected issue code %q among issues, got %+v", tc.wantIssueCode, got.Issues)
				}
			}
		})
	}
}

// TestFacetsClosedSet — the canonical set is exactly the eight lenses F/I/S/B/R/V/M/X.
func TestFacetsClosedSet(t *testing.T) {
	got := facets.Facets()
	want := []facets.Facet{
		facets.FacetFunctional, facets.FacetInvariants, facets.FacetSecurity,
		facets.FacetBudgets, facets.FacetReliability, facets.FacetEvolvability,
		facets.FacetMaintainability, facets.FacetExperience,
	}
	if len(got) != len(want) {
		t.Fatalf("Facets() len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Facets()[%d] = %q, want %q", i, got[i], want[i])
		}
		if !got[i].IsCanonical() {
			t.Fatalf("facet %q should be canonical", got[i])
		}
	}
	// only X is soft.
	for _, f := range got {
		if f.IsSoft() != (f == facets.FacetExperience) {
			t.Fatalf("IsSoft(%q) = %v, want %v", f, f.IsSoft(), f == facets.FacetExperience)
		}
	}
}
