package main

import (
	"context"
	"testing"
)

// TestCheck_FaultInjection — removing a pair of an instantiated facet → monster surfaced.
func TestCheck_FaultInjection(t *testing.T) {
	// op1 instantiates F + S; only the F pair is living → S has no pair = monster.
	in := checkInput{
		Layers: []layerInput{
			{LayerID: "op1", Version: "v1", Kind: "operation", Facets: []string{"F", "S"}},
		},
		Mirrors: []mirrorInput{
			{MirrorID: "m-f", ReflectsID: "op1", ReflectsVer: "v1", Facet: "F", TestKind: "fixture", CertLanguage: "fixture", Liveness: "alive"},
		},
	}
	_, out, err := check(context.Background(), nil, in)
	if err != nil || !out.OK {
		t.Fatalf("check errored: %+v err=%v", out, err)
	}
	if out.Verdict != "RED_MONSTER" {
		t.Fatalf("a missing S pair must be RED_MONSTER, got %s", out.Verdict)
	}
	if len(out.FacetMonsters) != 1 || out.FacetMonsters[0].Facet != "S" || out.FacetMonsters[0].Reason != "no_facet_pair" {
		t.Fatalf("want one S facet monster, got %+v", out.FacetMonsters)
	}
}

// TestCheck_CollapsedKernelPasses — F alone with its living pair → COMPLETE.
func TestCheck_CollapsedKernelPasses(t *testing.T) {
	in := checkInput{
		Layers: []layerInput{
			{LayerID: "sort", Version: "v1", Kind: "operation", Facets: []string{"F"}},
		},
		Mirrors: []mirrorInput{
			{MirrorID: "m-f", ReflectsID: "sort", ReflectsVer: "v1", Facet: "F", TestKind: "fixture", CertLanguage: "fixture", Liveness: "alive"},
		},
	}
	_, out, _ := check(context.Background(), nil, in)
	if out.Verdict != "COMPLETE" || len(out.FacetMonsters) != 0 {
		t.Fatalf("a collapsed legal kernel must PASS, got %s %+v", out.Verdict, out.FacetMonsters)
	}
}

// TestCheck_SoftXAdvisory — a missing X pair is advisory, never a hard block.
func TestCheck_SoftXAdvisory(t *testing.T) {
	in := checkInput{
		Layers: []layerInput{
			{LayerID: "view1", Version: "v1", Kind: "view", Facets: []string{"F", "X"}},
		},
		Mirrors: []mirrorInput{
			{MirrorID: "m-f", ReflectsID: "view1", ReflectsVer: "v1", Facet: "F", TestKind: "e2e", CertLanguage: "gherkin", Liveness: "alive"},
		},
	}
	_, out, _ := check(context.Background(), nil, in)
	if out.Verdict != "COMPLETE" {
		t.Fatalf("a missing X pair must not hard-block, got %s", out.Verdict)
	}
	if len(out.Advisory) != 1 || out.Advisory[0].Facet != "X" {
		t.Fatalf("the X miss must be advisory, got %+v", out.Advisory)
	}
}

// TestCheck_Divergence — a dead pair (the proof does not run) is a monster.
func TestCheck_Divergence(t *testing.T) {
	in := checkInput{
		Layers: []layerInput{
			{LayerID: "op4", Version: "v1", Kind: "operation", Facets: []string{"F", "S"}},
		},
		Mirrors: []mirrorInput{
			{MirrorID: "m-f", ReflectsID: "op4", ReflectsVer: "v1", Facet: "F", TestKind: "fixture", CertLanguage: "fixture", Liveness: "alive"},
			{MirrorID: "m-s", ReflectsID: "op4", ReflectsVer: "v1", Facet: "S", TestKind: "property", CertLanguage: "rapid", Liveness: "dead"},
		},
	}
	_, out, _ := check(context.Background(), nil, in)
	if out.Verdict != "RED_MONSTER" || len(out.FacetMonsters) != 1 || out.FacetMonsters[0].Facet != "S" {
		t.Fatalf("a dead S pair must be a monster, got %s %+v", out.Verdict, out.FacetMonsters)
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
