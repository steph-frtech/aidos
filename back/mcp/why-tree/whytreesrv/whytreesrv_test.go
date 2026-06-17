package whytreesrv

import (
	"context"
	"testing"
)

// The MCP server is the capability door over FK13 — it must build and each tool must faithfully
// relay the pure verdict / refusal (the wall: it adds no judgment; the judge is the reproduction bool).

func exampleEdges() []edgeIn {
	return []edgeIn{
		{From: refIn{ID: "checkout-accept", Version: "v1"}, To: refIn{ID: "createOrder", Version: "v1"}},
		{From: refIn{ID: "createOrder", Version: "v1"}, To: refIn{ID: "Order", Version: "v1"}},
		{From: refIn{ID: "Order", Version: "v1"}, To: refIn{ID: "add_total_col", Version: "v1"}},
	}
}

func allRepro() []reproIn {
	return []reproIn{
		{CauseID: "createOrder", Reproduced: true},
		{CauseID: "Order", Reproduced: true},
		{CauseID: "add_total_col", Reproduced: true},
	}
}

func TestServerBuilds(t *testing.T) {
	if srv := NewServer(); srv == nil {
		t.Fatal("NewServer returned nil")
	}
}

func TestBuild_RootedAtDeepestReproducedCause(t *testing.T) {
	_, out, err := build(context.Background(), nil, buildIn{
		Symptom:       "checkout-accept",
		Provenance:    "mirror",
		Edges:         exampleEdges(),
		Reproductions: allRepro(),
		Terminal:      terminalIn{MirrorID: "m1", ReflectsRootCause: "add_total_col"},
	})
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	if out.Error != "" {
		t.Fatalf("expected a built tree, got error %q", out.Error)
	}
	if out.RootCause != "add_total_col" {
		t.Fatalf("root = %q, want add_total_col", out.RootCause)
	}
	if out.MirrorID != "m1" {
		t.Fatalf("a built tree must carry its terminal mirror id, got %q", out.MirrorID)
	}
}

func TestBuild_NoMirrorRefused(t *testing.T) {
	_, out, _ := build(context.Background(), nil, buildIn{
		Symptom:       "checkout-accept",
		Provenance:    "mirror",
		Edges:         exampleEdges(),
		Reproductions: allRepro(),
		Terminal:      terminalIn{}, // no mirror
	})
	if out.Error != "WHYTREE_NO_MIRROR" {
		t.Fatalf("expected WHYTREE_NO_MIRROR, got %q", out.Error)
	}
}

func TestBuild_NonReproducedCauseRefused(t *testing.T) {
	repros := []reproIn{
		{CauseID: "createOrder", Reproduced: true},
		{CauseID: "Order", Reproduced: false},
		{CauseID: "add_total_col", Reproduced: true},
	}
	_, out, _ := build(context.Background(), nil, buildIn{
		Symptom:       "checkout-accept",
		Provenance:    "mirror",
		Edges:         exampleEdges(),
		Reproductions: repros,
		Terminal:      terminalIn{MirrorID: "m1", ReflectsRootCause: "add_total_col"},
	})
	if out.Error != "WHYTREE_CAUSE_NOT_REPRODUCED" {
		t.Fatalf("expected WHYTREE_CAUSE_NOT_REPRODUCED, got %q", out.Error)
	}
}

func TestBuild_CycleRefused(t *testing.T) {
	cyclic := []edgeIn{
		{From: refIn{ID: "a", Version: "v1"}, To: refIn{ID: "b", Version: "v1"}},
		{From: refIn{ID: "b", Version: "v1"}, To: refIn{ID: "a", Version: "v1"}},
	}
	_, out, _ := build(context.Background(), nil, buildIn{
		Symptom:       "a",
		Provenance:    "mirror",
		Edges:         cyclic,
		Reproductions: []reproIn{{CauseID: "b", Reproduced: true}, {CauseID: "a", Reproduced: true}},
		Terminal:      terminalIn{MirrorID: "m1", ReflectsRootCause: "x"},
	})
	if out.Error != "CAUSED_BY_CYCLE" {
		t.Fatalf("expected CAUSED_BY_CYCLE, got %q", out.Error)
	}
}

func TestSerialize_RoundTripVersioned(t *testing.T) {
	in := buildIn{
		Symptom:       "checkout-accept",
		Provenance:    "mirror",
		Edges:         exampleEdges(),
		Reproductions: allRepro(),
		Terminal:      terminalIn{MirrorID: "m1", ReflectsRootCause: "add_total_col"},
	}
	_, out1, err := serialize(context.Background(), nil, in)
	if err != nil || out1.Version == "" {
		t.Fatalf("serialize: err=%v version=%q error=%q", err, out1.Version, out1.Error)
	}
	in2 := in
	in2.Terminal = terminalIn{MirrorID: "m2", ReflectsRootCause: "add_total_col"}
	_, out2, _ := serialize(context.Background(), nil, in2)
	if out2.Version == out1.Version {
		t.Fatal("a changed terminal mirror must yield a different version")
	}
}

func TestKinds(t *testing.T) {
	_, out, _ := kinds(context.Background(), nil, struct{}{})
	if out.LinkKind != "why_tree" || len(out.Provenances) != 3 {
		t.Fatalf("kinds = %+v", out)
	}
}
