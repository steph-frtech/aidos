package besoin

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// graph_property_test.go — the EL03 mirror (∀ invariant, property form, rapid). Written RED first
// (CLAUDE.md Mandat A): the BesoinGraph record must be content-addressed via records.Hash so the
// SAME ANSWERS yield the SAME graph_hash regardless of insertion/key order; the round-trip must be
// lossless; two graphs of distinct projects must be disjoint; and by construction the record carries
// NO Version and NO Mirror field. Determinism-first: build + addressing are pure total functions.

// drawNode builds an arbitrary valid LevelNode for a given level (rapid).
func drawNode(rt *rapid.T, l Level, label string) LevelNode {
	status := rapid.SampledFrom(NodeStatuses()).Draw(rt, label+".status")
	intent := rapid.StringMatching(`[a-z ]{1,12}`).Draw(rt, label+".intent")
	body, _ := json.Marshal(map[string]string{"intent": intent})
	nOQ := rapid.IntRange(0, 3).Draw(rt, label+".noq")
	var oq []string
	for i := 0; i < nOQ; i++ {
		oq = append(oq, rapid.StringMatching(`[a-z]{1,6}`).Draw(rt, label+".oq"))
	}
	n := LevelNode{
		Level:         l,
		Body:          body,
		Provenance:    Provenance{Source: "human", Detail: intent},
		Status:        status,
		OpenQuestions: oq,
	}
	if to, field, ok := OutgoingRef(l); ok {
		n.Refs = []Ref{{Field: field, To: to}}
	}
	return n
}

// buildGraph adds a random subset of levels (in a RANDOM insertion order) to a project graph.
func buildGraph(rt *rapid.T, project string, label string) BesoinGraph {
	all := AllLevels()
	// random permutation of a random-size prefix
	perm := rapid.Permutation(all).Draw(rt, label+".perm")
	k := rapid.IntRange(1, len(all)).Draw(rt, label+".k")
	g := NewGraph(project)
	for i := 0; i < k; i++ {
		n := drawNode(rt, perm[i], label+".n")
		ng, err := g.AddNode(n)
		if err != nil {
			rt.Fatalf("AddNode(%q) err = %v", perm[i], err)
		}
		g = ng
	}
	return g
}

// Property: the graph_hash is INSERTION-ORDER-INDEPENDENT — same answers (same node set) in any order
// → same graph_hash (determinism-first, content-addressing).
func TestGraphHashOrderIndependent(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		levels := AllLevels()
		k := rapid.IntRange(1, len(levels)).Draw(rt, "k")
		// Fix one concrete node per level so the two graphs carry IDENTICAL content.
		nodes := make([]LevelNode, k)
		permA := rapid.Permutation(levels).Draw(rt, "permA")
		for i := 0; i < k; i++ {
			nodes[i] = drawNode(rt, permA[i], "node")
		}
		// Graph A: insert in order. Graph B: insert reversed.
		ga := NewGraph("proj")
		for i := 0; i < k; i++ {
			ga, _ = ga.AddNode(nodes[i])
		}
		gb := NewGraph("proj")
		for i := k - 1; i >= 0; i-- {
			gb, _ = gb.AddNode(nodes[i])
		}
		ha, err := ga.Hash()
		if err != nil {
			rt.Fatalf("ga.Hash err = %v", err)
		}
		hb, err := gb.Hash()
		if err != nil {
			rt.Fatalf("gb.Hash err = %v", err)
		}
		if ha != hb {
			rt.Fatalf("graph_hash not order-independent: %q vs %q", ha, hb)
		}
	})
}

// Property: the graph_hash is KEY-ORDER-INDEPENDENT in node bodies — Canonicalize sorts keys
// recursively, so a body with reordered keys yields the same hash.
func TestGraphHashKeyOrderIndependent(t *testing.T) {
	bodyA := json.RawMessage(`{"intent":"x","scenarios":["a","b"]}`)
	bodyB := json.RawMessage(`{"scenarios":["a","b"],"intent":"x"}`)
	mk := func(b json.RawMessage) BesoinGraph {
		g := NewGraph("p")
		g, err := g.AddNode(LevelNode{
			Level:      LevelProduct,
			Body:       b,
			Provenance: Provenance{Source: "human", Detail: "x"},
			Status:     NodeResolved,
		})
		if err != nil {
			t.Fatalf("AddNode err = %v", err)
		}
		return g
	}
	ha, err := mk(bodyA).Hash()
	if err != nil {
		t.Fatalf("hash A err = %v", err)
	}
	hb, err := mk(bodyB).Hash()
	if err != nil {
		t.Fatalf("hash B err = %v", err)
	}
	if ha != hb {
		t.Fatalf("graph_hash not key-order-independent: %q vs %q", ha, hb)
	}
}

