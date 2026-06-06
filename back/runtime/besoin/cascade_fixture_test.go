package besoin

import (
	"encoding/json"
	"testing"
)

// cascade_fixture_test.go — the EL08 fixture-table mirror (RED→GREEN). The compound PROVEN:
//   - AnchorsAbove returns ONLY the frozen (resolved) rungs strictly above, in descent order.
//   - Descend opens fromLevel+1 ONLY when CanDescend.enough; a premature descent is refused with
//     CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED (the done-criterion: "descente prématurée refusée").
//   - ShrinkOptionSpaceCascade: |OptionSpace(view)| under a FROZEN product is STRICTLY smaller than the
//     full declared set (the done-criterion: "|OptionSpace| strictement plus petit sous ancre figée");
//     with no frozen anchor it is NOT narrowed (Shrink == 0 — compounding has not happened).
//   - ReopenAnchor: reopening a FROZEN anchor without a ChangeSet is refused (BESOIN_ANCHOR_OVERWRITE);
//     WITH a ChangeSet it is a recorded decision, append-only (the done-criterion: "rouvrir une ancre
//     exige un ChangeSet — anti-overwrite §9").

// resolvedProduct builds a graph with a FROZEN (resolved) product whose selects retains `selects`.
func resolvedProduct(t *testing.T, selects []string) BesoinGraph {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"intent":    "suivi de tâches",
		"scenarios": []string{"créer", "cocher"},
		"selects":   selects,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	g, err := NewGraph("p").AddNode(LevelNode{
		Level:      LevelProduct,
		Body:       body,
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "u"},
		Status:     NodeResolved,
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	return g
}

// --- AnchorsAbove --------------------------------------------------------------------------------

func TestAnchorsAbove_OnlyFrozenStrictlyAbove(t *testing.T) {
	// product resolved (frozen), journey drafting (not frozen). Anchors above `view` = just product.
	g := resolvedProduct(t, []string{"onboarding"})
	jb, _ := json.Marshal(map[string]any{"gherkin": "Given x When y Then z"})
	g, err := g.AddNode(LevelNode{Level: LevelJourney, Body: jb, Status: NodeDrafting, Provenance: Provenance{Source: "human", Detail: "j"}})
	if err != nil {
		t.Fatalf("AddNode journey: %v", err)
	}

	anchors := AnchorsAbove(g, LevelView)
	if len(anchors) != 1 || anchors[0].Level != LevelProduct {
		t.Fatalf("AnchorsAbove(view) must be [product] (journey is drafting, not frozen), got %v", anchors)
	}

	// product itself has nothing above.
	if a := AnchorsAbove(g, LevelProduct); len(a) != 0 {
		t.Fatalf("AnchorsAbove(product) must be empty, got %v", a)
	}
	// A transversal band has no descent position → no anchors.
	if a := AnchorsAbove(g, LevelPolicy); a != nil {
		t.Fatalf("AnchorsAbove(policy) must be nil (off the descent path), got %v", a)
	}
}

func TestIsAnchored_RequiresFrozenRungAbove(t *testing.T) {
	g := resolvedProduct(t, []string{"onboarding"})
	if !IsAnchored(g, LevelJourney) {
		t.Fatalf("journey must be anchored under a resolved product")
	}
	if IsAnchored(g, LevelProduct) {
		t.Fatalf("product has no rung above; must not be anchored")
	}
}

// --- Descend (premature descent refused) ---------------------------------------------------------

func TestDescend_RefusedWhenNotRightSized(t *testing.T) {
	// A product that selects NOTHING is not enough (anti-vacuity) → descent must be refused.
	g := resolvedProduct(t, []string{})
	res := Descend(g, LevelProduct, fullMeta())
	if res.OK {
		t.Fatalf("descent must be REFUSED for a non-right-sized product")
	}
	if res.Refusal == nil || !hasBlock(*res.Refusal, CodeCannotDescend) {
		t.Fatalf("refusal must carry CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED, got %v", codes(verdictOrEmpty(res.Refusal)))
	}
	// Non-destructive: the input graph is returned unchanged (no journey node opened).
	if _, opened := res.Graph.Node(LevelJourney); opened {
		t.Fatalf("a refused descent must NOT open the lower rung")
	}
}

func TestDescend_OpensNextWhenRightSized(t *testing.T) {
	g := resolvedProduct(t, []string{"onboarding", "core-task"})
	res := Descend(g, LevelProduct, fullMeta())
	if !res.OK || res.Opened != LevelJourney {
		t.Fatalf("a right-sized product must descend, opening journey; got OK=%v Opened=%q", res.OK, res.Opened)
	}
	// The constrains edge product→journey is emitted.
	found := false
	for _, e := range res.Graph.Edges {
		if e.From == LevelProduct && e.To == LevelJourney && e.Kind == EdgeConstrains {
			found = true
		}
	}
	if !found {
		t.Fatalf("Descend must emit constrains(product→journey); edges=%v", res.Graph.Edges)
	}
	// The opened journey is a drafting node (somewhere to descend into).
	if n, ok := res.Graph.Node(LevelJourney); !ok || n.Status != NodeDrafting {
		t.Fatalf("Descend must open journey as drafting, got %+v ok=%v", n, ok)
	}
}

// --- ShrinkOptionSpaceCascade (strictly smaller under a frozen anchor) ---------------------------

func TestCascadeShrink_StrictlySmallerUnderFrozenAnchor(t *testing.T) {
	os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
	full := len(os.Choices)

	// A FROZEN product selecting a proper non-empty subset narrows journey strictly.
	g := resolvedProduct(t, []string{"onboarding", "core-task"})
	cs := ShrinkOptionSpaceCascade(g, LevelProduct)
	if !cs.Enumerable {
		t.Fatalf("product→journey is enumerable; cascade must be enumerable")
	}
	if cs.Before != full {
		t.Fatalf("Before must be the full declared set %d, got %d", full, cs.Before)
	}
	if cs.After != 2 {
		t.Fatalf("After must be the 2 retained archetypes, got %d", cs.After)
	}
	if cs.After >= cs.Before {
		t.Fatalf("|OptionSpace| under a frozen anchor must be STRICTLY smaller: After=%d Before=%d", cs.After, cs.Before)
	}
	if cs.Shrink != full-2 {
		t.Fatalf("Shrink must be Before-After = %d, got %d", full-2, cs.Shrink)
	}
}

func TestCascadeShrink_ZeroWithoutFrozenAnchor(t *testing.T) {
	// A DRAFTING product (not frozen) does not narrow: After == Before, Shrink == 0.
	body, _ := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"a"}, "selects": []string{"onboarding"}})
	g, err := NewGraph("p").AddNode(LevelNode{Level: LevelProduct, Body: body, Status: NodeDrafting, Provenance: Provenance{Source: "human", Detail: "u"}})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	cs := ShrinkOptionSpaceCascade(g, LevelProduct)
	if cs.Shrink != 0 || cs.After != cs.Before {
		t.Fatalf("an UNFROZEN product must not narrow (Shrink 0, After==Before), got %+v", cs)
	}
}

