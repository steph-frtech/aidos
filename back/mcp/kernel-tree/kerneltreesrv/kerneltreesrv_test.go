package kerneltreesrv

import (
	"context"
	"testing"
)

func ref(id, v string) refIn { return refIn{ID: id, Version: v} }

// node helper.
func node(id, mirror string) nodeIn {
	return nodeIn{LayerID: id, Version: "v1", OwnMirror: mirror, ActivationThreshold: 0}
}

// TestWeightsTool — the two closed declared weights.
func TestWeightsTool(t *testing.T) {
	_, out, _ := weights(context.Background(), nil, weightsInput{})
	if len(out.Weights) != 2 || out.Weights[0] != "load-bearing" || out.Weights[1] != "cosmetic" {
		t.Fatalf("weights wrong closed set: %+v", out.Weights)
	}
}

// TestAggregateGreen — a green whole over a green part aggregates GREEN.
func TestAggregateGreen(t *testing.T) {
	tree := treeIn{
		Nodes: []nodeIn{node("whole", "GREEN"), node("part", "GREEN")},
		Edges: []edgeIn{{Parent: ref("whole", "v1"), Child: ref("part", "v1"), Weight: "load-bearing"}},
	}
	_, out, _ := aggregate(context.Background(), nil, aggregateInput{Tree: tree, Root: "whole"})
	if !out.OK || out.Verdict != "GREEN" {
		t.Fatalf("a green whole over a green part ⇒ GREEN: %+v", out)
	}
}

// TestAggregateRedChild — a RED part reddens the aggregated whole; the drill-down names the chain.
func TestAggregateRedChild(t *testing.T) {
	tree := treeIn{
		Nodes: []nodeIn{node("whole", "GREEN"), node("part", "RED")},
		Edges: []edgeIn{{Parent: ref("whole", "v1"), Child: ref("part", "v1"), Weight: "load-bearing"}},
	}
	_, out, _ := aggregate(context.Background(), nil, aggregateInput{Tree: tree, Root: "whole"})
	if out.Verdict != "RED" {
		t.Fatalf("a red part must redden the whole: %+v", out)
	}
	if len(out.DrillDown) < 2 || out.DrillDown[len(out.DrillDown)-1].LayerID != "part" {
		t.Fatalf("the drill-down must name the chain down to the red child: %+v", out.DrillDown)
	}
}

// TestAggregateCycleRefused — a composes cycle is a typed refusal (CAUSED_BY_CYCLE), not a hang.
func TestAggregateCycleRefused(t *testing.T) {
	tree := treeIn{
		Nodes: []nodeIn{node("a", "GREEN"), node("b", "GREEN")},
		Edges: []edgeIn{
			{Parent: ref("a", "v1"), Child: ref("b", "v1"), Weight: "load-bearing"},
			{Parent: ref("b", "v1"), Child: ref("a", "v1"), Weight: "load-bearing"},
		},
	}
	_, out, _ := aggregate(context.Background(), nil, aggregateInput{Tree: tree, Root: "a"})
	if out.OK || out.Error != "CAUSED_BY_CYCLE" || len(out.Cycle) == 0 {
		t.Fatalf("a cycle must be a typed refusal: %+v", out)
	}
}

// TestReopensTool — a load-bearing changed child reopens; a cosmetic one (alone) does not.
func TestReopensTool(t *testing.T) {
	base := treeIn{
		Nodes: []nodeIn{node("whole", "GREEN"), node("lb", "GREEN"), node("cos", "GREEN")},
		Edges: []edgeIn{
			{Parent: ref("whole", "v1"), Child: ref("lb", "v1"), Weight: "load-bearing"},
			{Parent: ref("whole", "v1"), Child: ref("cos", "v1"), Weight: "cosmetic"},
		},
	}
	lb := base
	lb.Changed = []string{"lb"}
	_, out, _ := reopens(context.Background(), nil, reopensInput{Tree: lb, Root: "whole"})
	if !out.Reopens || out.Activation <= 0 {
		t.Fatalf("a load-bearing change must reopen: %+v", out)
	}
	cos := base
	cos.Changed = []string{"cos"}
	_, out2, _ := reopens(context.Background(), nil, reopensInput{Tree: cos, Root: "whole"})
	if out2.Reopens || out2.Activation != 0 {
		t.Fatalf("a cosmetic-only change below threshold must not reopen: %+v", out2)
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}
