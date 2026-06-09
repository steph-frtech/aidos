package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// TestResolveTool — LAW 1: a valid coordinate resolves to a deterministic cell; an out-of-set
// coordinate is refused (no default cell).
func TestResolveTool(t *testing.T) {
	_, ok, err := resolve(context.Background(), nil, resolveInput{Rung: "operation", Facet: "S"})
	if err != nil || !ok.OK || ok.Cell != "operation×S" || ok.Hash == "" {
		t.Fatalf("resolve(operation,S) should succeed: %+v err=%v", ok, err)
	}
	_, bad, _ := resolve(context.Background(), nil, resolveInput{Rung: "invariant", Facet: "F"})
	if bad.OK {
		t.Fatalf("resolve(invariant,F) must be refused (invariant is the I facet, not a rung): %+v", bad)
	}
	_, badF, _ := resolve(context.Background(), nil, resolveInput{Rung: "entity", Facet: "Z"})
	if badF.OK {
		t.Fatalf("resolve(entity,Z) must be refused (Z out of octuor): %+v", badF)
	}
}

// TestMarkTool — LAW 2: a low change marks the source rungs above; the summit marks nothing.
func TestMarkTool(t *testing.T) {
	_, low, _ := mark(context.Background(), nil, markInput{Rung: "entity"})
	if len(low.StaleRungs) != 6 || low.StaleRungs[0] != "product" {
		t.Fatalf("mark(entity) should mark the 6 rungs above, top-down: %+v", low.StaleRungs)
	}
	_, top, _ := mark(context.Background(), nil, markInput{Rung: "product"})
	if len(top.StaleRungs) != 0 {
		t.Fatalf("mark(product) should mark nothing above: %+v", top.StaleRungs)
	}
}

// TestAffectedTool — LAWS 2+3: stale cells hold the facet constant; the other seven are untouched.
func TestAffectedTool(t *testing.T) {
	_, aff, _ := affected(context.Background(), nil, affectedInput{Rung: "operation", Facet: "S"})
	if aff.Changed.Cell != "operation×S" {
		t.Fatalf("affected changed cell = %q", aff.Changed.Cell)
	}
	for _, c := range aff.StaleCells {
		if c.Facet != "S" {
			t.Fatalf("stale cell %q left facet S (the mark crossed a facet)", c.Cell)
		}
	}
	if len(aff.UntouchedFacets) != 7 {
		t.Fatalf("affected should leave 7 facets untouched: %+v", aff.UntouchedFacets)
	}
	for _, f := range aff.UntouchedFacets {
		if f == "S" {
			t.Fatalf("changed facet S appears in untouched set")
		}
	}
}

// TestRungsTool — the seven source rungs, top-down (product=0 … entity=6).
func TestRungsTool(t *testing.T) {
	_, out, _ := listRungs(context.Background(), nil, rungsInput{})
	if len(out.Rungs) != 7 || out.Rungs[0].Letter != "product" || out.Rungs[6].Letter != "entity" {
		t.Fatalf("rungs tool wrong ladder: %+v", out.Rungs)
	}
	if out.Rungs[0].Depth != 0 || out.Rungs[6].Depth != 6 {
		t.Fatalf("rungs depths wrong: %+v", out.Rungs)
	}
}

// guard the import is exercised (the facets octuor backs the grid's orthogonal axis).
func TestFacetsBacking(t *testing.T) {
	if len(facets.Facets()) != 8 {
		t.Fatalf("the grid orthogonal axis must be the FK02 octuor")
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
