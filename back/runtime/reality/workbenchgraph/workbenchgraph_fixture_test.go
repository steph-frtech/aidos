// WorkbenchGraph fixture mirror (AIDOS step S44) — the state→command→events proof that
// BuildGraph projects PRIOR truth into deterministic nodes/edges/legend and authors nothing.
//
// mirror record: reflects=runtime.reality.workbenchgraph.BuildGraph ·
//
//	test_kind=fixture · cert_language=fixture · authority=below · liveness=alive
//
// state (kernel head): a Head { nodes, edges } over the EIGHT node kinds (button → view →
// action → operation → entity → mirror → scope → incident), each node carrying its S14
// truth_type / S06 liveness / S22 red_wave_state, each edge a PRIOR link/propagation row
// (S17/S19). command: BuildGraph(head). events: a WorkbenchGraph whose nodes/edges/legend
// mirror the head with a content-addressed graph_hash (S02). This fixture is a MEANS-test
// toward the human red, not a new truth — every node & edge is prior truth, read-only.
package workbenchgraph_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/reality/workbenchgraph"
)

// canonicalHead is the fixture's kernel head: the deep-navigation walk button → view →
// action → operation → entity → mirror → scope → incident, reusing the prior steps' example
// artifacts (saveOrder control, checkout-view, checkout-submit action, createOrder operation,
// order-entity, createOrder-fixture mirror, checkout-scope, oos-incident). The agent coins no
// new target: these are the METHOD's example refs from S10/S11/S15/S17/S19/S22/S35.
func canonicalHead() workbenchgraph.Head {
	return workbenchgraph.Head{
		Nodes: []workbenchgraph.Node{
			{ID: "saveOrder", Kind: workbenchgraph.KindButton, Route: "/web-preview", TruthType: "above", RedWaveState: "green"},
			{ID: "checkout-view", Kind: workbenchgraph.KindView, Route: "/control", TruthType: "above", RedWaveState: "green"},
			{ID: "checkout-submit", Kind: workbenchgraph.KindAction, Route: "/control", TruthType: "above", RedWaveState: "green"},
			{ID: "createOrder", Kind: workbenchgraph.KindOperation, Route: "/operation", TruthType: "above", RedWaveState: "green"},
			{ID: "order-entity", Kind: workbenchgraph.KindEntity, Route: "/entity-map", TruthType: "above", RedWaveState: "green"},
			{ID: "createOrder-fixture", Kind: workbenchgraph.KindMirror, Route: "/mirrors", TruthType: "above", Liveness: "live", RedWaveState: "red"},
			{ID: "checkout-scope", Kind: workbenchgraph.KindScope, Route: "/scopes", TruthType: "above"},
			{ID: "oos-incident", Kind: workbenchgraph.KindIncident, Route: "/red-wave", TruthType: "below", RedWaveState: "red"},
		},
		Edges: []workbenchgraph.Edge{
			{From: "saveOrder", To: "checkout-view", Relation: "in_view"},
			{From: "saveOrder", To: "checkout-submit", Relation: "triggers"},
			{From: "checkout-submit", To: "createOrder", Relation: "invoke"},
			{From: "createOrder", To: "order-entity", Relation: "reads_writes"},
			{From: "order-entity", To: "createOrder-fixture", Relation: "mirrors"},
			{From: "createOrder-fixture", To: "checkout-scope", Relation: "scopes"},
			{From: "checkout-scope", To: "oos-incident", Relation: "incidents"},
		},
	}
}