func TestCascadeShrink_NonEnumerablePairIsSentinel(t *testing.T) {
	// operation→entity is the declared non-enumerable pair → carried OpenQuestion, positive sentinel.
	body, _ := json.Marshal(map[string]any{"steps": []string{"s"}, "fixture": "f", "selects": []string{"create"}})
	g, err := NewGraph("p").AddNode(LevelNode{Level: LevelOperation, Body: body, Status: NodeResolved, Provenance: Provenance{Source: "human", Detail: "u"}})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	cs := ShrinkOptionSpaceCascade(g, LevelOperation)
	if cs.Enumerable {
		t.Fatalf("operation→entity must be non-enumerable")
	}
	if cs.Shrink <= 0 {
		t.Fatalf("a non-enumerable pair must carry a POSITIVE sentinel (satisfied-by-OpenQuestion), got %d", cs.Shrink)
	}
	if cs.OpenQuestion == "" {
		t.Fatalf("a non-enumerable pair must carry its declared OpenQuestion reason")
	}
}

func TestCascadeShrink_LeafIsSentinel(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"attributes": []string{"id"}})
	g, err := NewGraph("p").AddNode(LevelNode{Level: LevelEntity, Body: body, Status: NodeResolved, Provenance: Provenance{Source: "human", Detail: "u"}})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	cs := ShrinkOptionSpaceCascade(g, LevelEntity)
	if cs.Enumerable || cs.Shrink <= 0 {
		t.Fatalf("entity leaf must be a positive sentinel (no lower rung), got %+v", cs)
	}
}

