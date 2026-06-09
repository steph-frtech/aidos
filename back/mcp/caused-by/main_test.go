package main

import (
	"context"
	"testing"
)

// The MCP server is the capability door over FK12 — it must build and each tool must faithfully
// relay the pure verdict (the wall: it adds no judgment).

func TestServerBuilds(t *testing.T) {
	if srv := newMCPServer(); srv == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestValidate_SelfEdgeRefused(t *testing.T) {
	_, out, err := validate(context.Background(), nil, edgeIn{
		From: refIn{ID: "n0", Version: "v1"},
		To:   refIn{ID: "n0", Version: "v2"},
	})
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if out.Valid || out.Error != "SELF_CAUSE" {
		t.Fatalf("a self-edge must be refused SELF_CAUSE, got valid=%v err=%q", out.Valid, out.Error)
	}
}

func TestTrace_ProducesOrderedChain(t *testing.T) {
	_, out, err := traceTool(context.Background(), nil, traceIn{
		Symptom: "checkout-accept",
		Edges: []edgeIn{
			{From: refIn{ID: "checkout-accept", Version: "v1"}, To: refIn{ID: "createOrder", Version: "v1"}},
			{From: refIn{ID: "createOrder", Version: "v1"}, To: refIn{ID: "Order", Version: "v1"}},
		},
	})
	if err != nil {
		t.Fatalf("trace: %v", err)
	}
	if out.Cycle {
		t.Fatal("acyclic graph must not report a cycle")
	}
	want := []string{"createOrder", "Order"}
	if len(out.Causes) != len(want) {
		t.Fatalf("causes = %v, want %v", out.Causes, want)
	}
	for i := range want {
		if out.Causes[i] != want[i] {
			t.Fatalf("cause[%d] = %q, want %q", i, out.Causes[i], want[i])
		}
	}
}

func TestTrace_CycleRefused(t *testing.T) {
	_, out, err := traceTool(context.Background(), nil, traceIn{
		Symptom: "a",
		Edges: []edgeIn{
			{From: refIn{ID: "a", Version: "v1"}, To: refIn{ID: "b", Version: "v1"}},
			{From: refIn{ID: "b", Version: "v1"}, To: refIn{ID: "a", Version: "v1"}},
		},
	})
	if err != nil {
		t.Fatalf("trace: %v", err)
	}
	if !out.Cycle || out.Error != "CAUSED_BY_CYCLE" {
		t.Fatalf("a cycle must be refused, got cycle=%v err=%q", out.Cycle, out.Error)
	}
}

func TestSerialize_RoundTripVersioned(t *testing.T) {
	edge := edgeIn{From: refIn{ID: "a", Version: "v1"}, To: refIn{ID: "b", Version: "v1"}}
	_, out1, err := serialize(context.Background(), nil, edge)
	if err != nil || out1.Version == "" {
		t.Fatalf("serialize: err=%v version=%q", err, out1.Version)
	}
	// a changed cause version yields a different record version.
	edge2 := edgeIn{From: refIn{ID: "a", Version: "v1"}, To: refIn{ID: "b", Version: "v2"}}
	_, out2, err := serialize(context.Background(), nil, edge2)
	if err != nil {
		t.Fatalf("serialize2: %v", err)
	}
	if out1.Version == out2.Version {
		t.Fatalf("changing the cause version must change the record version: %q", out1.Version)
	}
}

func TestKinds_ReportsCausedBy(t *testing.T) {
	_, out, err := kinds(context.Background(), nil, struct{}{})
	if err != nil || out.Kind != "caused_by" {
		t.Fatalf("kinds = %q err=%v, want caused_by", out.Kind, err)
	}
}
