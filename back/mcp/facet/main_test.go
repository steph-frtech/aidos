package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// TestValidateTool — a legal collapsed set (F+I+M) is valid; a missing proof pair is a monster.
func TestValidateTool(t *testing.T) {
	_, ok, err := validate(context.Background(), nil, validateInput{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetInvariants, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetMaintainability, HasIntent: true, HasProofPair: true},
	}})
	if err != nil || !ok.OK || !ok.Valid || !ok.HasFunctional {
		t.Fatalf("F+I+M should validate: %+v err=%v", ok, err)
	}

	_, bad, _ := validate(context.Background(), nil, validateInput{Instances: []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetSecurity, HasIntent: true, HasProofPair: false},
	}})
	if bad.Valid {
		t.Fatalf("S without proof pair must be a monster (invalid): %+v", bad)
	}

	// no functional facet is refused.
	_, noF, _ := validate(context.Background(), nil, validateInput{Instances: []facets.Instance{
		{Facet: facets.FacetInvariants, HasIntent: true, HasProofPair: true},
	}})
	if noF.Valid || noF.HasFunctional {
		t.Fatalf("no F must be refused: %+v", noF)
	}
}

// TestHashTool — the signature is order/kernel-independent (content-addressed round-trip).
func TestHashTool(t *testing.T) {
	a := []facets.Instance{
		{Facet: facets.FacetFunctional, HasIntent: true, HasProofPair: true},
		{Facet: facets.FacetSecurity, HasIntent: true, HasProofPair: true},
	}
	b := []facets.Instance{a[1], a[0]} // permuted
	_, h1, _ := hash(context.Background(), nil, hashInput{KernelID: "k1", Instances: a})
	_, h2, _ := hash(context.Background(), nil, hashInput{KernelID: "k2", Instances: b})
	if h1.Signature != h2.Signature || h1.Signature == "" {
		t.Fatalf("hash must be order/kernel-independent: %q vs %q", h1.Signature, h2.Signature)
	}
}

// TestFacetsTool — the eight canonical lenses, X soft.
func TestFacetsTool(t *testing.T) {
	_, out, _ := listFacets(context.Background(), nil, facetsInput{})
	if len(out.Facets) != 8 || out.Facets[0].Letter != "F" || out.Facets[7].Letter != "X" {
		t.Fatalf("facets tool wrong set: %+v", out.Facets)
	}
	if !out.Facets[7].Soft {
		t.Fatalf("X must be soft")
	}
	for i := 0; i < 7; i++ {
		if out.Facets[i].Soft {
			t.Fatalf("facet %s must not be soft", out.Facets[i].Letter)
		}
	}
}

// TestServerBuilds — the tool registration wires without panic.
func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