// --- ReopenAnchor (anti-overwrite §9) ------------------------------------------------------------

func TestReopenAnchor_FrozenWithoutChangeSetRefused(t *testing.T) {
	g := resolvedProduct(t, []string{"onboarding"})
	res := ReopenAnchor(g, LevelProduct, "")
	if res.OK {
		t.Fatalf("reopening a FROZEN anchor without a ChangeSet must be REFUSED")
	}
	if res.Refusal == nil || string(res.Refusal.Code) != string(CodeAnchorOverwrite) {
		t.Fatalf("refusal must be BESOIN_ANCHOR_OVERWRITE, got %+v", res.Refusal)
	}
	// Non-destructive: the frozen node is untouched.
	if n, _ := res.Graph.Node(LevelProduct); n.Status != NodeResolved {
		t.Fatalf("a refused reopen must leave the anchor frozen, got %q", n.Status)
	}
}

func TestReopenAnchor_FrozenWithChangeSetIsRecordedDecision(t *testing.T) {
	g := resolvedProduct(t, []string{"onboarding"})
	res := ReopenAnchor(g, LevelProduct, "cs-42")
	if !res.OK {
		t.Fatalf("reopening a frozen anchor WITH a ChangeSet must succeed (recorded decision)")
	}
	n, ok := res.Graph.Node(LevelProduct)
	if !ok || n.Status != NodeDrafting {
		t.Fatalf("a reopened anchor must be drafting, got %+v ok=%v", n, ok)
	}
	// Append-only: the prior body is preserved, and the reopen is recorded in provenance + OpenQuestions.
	if len(n.Body) == 0 {
		t.Fatalf("the prior frozen body must be preserved (append-only §9)")
	}
	foundOQ := false
	for _, q := range n.OpenQuestions {
		if containsAll(q, "reopened", "cs-42") {
			foundOQ = true
		}
	}
	if !foundOQ {
		t.Fatalf("the reopen must be recorded as an OpenQuestion citing the ChangeSet, got %v", n.OpenQuestions)
	}
	if !containsAll(n.Provenance.Detail, "changeset:cs-42") {
		t.Fatalf("the reopen provenance must cite the ChangeSet, got %q", n.Provenance.Detail)
	}
}

func TestReopenAnchor_UnfrozenNeedsNoChangeSet(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"a"}, "selects": []string{"onboarding"}})
	g, err := NewGraph("p").AddNode(LevelNode{Level: LevelProduct, Body: body, Status: NodeDrafting, Provenance: Provenance{Source: "human", Detail: "u"}})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	res := ReopenAnchor(g, LevelProduct, "")
	if !res.OK {
		t.Fatalf("an UNFROZEN node (drafting) needs no ChangeSet to re-elicit; got refusal %+v", res.Refusal)
	}
}

// --- helpers -------------------------------------------------------------------------------------

func verdictOrEmpty(v *Verdict) Verdict {
	if v == nil {
		return Verdict{}
	}
	return *v
}

func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		if !contains(s, sub) {
			return false
		}
	}
	return true
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
