package besoin

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"pgregory.net/rapid"
)

// red_backlog_property_test.go — the EL17 reproducibility mirror (∀ invariant, property form, rapid).
// RedBacklog(graph) → BacklogItem[] topo-sorts the emitted Ideas (the mapping rungs) along the
// constrains/seeds edges → the EXACT promotion order S64+ opens the /goal in (the §23 verticale). It
// must be:
//   - TOTAL + DETERMINISTIC : every emitted Idea appears exactly once; same graph → byte-identical order.
//   - TOPO-CORRECT          : a constrains/seeds edge L→D places L's item BEFORE D's item in the list.
//   - CYCLE-REFUSED         : an edge cycle is refused with BESOIN_CYCLE (never an arbitrary order).
//   - REFS-RESOLVE          : each item resolves its outgoing SOURCE ref @version (or carries it as a
//                             non-blocking forward-dep OpenQuestion — never silently dropped).
//   - NoEmit-IN-ANCHORS     : NoEmit rungs (journey/view) appear in anchors_above[] but NEVER in the list.
//   - FORM-ANNEXED          : each item carries its expected LevelMirrorForm — annexed, never written.

// resolvedSourceGraph builds a graph whose SOURCE rungs are all resolved with the canonical constrains
// edges between consecutive resolved SOURCE rungs (a well-formed descent). Bands are added at a random
// status. This gives a DAG so RedBacklog must succeed and the topo order must be the descent order.
func resolvedSourceGraph(rt *rapid.T) BesoinGraph {
	g := NewGraph("rb-" + rapid.StringMatching(`[a-z]{3}`).Draw(rt, "proj"))
	// Decide which SOURCE rungs are present + resolved (a random prefix-ish subset, each independent).
	present := map[Level]bool{}
	for _, l := range Levels() { // the 7 SOURCE rungs in descent order
		if !rapid.Bool().Draw(rt, "src-"+string(l)) {
			continue
		}
		body, _ := json.Marshal(map[string]any{"marker": string(l)})
		n := LevelNode{
			Level:      l,
			Body:       body,
			Status:     NodeResolved,
			Provenance: Provenance{Source: "human", Detail: "je veux " + string(l)},
		}
		// Annex the canonical outgoing ref (control→action, etc.) when the spec declares one.
		if to, field, ok := OutgoingRef(l); ok {
			n.Refs = []Ref{{Field: field, To: to}}
		}
		if ng, err := g.AddNode(n); err == nil {
			g = ng
			present[l] = true
		}
	}
	// Optionally add the transversal bands (NoEmit invariant is excluded; policy maps).
	for _, b := range TransversalBands() {
		if !rapid.Bool().Draw(rt, "band-"+string(b)) {
			continue
		}
		body, _ := json.Marshal(map[string]any{"marker": string(b)})
		if ng, err := g.AddNode(LevelNode{
			Level: b, Body: body, Status: NodeResolved,
			Provenance: Provenance{Source: "human", Detail: "invariant " + string(b)},
		}); err == nil {
			g = ng
		}
	}
	// Emit the canonical constrains edges between consecutive present SOURCE rungs.
	src := Levels()
	for i := 0; i+1 < len(src); i++ {
		if present[src[i]] && present[src[i+1]] {
			if ng, err := g.AddEdge(Edge{From: src[i], To: src[i+1], Kind: EdgeConstrains}); err == nil {
				g = ng
			}
		}
	}
	return g
}

// Property: RedBacklog is DETERMINISTIC — same graph → byte-identical backlog (items + order).
func TestRedBacklog_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := resolvedSourceGraph(rt)
		a, errA := RedBacklog(g)
		b, errB := RedBacklog(g)
		if errA != nil || errB != nil {
			rt.Fatalf("backlog errors: %v / %v", errA, errB)
		}
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			rt.Fatalf("non-deterministic backlog:\n  %s\n  %s", ja, jb)
		}
	})
}

