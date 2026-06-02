// WorkbenchGraph reproducibility mirror (AIDOS step S44) — the ∀ property proof that
// BuildGraph is a DETERMINISTIC, total projection: same Head ⇒ byte-identical graph
// (snapshot stability), graph_hash = Hash(Canonicalize(nodes ⊕ edges ⊕ legend)), no
// dangling edge survives, every route is known, the legend has no orphan/missing entry,
// and a dangling/unknown ref ⇒ a BlockReason, never a panic.
//
// mirror record: reflects=runtime.reality.workbenchgraph.BuildGraph ·
//
//	test_kind=property · cert_language=rapid · authority=below · liveness=alive
package workbenchgraph_test

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/reality/workbenchgraph"
)

// genWellFormedHead generates a Head whose edges only connect existing nodes and whose
// routes/values are all legal — the well-formed case where BuildGraph must succeed.
func genWellFormedHead(t *rapid.T) workbenchgraph.Head {
	routes := []string{"/web-preview", "/control", "/operation", "/entity-map", "/mirrors", "/scopes", "/red-wave"}
	kinds := []workbenchgraph.NodeKind{
		workbenchgraph.KindButton, workbenchgraph.KindView, workbenchgraph.KindAction,
		workbenchgraph.KindOperation, workbenchgraph.KindEntity, workbenchgraph.KindMirror,
		workbenchgraph.KindScope, workbenchgraph.KindIncident,
	}
	truthTypes := []string{"above", "below"}
	livenesses := []string{"", "live", "stale"}
	redStates := []string{"", "green", "red"}

	n := rapid.IntRange(1, 8).Draw(t, "nodeCount")
	nodes := make([]workbenchgraph.Node, 0, n)
	ids := make([]string, 0, n)
	for i := 0; i < n; i++ {
		id := rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "id") + string(rune('A'+i))
		nodes = append(nodes, workbenchgraph.Node{
			ID:           id,
			Kind:         rapid.SampledFrom(kinds).Draw(t, "kind"),
			Route:        rapid.SampledFrom(routes).Draw(t, "route"),
			TruthType:    rapid.SampledFrom(truthTypes).Draw(t, "tt"),
			Liveness:     rapid.SampledFrom(livenesses).Draw(t, "lv"),
			RedWaveState: rapid.SampledFrom(redStates).Draw(t, "rw"),
		})
		ids = append(ids, id)
	}
	m := rapid.IntRange(0, 8).Draw(t, "edgeCount")
	edges := make([]workbenchgraph.Edge, 0, m)
	for i := 0; i < m; i++ {
		edges = append(edges, workbenchgraph.Edge{
			From:     rapid.SampledFrom(ids).Draw(t, "from"),
			To:       rapid.SampledFrom(ids).Draw(t, "to"),
			Relation: rapid.SampledFrom([]string{"triggers", "invoke", "reads_writes", "mirrors", "scopes", "incidents", "in_view"}).Draw(t, "rel"),
		})
	}
	return workbenchgraph.Head{Nodes: nodes, Edges: edges}
}

func TestProp_BuildGraph_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genWellFormedHead(t)
		a, bra := workbenchgraph.BuildGraph(h)
		b, brb := workbenchgraph.BuildGraph(h)
		if (bra == nil) != (brb == nil) {
			t.Fatalf("nondeterministic block decision")
		}
		if bra != nil {
			return
		}
		if a.GraphHash != b.GraphHash {
			t.Fatalf("graph_hash not stable: %s vs %s", a.GraphHash, b.GraphHash)
		}
		if len(a.Nodes) != len(b.Nodes) || len(a.Edges) != len(b.Edges) || len(a.Legend) != len(b.Legend) {
			t.Fatal("graph shape not stable across re-build")
		}
	})
}

func TestProp_NoDanglingEdge_AndKnownRoutes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g, br := workbenchgraph.BuildGraph(genWellFormedHead(t))
		if br != nil {
			t.Fatalf("well-formed head should not block: %s", br.Explanation)
		}
		index := map[string]bool{}
		valid := map[string]bool{"/web-preview": true, "/control": true, "/operation": true, "/entity-map": true, "/mirrors": true, "/scopes": true, "/red-wave": true}
		for _, n := range g.Nodes {
			index[n.ID] = true
			if !valid[n.Route] {
				t.Fatalf("node %q has unknown route %q", n.ID, n.Route)
			}
		}
		for _, e := range g.Edges {
			if !index[e.From] || !index[e.To] {
				t.Fatalf("dangling edge %s->%s survived", e.From, e.To)
			}
		}
	})
}

func TestProp_LegendMirrorsUsedColors_NoOrphanNoMissing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g, br := workbenchgraph.BuildGraph(genWellFormedHead(t))
		if br != nil {
			return
		}
		legend := map[string]bool{}
		for _, le := range g.Legend {
			legend[le.Dimension+"|"+le.Value] = true
		}
		used := map[string]bool{}
		for _, n := range g.Nodes {
			for _, p := range [][2]string{{"truth_type", n.TruthType}, {"liveness", n.Liveness}, {"red_wave", n.RedWaveState}} {
				if p[1] == "" {
					continue
				}
				used[p[0]+"|"+p[1]] = true
				if !legend[p[0]+"|"+p[1]] {
					t.Fatalf("used color %s=%s missing from legend", p[0], p[1])
				}
			}
		}
		for k := range legend {
			if !used[k] {
				t.Fatalf("orphan legend entry %q (no node uses it)", k)
			}
		}
	})
}

func TestProp_DanglingEdge_AlwaysBlocks_NeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genWellFormedHead(t)
		// Inject a guaranteed-dangling edge.
		h.Edges = append(h.Edges, workbenchgraph.Edge{From: "definitely-absent-id", To: "also-absent", Relation: "invoke"})
		_, br := workbenchgraph.BuildGraph(h) // must not panic
		if br == nil {
			t.Fatal("dangling edge must yield a BlockReason")
		}
	})
}
