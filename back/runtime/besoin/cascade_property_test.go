package besoin

import (
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

// cascade_property_test.go — the EL08 reproducibility mirror (∀ invariant, property form, rapid).
// AnchorsAbove, ShrinkOptionSpaceCascade and ReopenAnchor are DETERMINISTIC pure functions
// (CLAUDE.md §6/§8): same input → same output. These properties pin reproducibility and the compound
// anti-vacuity LAW: a FROZEN product selecting a proper non-empty subset narrows journey STRICTLY
// (After < Before), and the cascade is reproducible.

// frozenProductSelecting builds a graph with a FROZEN product selecting `selects` of the journey set.
func frozenProductSelecting(t *rapid.T, selects []string) BesoinGraph {
	body, err := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"s1"}, "selects": selects})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	g, err := NewGraph("p").AddNode(LevelNode{
		Level: LevelProduct, Body: body, Status: NodeResolved,
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "u"},
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	return g
}

// Property: ShrinkOptionSpaceCascade is REPRODUCIBLE — same graph → identical CascadeShrink every call.
func TestProp_Cascade_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := frozenProductSelecting(t, sub)
		first := ShrinkOptionSpaceCascade(g, LevelProduct)
		for i := 0; i < 20; i++ {
			again := ShrinkOptionSpaceCascade(g, LevelProduct)
			if again != first {
				t.Fatalf("ShrinkOptionSpaceCascade not reproducible: %+v vs %+v", again, first)
			}
		}
	})
}

// Property: the COMPOUND law — a FROZEN product selecting k of N (1 ≤ k ≤ N) journey archetypes makes
// |OptionSpace(journey)| STRICTLY smaller (After = k < Before = N) iff k < N; After == Before only when
// k == N (the body retains everything → no narrowing). Selecting nothing → Shrink == 0.
func TestProp_Cascade_StrictShrinkUnderFrozenAnchor(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		n := len(os.Choices)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := frozenProductSelecting(t, sub)
		cs := ShrinkOptionSpaceCascade(g, LevelProduct)
		if cs.Before != n {
			t.Fatalf("Before must be the full set %d, got %d", n, cs.Before)
		}
		if len(sub) == 0 {
			if cs.Shrink != 0 || cs.After != cs.Before {
				t.Fatalf("empty selects must not narrow, got %+v", cs)
			}
			return
		}
		if cs.After != len(sub) {
			t.Fatalf("After must be the retained count %d, got %d", len(sub), cs.After)
		}
		if len(sub) < n && !(cs.After < cs.Before) {
			t.Fatalf("a proper subset must narrow STRICTLY (After<Before), got After=%d Before=%d", cs.After, cs.Before)
		}
		if cs.Shrink != n-len(sub) {
			t.Fatalf("Shrink must be N-k = %d, got %d", n-len(sub), cs.Shrink)
		}
	})
}

// Property: AnchorsAbove(level) is monotone in the descent order — every returned anchor sits strictly
// above `level`, is resolved, and the list is in ascending descent index. Reproducible.
func TestProp_AnchorsAbove_StrictlyAboveAndOrdered(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Resolve a generated prefix of the SOURCE rungs, then check anchors above the next one.
		lvls := Levels()
		k := rapid.IntRange(0, len(lvls)-1).Draw(t, "k") // resolve rungs [0,k)
		g := NewGraph("p")
		for i := 0; i < k; i++ {
			body, _ := json.Marshal(map[string]any{"selects": []string{"x"}})
			var err error
			g, err = g.AddNode(LevelNode{Level: lvls[i], Body: body, Status: NodeResolved, Provenance: Provenance{Source: "human", Detail: "u"}})
			if err != nil {
				t.Fatalf("AddNode: %v", err)
			}
		}
		target := lvls[k]
		anchors := AnchorsAbove(g, target)
		if len(anchors) != k {
			t.Fatalf("expected %d frozen anchors above %s, got %d", k, target, len(anchors))
		}
		prev := -1
		for _, a := range anchors {
			idx := sourceIndex(a.Level)
			if idx >= sourceIndex(target) {
				t.Fatalf("anchor %s is not strictly above %s", a.Level, target)
			}
			if idx <= prev {
				t.Fatalf("anchors must be in ascending descent order, got %d after %d", idx, prev)
			}
			prev = idx
		}
	})
}

// Property: ReopenAnchor is fail-closed on a frozen anchor without a ChangeSet, and append-only with
// one (the prior body is never destroyed). Reproducible decision.
func TestProp_ReopenAnchor_FailClosedWithoutChangeSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		withCS := rapid.Bool().Draw(t, "withChangeSet")
		g := frozenProductSelecting(t, []string{"onboarding"})
		cs := ""
		if withCS {
			cs = "cs-" + rapid.StringMatching(`[a-z0-9]{1,8}`).Draw(t, "cs")
		}
		res := ReopenAnchor(g, LevelProduct, cs)
		if withCS {
			if !res.OK {
				t.Fatalf("a ChangeSet must allow the reopen")
			}
			n, _ := res.Graph.Node(LevelProduct)
			if n.Status != NodeDrafting || len(n.Body) == 0 {
				t.Fatalf("reopen must be drafting + preserve the prior body (append-only)")
			}
		} else {
			if res.OK {
				t.Fatalf("no ChangeSet must fail-closed (anti-overwrite §9)")
			}
		}
	})
}