// Property: round-trip Canonicalize → Unmarshal → Canonicalize is byte-lossless and hash-stable.
func TestGraphRoundTripLossless(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := buildGraph(rt, "proj-rt", "g")
		canon, err := g.Canonicalize()
		if err != nil {
			rt.Fatalf("Canonicalize err = %v", err)
		}
		back, err := Unmarshal(canon)
		if err != nil {
			rt.Fatalf("Unmarshal err = %v", err)
		}
		canon2, err := back.Canonicalize()
		if err != nil {
			rt.Fatalf("re-Canonicalize err = %v", err)
		}
		if !bytes.Equal(canon, canon2) {
			rt.Fatalf("round-trip not byte-lossless:\n%s\nvs\n%s", canon, canon2)
		}
		h1, _ := g.Hash()
		h2, _ := back.Hash()
		if h1 != h2 {
			rt.Fatalf("round-trip hash drift: %q vs %q", h1, h2)
		}
	})
}

// Property: two graphs of DISTINCT projects are DISJOINT — identical node content under a different
// project key yields a DIFFERENT graph_hash (project disjointness; S55 RLS enforces it below, here
// the Project key in the canonical body enforces it deterministically).
func TestDistinctProjectsDisjoint(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		levels := AllLevels()
		k := rapid.IntRange(1, len(levels)).Draw(rt, "k")
		perm := rapid.Permutation(levels).Draw(rt, "perm")
		nodes := make([]LevelNode, k)
		for i := 0; i < k; i++ {
			nodes[i] = drawNode(rt, perm[i], "node")
		}
		mk := func(project string) BesoinGraph {
			g := NewGraph(project)
			for i := 0; i < k; i++ {
				g, _ = g.AddNode(nodes[i])
			}
			return g
		}
		ha, _ := mk("project-A").Hash()
		hb, _ := mk("project-B").Hash()
		if ha == hb {
			rt.Fatalf("distinct projects collide on graph_hash %q (not disjoint)", ha)
		}
	})
}

// Property: same answers AND same project → SAME graph_hash (the positive direction of disjointness).
func TestSameAnswersSameHash(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		levels := AllLevels()
		k := rapid.IntRange(1, len(levels)).Draw(rt, "k")
		perm := rapid.Permutation(levels).Draw(rt, "perm")
		nodes := make([]LevelNode, k)
		for i := 0; i < k; i++ {
			nodes[i] = drawNode(rt, perm[i], "node")
		}
		mk := func() BesoinGraph {
			g := NewGraph("same")
			for i := 0; i < k; i++ {
				g, _ = g.AddNode(nodes[i])
			}
			return g
		}
		ha, _ := mk().Hash()
		hb, _ := mk().Hash()
		if ha != hb {
			rt.Fatalf("same answers same project but different hash: %q vs %q", ha, hb)
		}
	})
}

// Property: the canonical body carries NO `version` and NO `mirror` key — by construction (the wall:
// a need is not a truth). This is the double-absence pinned at the byte level.
func TestNoVersionNoMirrorKey(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := buildGraph(rt, "proj-novm", "g")
		canon, err := g.Canonicalize()
		if err != nil {
			rt.Fatalf("Canonicalize err = %v", err)
		}
		// Parse into a generic structure and walk all keys.
		var v any
		if err := json.Unmarshal(canon, &v); err != nil {
			rt.Fatalf("unmarshal canon err = %v", err)
		}
		walkKeys(rt, v)
		// Belt-and-braces: the substrings as JSON keys must not appear.
		if strings.Contains(string(canon), `"version"`) {
			rt.Fatalf("canonical body contains a version key: %s", canon)
		}
		if strings.Contains(string(canon), `"mirror"`) {
			rt.Fatalf("canonical body contains a mirror key: %s", canon)
		}
	})
}

