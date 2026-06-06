package besoin

import (
	"encoding/json"
	"testing"
)

// red_backlog_fixture_test.go — the EL17 fixture mirror (deterministic state → RedBacklog → result).
// Pins the concrete shapes the property cannot easily draw: the exact descent order, the cycle refusal
// (BESOIN_CYCLE), the anchors_above carrying the NoEmit rungs, and the @version ref resolution.

// resolved builds a resolved SOURCE node with its canonical outgoing ref annexed.
func rbResolved(l Level) LevelNode {
	body, _ := json.Marshal(map[string]any{"marker": string(l)})
	n := LevelNode{
		Level: l, Body: body, Status: NodeResolved,
		Provenance: Provenance{Source: "human", Detail: "je veux " + string(l)},
	}
	if to, field, ok := OutgoingRef(l); ok {
		n.Refs = []Ref{{Field: field, To: to}}
	}
	return n
}

// rbBuildGraph appends nodes then the canonical constrains edges between consecutive present nodes.
func rbBuildGraph(t *testing.T, nodes ...LevelNode) BesoinGraph {
	t.Helper()
	g := NewGraph("fix")
	present := map[Level]bool{}
	for _, n := range nodes {
		ng, err := g.AddNode(n)
		if err != nil {
			t.Fatalf("AddNode %s: %v", n.Level, err)
		}
		g = ng
		present[n.Level] = true
	}
	src := Levels()
	for i := 0; i+1 < len(src); i++ {
		if present[src[i]] && present[src[i+1]] {
			ng, err := g.AddEdge(Edge{From: src[i], To: src[i+1], Kind: EdgeConstrains})
			if err != nil {
				t.Fatalf("AddEdge: %v", err)
			}
			g = ng
		}
	}
	return g
}

// product+entity (2 mapping rungs, no journey/view between them present) → 2 items, product first.
func TestRedBacklog_ProductThenEntity(t *testing.T) {
	g := rbBuildGraph(t, rbResolved(LevelProduct), rbResolved(LevelEntity))
	bl, err := RedBacklog(g)
	if err != nil {
		t.Fatalf("RedBacklog: %v", err)
	}
	if len(bl) != 2 {
		t.Fatalf("want 2 items, got %d", len(bl))
	}
	if bl[0].FromLevel != LevelProduct || bl[1].FromLevel != LevelEntity {
		t.Fatalf("order = %s,%s ; want product,entity", bl[0].FromLevel, bl[1].FromLevel)
	}
}

// product+journey → 1 item (journey is NoEmit), and journey appears in product's anchors_above.
func TestRedBacklog_JourneyIsNoEmitButAnchors(t *testing.T) {
	// journey constrains nothing emitting below it here; product is the only mapping rung.
	g := rbBuildGraph(t, rbResolved(LevelProduct), rbResolved(LevelJourney))
	bl, err := RedBacklog(g)
	if err != nil {
		t.Fatalf("RedBacklog: %v", err)
	}
	if len(bl) != 1 {
		t.Fatalf("want 1 item (journey NoEmit), got %d", len(bl))
	}
	if bl[0].FromLevel != LevelProduct {
		t.Fatalf("the single item must be product, got %s", bl[0].FromLevel)
	}
	// The journey rung must NOT be an emitted item but MAY ground deeper items via anchors. Assert no
	// item is the journey rung.
	for _, it := range bl {
		if it.FromLevel == LevelJourney {
			t.Fatalf("journey (NoEmit) appeared as a backlog item")
		}
	}
}

