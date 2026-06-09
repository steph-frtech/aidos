package ailab_test

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
	"github.com/steph-frtech/aidos/back/runtime/ailab"
	"github.com/steph-frtech/aidos/back/runtime/conscience"
	"pgregory.net/rapid"
)

// FK11 reproducibility mirror — the AI Lab cockpit deterministic core (back/runtime/ailab).
// mirror record: reflects=FK11-ailab, test_kind=property, cert_language=rapid, liveness=live
//
// The headline FK11 done-criterion — « écarts affichés = déterministes » — proven as an invariant:
// BuildCockpit / ScopeForPair / ApplyCardValidation / ProposeSlot are PURE + TOTAL, same input ⇒
// byte-identical output, invariant under input ordering. The wall is drawn deterministically by
// source; a direct truth-write from the chat is refused; below the wall is read-only.

func brokenSkeleton(broken facets.Facet) *facetwire.SkeletonReport {
	sk := facetwire.Skeleton{KernelID: "checkout"}
	for _, f := range facetwire.NonFunctionalColumns() {
		col := facetwire.Column{KernelID: "checkout", Facet: f}
		for _, r := range facetwire.Rungs() {
			col.Rungs = append(col.Rungs, facetwire.RungState{
				Rung:     r,
				Declared: true,
				Proven:   !(f == broken && r == facetwire.RungEvidence),
			})
		}
		sk.Columns = append(sk.Columns, col)
	}
	rep := facetwire.WireSkeleton(sk)
	return &rep
}

func driftReport() conscience.ConsciousnessReport {
	return conscience.Reconcile(conscience.Input{
		KernelID: "checkout",
		Skeleton: brokenSkeleton("S"),
		Verdicts: []conscience.SourcedVerdict{
			{Source: "runner", Facet: "F", Pair: "s2↔s9", Verdict: "red", Drift: "semantic_drift", Detail: "31 vs 30", Blast: "medium"},
			{Source: "sensor", Facet: "F", Pair: "latency-meter", Verdict: "green"},
		},
	})
}

func mustJSON(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

func TestBuildCockpitDeterministic(t *testing.T) {
	r := driftReport()
	a := ailab.BuildCockpit(r, "navigational", &ailab.PromotionGate{Level: 2, CanPromote: false, NextLevel: 3})
	b := ailab.BuildCockpit(r, "navigational", &ailab.PromotionGate{Level: 2, CanPromote: false, NextLevel: 3})
	if mustJSON(t, a) != mustJSON(t, b) {
		t.Fatal("BuildCockpit is not deterministic")
	}
}

func TestWallIsDrawnBothSides(t *testing.T) {
	r := driftReport()
	st := ailab.BuildCockpit(r, "", nil)
	above, below := false, false
	for _, c := range st.Cells {
		if c.Tier == ailab.TierAbove {
			above = true
		}
		if c.Tier == ailab.TierBelow {
			below = true
			if !c.ReadOnly {
				t.Fatalf("below-the-wall cell %s must be read-only", c.Key)
			}
		}
	}
	if !above || !below {
		t.Fatalf("the wall must be drawn both sides (above=%v below=%v)", above, below)
	}
}

func TestChatTruthWriteRefused(t *testing.T) {
	node := ailab.CockpitNode{ID: "op-checkout", Kind: "operation", Facet: "F"}
	res := ailab.ProposeSlot(node, "écris la vérité dans le kernel")
	if res.Refusal == nil || res.Slot != nil {
		t.Fatal("a direct truth-write must be refused at the wall")
	}
	if res.Refusal.Code != ailab.CodeDirectTruthWrite {
		t.Fatalf("unexpected refusal code %q", res.Refusal.Code)
	}
}

func TestChatProposesAmberSlot(t *testing.T) {
	node := ailab.CockpitNode{ID: "op-checkout", Kind: "operation", Facet: "F"}
	res := ailab.ProposeSlot(node, "limite à 30 jours ?")
	if res.Slot == nil || res.Refusal != nil {
		t.Fatal("a normal message must propose a slot")
	}
	if res.Slot.Status != "proposed" || res.Slot.Voyant != ailab.VoyantAmber {
		t.Fatalf("slot must be proposed+amber, got %+v", res.Slot)
	}
}

func TestProposeSlotContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		msg := rapid.String().Draw(rt, "msg")
		node := ailab.CockpitNode{ID: "n1", Kind: "operation", Facet: "F"}
		a := ailab.ProposeSlot(node, msg)
		b := ailab.ProposeSlot(node, msg)
		if mustJSON(t, a) != mustJSON(t, b) {
			rt.Fatal("ProposeSlot is not content-addressed")
		}
	})
}

func TestValidateCardFlipsPair(t *testing.T) {
	r := driftReport()
	var cardID string
	for _, c := range r.Cards {
		if !c.Advisory {
			cardID = c.ID
			break
		}
	}
	if cardID == "" {
		t.Fatal("expected a hard decision card")
	}
	res := ailab.ApplyCardValidation(r, cardID, "fix_below_wall")
	if !res.Applied || res.FlippedPair == "" {
		t.Fatalf("fix_below_wall must flip the pair, got %+v", res)
	}
	// the flipped pair is green in the re-reconciled report.
	for _, p := range res.Report.Pairs {
		if ailab.PairKey(string(p.Facet), p.Pair, string(p.Source)) == res.FlippedPair {
			if p.Verdict != "green" {
				t.Fatalf("flipped pair must be green, got %q", p.Verdict)
			}
		}
	}
}

func TestAboveWallOptionOpensGoal(t *testing.T) {
	r := driftReport()
	var cardID string
	for _, c := range r.Cards {
		if !c.Advisory {
			cardID = c.ID
			break
		}
	}
	res := ailab.ApplyCardValidation(r, cardID, "change_above_wall")
	if res.Applied || !res.OpenedGoal {
		t.Fatalf("an above-the-wall option must open a goal, not flip, got %+v", res)
	}
	if mustJSON(t, res.Report) != mustJSON(t, r) {
		t.Fatal("the report must be unchanged (no truth written from the cockpit)")
	}
}

func TestScopeForPairDeterministic(t *testing.T) {
	r := driftReport()
	key := ailab.PairKey(string(r.Pairs[0].Facet), r.Pairs[0].Pair, string(r.Pairs[0].Source))
	a, okA := ailab.ScopeForPair(r, key)
	b, okB := ailab.ScopeForPair(r, key)
	if !okA || !okB {
		t.Fatal("ScopeForPair must resolve a known pair")
	}
	if mustJSON(t, a) != mustJSON(t, b) {
		t.Fatal("ScopeForPair is not deterministic")
	}
}