func walkKeys(rt *rapid.T, v any) {
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if k == "version" || k == "mirror" {
				rt.Fatalf("forbidden key %q in graph body", k)
			}
			walkKeys(rt, child)
		}
	case []any:
		for _, e := range t {
			walkKeys(rt, e)
		}
	}
}

// Property: AddNode is non-destructive (value semantics, §9) — it returns a NEW graph and never
// mutates the receiver; a duplicate level is refused (overwrite needs a ChangeSet, EL08/§9); an
// out-of-grammar level and an unknown status are HARD refusals.
func TestAddNodeNonDestructiveAndGuarded(t *testing.T) {
	g := NewGraph("p")
	g2, err := g.AddNode(LevelNode{Level: LevelProduct, Status: NodeResolved, Provenance: Provenance{Source: "human"}})
	if err != nil {
		t.Fatalf("AddNode err = %v", err)
	}
	if len(g.Nodes) != 0 {
		t.Fatalf("AddNode mutated the receiver (len=%d)", len(g.Nodes))
	}
	if len(g2.Nodes) != 1 {
		t.Fatalf("new graph has %d nodes, want 1", len(g2.Nodes))
	}
	// Duplicate level refused.
	if _, err := g2.AddNode(LevelNode{Level: LevelProduct, Status: NodeEmpty, Provenance: Provenance{Source: "human"}}); err == nil {
		t.Fatalf("duplicate level accepted (want ErrDuplicateNode)")
	}
	// Out-of-grammar level refused (saga is out-of-scope).
	if _, err := g2.AddNode(LevelNode{Level: Level("saga"), Status: NodeEmpty, Provenance: Provenance{Source: "human"}}); err == nil {
		t.Fatalf("out-of-grammar level accepted (want hard refusal)")
	}
	// Unknown status refused.
	if _, err := g2.AddNode(LevelNode{Level: LevelEntity, Status: NodeStatus("done"), Provenance: Provenance{Source: "human"}}); err == nil {
		t.Fatalf("unknown status accepted (want ErrUnknownStatus)")
	}
}

// Property: edges are guarded + de-duplicated; AddEdge is non-destructive; an unknown edge kind and a
// non-grammar endpoint are hard refusals; re-adding the same edge does not change the graph_hash.
func TestEdgesGuardedAndDeduped(t *testing.T) {
	g := NewGraph("p")
	e := Edge{From: LevelProduct, To: LevelJourney, Kind: EdgeConstrains}
	g1, err := g.AddEdge(e)
	if err != nil {
		t.Fatalf("AddEdge err = %v", err)
	}
	g2, err := g1.AddEdge(e) // duplicate
	if err != nil {
		t.Fatalf("AddEdge dup err = %v", err)
	}
	h1, _ := g1.Hash()
	h2, _ := g2.Hash()
	if h1 != h2 {
		t.Fatalf("duplicate edge changed the hash: %q vs %q", h1, h2)
	}
	if _, err := g.AddEdge(Edge{From: LevelProduct, To: LevelJourney, Kind: EdgeKind("becomes")}); err == nil {
		t.Fatalf("unknown edge kind accepted")
	}
	if _, err := g.AddEdge(Edge{From: Level("saga"), To: LevelJourney, Kind: EdgeConstrains}); err == nil {
		t.Fatalf("non-grammar endpoint accepted")
	}
}

// Property: NodeStatuses + EdgeKinds are CLOSED and stable across re-lists (determinism, no leak).
func TestClosedSetsStable(t *testing.T) {
	for n := 0; n < 50; n++ {
		ss := NodeStatuses()
		if len(ss) != 3 || ss[0] != NodeEmpty || ss[1] != NodeDrafting || ss[2] != NodeResolved {
			t.Fatalf("NodeStatuses() drifted: %v", ss)
		}
		ks := EdgeKinds()
		if len(ks) != 2 || ks[0] != EdgeConstrains || ks[1] != EdgeSeeds {
			t.Fatalf("EdgeKinds() drifted: %v", ks)
		}
	}
}