// A NoEmit rung above a mapping rung appears in that rung's anchors_above (the compound made visible).
func TestRedBacklog_NoEmitInAnchorsAbove(t *testing.T) {
	// product (map) → journey (NoEmit) → view (NoEmit) → control (map). control's anchors must include
	// journey and view (the NoEmit rungs constraining it without emitting).
	g := rbBuildGraph(t,
		rbResolved(LevelProduct), rbResolved(LevelJourney), rbResolved(LevelView), rbResolved(LevelControl),
		rbResolved(LevelAction), // control's ref resolves to action (so refs resolve @version)
	)
	bl, err := RedBacklog(g)
	if err != nil {
		t.Fatalf("RedBacklog: %v", err)
	}
	var control *BacklogItem
	for i := range bl {
		if bl[i].FromLevel == LevelControl {
			control = &bl[i]
		}
	}
	if control == nil {
		t.Fatalf("control item missing from backlog")
	}
	seen := map[Level]bool{}
	for _, a := range control.AnchorsAbove {
		seen[a.Level] = true
	}
	if !seen[LevelJourney] || !seen[LevelView] {
		t.Fatalf("control anchors_above must include journey AND view (NoEmit rungs), got %v", control.AnchorsAbove)
	}
	// And neither journey nor view is itself a backlog item.
	for _, it := range bl {
		if it.FromLevel == LevelJourney || it.FromLevel == LevelView {
			t.Fatalf("NoEmit rung %s appeared as a backlog item", it.FromLevel)
		}
	}
}

// A descending ref that resolves @version is reported resolved; a dangling deeper ref is carried as a
// non-blocking forward-dep OpenQuestion, never dropped (bootstrap §6).
func TestRedBacklog_RefResolution(t *testing.T) {
	// control present but action ABSENT → control's outgoing ref (→action) is dangling → carried OQ.
	g := rbBuildGraph(t, rbResolved(LevelProduct), rbResolved(LevelControl))
	bl, err := RedBacklog(g)
	if err != nil {
		t.Fatalf("RedBacklog: %v", err)
	}
	var control *BacklogItem
	for i := range bl {
		if bl[i].FromLevel == LevelControl {
			control = &bl[i]
		}
	}
	if control == nil {
		t.Fatalf("control item missing")
	}
	if len(control.UnresolvedRefs) == 0 {
		t.Fatalf("control's dangling →action ref must be carried as an unresolved forward-dep")
	}
	if len(control.OpenQuestions) == 0 {
		t.Fatalf("a dangling ref must surface a carried OpenQuestion (bootstrap §6)")
	}

	// Now add action: the ref resolves @version, no unresolved ref remains on control.
	g2 := rbBuildGraph(t, rbResolved(LevelProduct), rbResolved(LevelControl), rbResolved(LevelAction), rbResolved(LevelOperation), rbResolved(LevelEntity))
	bl2, err := RedBacklog(g2)
	if err != nil {
		t.Fatalf("RedBacklog: %v", err)
	}
	for i := range bl2 {
		if bl2[i].FromLevel == LevelControl && len(bl2[i].UnresolvedRefs) != 0 {
			t.Fatalf("control's →action ref should resolve @version when action exists, got unresolved %v", bl2[i].UnresolvedRefs)
		}
	}
}

// A cycle in the edges is refused with BESOIN_CYCLE — never an arbitrary order.
func TestRedBacklog_CycleRefused(t *testing.T) {
	g := rbBuildGraph(t, rbResolved(LevelProduct), rbResolved(LevelEntity))
	// Inject a back-edge entity→product to create a cycle (product↔entity via the emitted ordering).
	g2, err := g.AddEdge(Edge{From: LevelEntity, To: LevelProduct, Kind: EdgeSeeds})
	if err != nil {
		t.Fatalf("AddEdge back: %v", err)
	}
	// product→entity must already exist (canonical constrains) OR add it to close the loop.
	g2, err = g2.AddEdge(Edge{From: LevelProduct, To: LevelEntity, Kind: EdgeSeeds})
	if err != nil {
		t.Fatalf("AddEdge fwd: %v", err)
	}
	_, err = RedBacklog(g2)
	if err == nil {
		t.Fatalf("expected BESOIN_CYCLE error, got nil")
	}
	if be, ok := AsCycleError(err); !ok {
		t.Fatalf("expected a BESOIN_CYCLE error, got %v", err)
	} else if be.Code() != CodeBesoinCycle {
		t.Fatalf("cycle error code = %q, want %q", be.Code(), CodeBesoinCycle)
	}
}
