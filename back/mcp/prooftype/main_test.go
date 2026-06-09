package main

import (
	"context"
	"testing"
)

// TestMapNToE_N5 — N5 (infra) maps to E3 + E4 (the FKE-16 line).
func TestMapNToE_N5(t *testing.T) {
	_, out, err := mapNToE(context.Background(), nil, mapInput{NLevel: "N5"})
	if err != nil || !out.OK {
		t.Fatalf("map errored: %+v err=%v", out, err)
	}
	if len(out.Evidence) != 2 || out.Evidence[0].Level != 3 || out.Evidence[1].Level != 4 {
		t.Fatalf("N5 must map to E3,E4; got %+v", out.Evidence)
	}
}

// TestMapNToE_UnknownEmpty — an unknown N maps to the empty set (total).
func TestMapNToE_UnknownEmpty(t *testing.T) {
	_, out, _ := mapNToE(context.Background(), nil, mapInput{NLevel: "N9"})
	if len(out.Evidence) != 0 {
		t.Fatalf("unknown N must map to empty; got %+v", out.Evidence)
	}
}

// TestTag_PreservesNAddsE4 — a security kernel's tag preserves N and adds E4 (gosec/gitleaks/evals).
func TestTag_PreservesNAddsE4(t *testing.T) {
	_, out, err := tag(context.Background(), nil, tagInput{NLevel: "N4", Facets: []string{"S"}})
	if err != nil || !out.OK {
		t.Fatalf("tag errored: %+v err=%v", out, err)
	}
	if out.N != "N4" {
		t.Fatalf("tag must preserve N verbatim; got %s", out.N)
	}
	if !hasLevel(out.E.Required, 4) {
		t.Fatalf("S kernel must require E4; got %+v", out.E.Required)
	}
	if !hasLevel(out.E.FromFacets, 4) {
		t.Fatalf("E4 must be attributed to from_facets; got %+v", out.E.FromFacets)
	}
	if !hasLevel(out.E.FromN, 1) || !hasLevel(out.E.FromN, 2) {
		t.Fatalf("N4 base must contribute E1,E2; got %+v", out.E.FromN)
	}
}

// TestTag_E6ViaReliability — R adds E6 (runtime+rollback).
func TestTag_E6ViaReliability(t *testing.T) {
	_, out, _ := tag(context.Background(), nil, tagInput{NLevel: "N2", Facets: []string{"R"}})
	if !hasLevel(out.E.Required, 6) {
		t.Fatalf("R must require E6 (runtime/rollback); got %+v", out.E.Required)
	}
}

// TestTag_E7ViaFormalOnly — E7 (formal) only via the formal flag, never an ordinary kernel.
func TestTag_E7ViaFormalOnly(t *testing.T) {
	_, ordinary, _ := tag(context.Background(), nil, tagInput{NLevel: "N1", Facets: []string{"I", "S", "R"}})
	if hasLevel(ordinary.E.Required, 7) {
		t.Fatalf("ordinary kernel must not require E7; got %+v", ordinary.E.Required)
	}
	_, formal, _ := tag(context.Background(), nil, tagInput{NLevel: "N1", RequiresFormal: true})
	if !hasLevel(formal.E.Required, 7) {
		t.Fatalf("formal-cap kernel must require E7; got %+v", formal.E.Required)
	}
}

// TestTag_SoftXAddsNothing — the soft facet X adds no hard E (§13.6).
func TestTag_SoftXAddsNothing(t *testing.T) {
	_, withX, _ := tag(context.Background(), nil, tagInput{NLevel: "N0", Facets: []string{"X"}})
	if len(withX.E.FromFacets) != 0 {
		t.Fatalf("X must add no facet evidence; got %+v", withX.E.FromFacets)
	}
}

func hasLevel(es []eLevelOut, lvl int) bool {
	for _, e := range es {
		if e.Level == lvl {
			return true
		}
	}
	return false
}