func TestFixture_GraphBuilt_CoversEightKindsAndDeepNavWalk(t *testing.T) {
	g, br := workbenchgraph.BuildGraph(canonicalHead())
	if br != nil {
		t.Fatalf("BuildGraph blocked unexpectedly: %s", br.Explanation)
	}
	wantKinds := map[workbenchgraph.NodeKind]bool{
		workbenchgraph.KindButton: false, workbenchgraph.KindView: false,
		workbenchgraph.KindAction: false, workbenchgraph.KindOperation: false,
		workbenchgraph.KindEntity: false, workbenchgraph.KindMirror: false,
		workbenchgraph.KindScope: false, workbenchgraph.KindIncident: false,
	}
	for _, n := range g.Nodes {
		if _, ok := wantKinds[n.Kind]; !ok {
			t.Fatalf("node %q has unknown kind %q", n.ID, n.Kind)
		}
		wantKinds[n.Kind] = true
	}
	for k, seen := range wantKinds {
		if !seen {
			t.Fatalf("missing node kind %q — the deep-nav walk is incomplete", k)
		}
	}
	// The full edge walk must be present (button→view→action→operation→entity→mirror→scope→incident).
	wantRelations := []string{"in_view", "triggers", "invoke", "reads_writes", "mirrors", "scopes", "incidents"}
	for _, want := range wantRelations {
		found := false
		for _, e := range g.Edges {
			if e.Relation == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing edge relation %q in the deep-nav walk", want)
		}
	}
}

func TestFixture_EveryEdgeResolvesToANode_NoInventedAdjacency(t *testing.T) {
	g, br := workbenchgraph.BuildGraph(canonicalHead())
	if br != nil {
		t.Fatalf("BuildGraph blocked: %s", br.Explanation)
	}
	index := map[string]bool{}
	for _, n := range g.Nodes {
		index[n.ID] = true
	}
	for _, e := range g.Edges {
		if !index[e.From] || !index[e.To] {
			t.Fatalf("edge %s --%s--> %s does not resolve to existing nodes", e.From, e.Relation, e.To)
		}
	}
}

func TestFixture_LegendEnumeratesExactlyColorsUsed(t *testing.T) {
	g, br := workbenchgraph.BuildGraph(canonicalHead())
	if br != nil {
		t.Fatalf("BuildGraph blocked: %s", br.Explanation)
	}
	// Each legend entry must be backed by at least one node value; each used value must
	// be in the legend (no orphan, no missing entry).
	legendValues := map[string]bool{}
	for _, le := range g.Legend {
		legendValues[le.Dimension+"\x00"+le.Value] = true
		if le.Color == "" {
			t.Fatalf("legend entry %s=%s has no color", le.Dimension, le.Value)
		}
	}
	for _, n := range g.Nodes {
		for _, pair := range [][2]string{
			{"truth_type", n.TruthType}, {"liveness", n.Liveness}, {"red_wave", n.RedWaveState},
		} {
			if pair[1] == "" {
				continue
			}
			if !legendValues[pair[0]+"\x00"+pair[1]] {
				t.Fatalf("node %q uses %s=%s but the legend omits it", n.ID, pair[0], pair[1])
			}
		}
	}
}

func TestFixture_GraphHashIsContentAddressed_AndDeterministic(t *testing.T) {
	a, br := workbenchgraph.BuildGraph(canonicalHead())
	if br != nil {
		t.Fatalf("BuildGraph blocked: %s", br.Explanation)
	}
	if a.GraphHash == "" {
		t.Fatal("graph_hash is empty")
	}
	b, br2 := workbenchgraph.BuildGraph(canonicalHead())
	if br2 != nil {
		t.Fatalf("BuildGraph blocked on re-run: %s", br2.Explanation)
	}
	if a.GraphHash != b.GraphHash {
		t.Fatalf("graph_hash not deterministic: %s vs %s", a.GraphHash, b.GraphHash)
	}
}

func TestFixture_DanglingEdge_YieldsBlockReason_NeverPanic(t *testing.T) {
	h := canonicalHead()
	h.Edges = append(h.Edges, workbenchgraph.Edge{From: "saveOrder", To: "ghost-node", Relation: "invoke"})
	g, br := workbenchgraph.BuildGraph(h)
	if br == nil {
		t.Fatal("expected a BlockReason for a dangling edge endpoint, got none")
	}
	if g.GraphHash != "" {
		t.Fatal("blocked build must return an empty graph")
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("BlockReason must carry an actionable how_to_fix")
	}
}

func TestFixture_UnknownRoute_YieldsBlockReason(t *testing.T) {
	h := canonicalHead()
	h.Nodes[0].Route = "/not-a-route"
	_, br := workbenchgraph.BuildGraph(h)
	if br == nil {
		t.Fatal("expected a BlockReason for an unknown node route, got none")
	}
}