// Property: the backlog is TOTAL — every emitted Idea (EmitIdeas) appears exactly once in the backlog,
// no more, no less (the count + identity authority matches the emission).
func TestRedBacklog_TotalCoversEmittedExactlyOnce(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := resolvedSourceGraph(rt)
		emitted, err := EmitIdeasWithProvenance(g)
		if err != nil {
			rt.Fatalf("emit error: %v", err)
		}
		backlog, err := RedBacklog(g)
		if err != nil {
			rt.Fatalf("backlog error: %v", err)
		}
		if len(backlog) != len(emitted) {
			rt.Fatalf("backlog has %d items, EmitIdeas emitted %d", len(backlog), len(emitted))
		}
		seen := map[string]int{}
		for _, it := range backlog {
			seen[it.Idea.ID]++
		}
		for _, e := range emitted {
			if seen[e.Idea.ID] != 1 {
				rt.Fatalf("emitted Idea %q appears %d times in backlog (want 1)", e.Idea.ID, seen[e.Idea.ID])
			}
		}
	})
}

// Property: TOPO-CORRECT — for every constrains/seeds edge L→D where BOTH L and D emit an item, L's
// item comes strictly BEFORE D's item in the backlog (the order IS the architecture).
func TestRedBacklog_TopoOrderRespectsEdges(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := resolvedSourceGraph(rt)
		backlog, err := RedBacklog(g)
		if err != nil {
			rt.Fatalf("backlog error: %v", err)
		}
		pos := map[Level]int{}
		for i, it := range backlog {
			pos[it.FromLevel] = i
		}
		for _, e := range g.Edges {
			lp, lok := pos[e.From]
			dp, dok := pos[e.To]
			if lok && dok && !(lp < dp) {
				rt.Fatalf("edge %s→%s violated: from at %d, to at %d (want from<to)", e.From, e.To, lp, dp)
			}
		}
	})
}

// Property: NoEmit rungs (journey/view/invariant) NEVER appear in the backlog list — only in anchors.
func TestRedBacklog_NoEmitNeverInList(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := resolvedSourceGraph(rt)
		backlog, err := RedBacklog(g)
		if err != nil {
			rt.Fatalf("backlog error: %v", err)
		}
		for _, it := range backlog {
			if LevelToProposes(it.FromLevel).Kind != MappingEmit {
				rt.Fatalf("NoEmit rung %q appeared in the backlog list", it.FromLevel)
			}
			// Its Idea must be a real ProposesKind (never a journey/view cast).
			ok := false
			for _, k := range ideas.ProposesKinds() {
				if it.Idea.Proposes == k {
					ok = true
				}
			}
			if !ok {
				rt.Fatalf("backlog item proposes %q which is not a closed ProposesKind", it.Idea.Proposes)
			}
		}
	})
}

// Property: each item carries its expected LevelMirrorForm — annexed, never written. The form must be a
// closed MirrorForm and equal LevelMirrorForm(item.FromLevel).
func TestRedBacklog_MirrorFormAnnexedNotWritten(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := resolvedSourceGraph(rt)
		backlog, err := RedBacklog(g)
		if err != nil {
			rt.Fatalf("backlog error: %v", err)
		}
		for _, it := range backlog {
			want, ok := LevelMirrorForm(it.FromLevel)
			if !ok {
				rt.Fatalf("no LevelMirrorForm for emitted rung %q", it.FromLevel)
			}
			if it.MirrorForm != want {
				rt.Fatalf("item %q mirror form = %q, want %q", it.FromLevel, it.MirrorForm, want)
			}
			if !IsMirrorForm(it.MirrorForm) {
				rt.Fatalf("item %q mirror form %q is not a closed MirrorForm", it.FromLevel, it.MirrorForm)
			}
			// The wall: an Idea never carries a mirror/version key (the form is on the item, not the Idea).
			b, _ := ideas.Canonicalize(it.Idea)
			var m map[string]any
			_ = json.Unmarshal(b, &m)
			if _, has := m["mirror"]; has {
				rt.Fatalf("backlog Idea carries a mirror key: %s", b)
			}
			if _, has := m["version"]; has {
				rt.Fatalf("backlog Idea carries a version key: %s", b)
			}
		}
	})
}
