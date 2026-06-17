package buildconsolesrv

import (
	"context"
	"testing"
)

// The build-console MCP server is PURE computation (the wall): these tests prove each tool
// at the MCP boundary. They mirror the S86 done-criteria: the projected console state is a
// FAITHFUL projection of the recorded AgentRun (faithful_projection holds), and a stable
// phase is recorded ONLY at the §43 verdict (an inconsistent cut is refused, no node).

func TestProjectToolIsFaithful(t *testing.T) {
	in := projectInput{
		RunID:        "run-1",
		Goal:         "goal-checkout",
		Result:       "green",
		Writes:       []writeIn{{DiffHash: "d1", Authorised: true}},
		DiffHashes:   []string{"d1"},
		GreenMirrors: []string{"Order.checkout.feature"},
		Verdict:      "green",
		MaxCIMinutes: 30, SpentCIMinutes: 4,
		MaxLLMTokens: 100000, SpentLLMTokens: 12000,
		Pending: []string{"prop-2", "prop-1"},
	}
	_, out, err := projectState(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("projectState: %v", err)
	}
	if !out.FaithfulProjection {
		t.Fatalf("the projected state must EQUAL the recorded run (faithful_projection)")
	}
	if len(out.Attempts) != 1 || out.Attempts[0].DiffHash != "d1" || !out.Attempts[0].Authorised {
		t.Fatalf("the attempt stream must project the write: %+v", out.Attempts)
	}
	if len(out.Sensors) != 1 || !out.Sensors[0].Green {
		t.Fatalf("the sensors must project the latest greens: %+v", out.Sensors)
	}
	if out.PendingCount != 2 || out.PendingIDs[0] != "prop-1" {
		t.Fatalf("the approval gate must surface sorted pending: %+v", out.PendingIDs)
	}
	if out.CiSpent != 4 || out.TokensCap != 100000 {
		t.Fatalf("the cost meter must project measured/declared: %+v", out)
	}
}

func TestRecordStablePhaseToolRecordsOnlyAtVerdict(t *testing.T) {
	green := recordStableInput{
		ProjectSlug: "shop",
		Cut:         map[string]string{"createOrder": "v3"},
		Heads:       map[string]string{"createOrder": "v3"},
		Links:       []linkIn{{FromID: "checkout", FromV: "v1", ToID: "createOrder", ToV: "v3"}},
		Sensors:     []sensorIn{{ID: "createOrder.fixture", Pass: true}},
		Label:       "checkout-stable",
	}
	_, out, err := recordStablePhase(context.Background(), nil, green)
	if err != nil {
		t.Fatalf("recordStablePhase: %v", err)
	}
	if !out.Stable || !out.Recorded || out.NodeID == "" {
		t.Fatalf("a green §43 cut must record a content-addressed node: %+v", out)
	}
	if len(out.ParentIDs) != 1 {
		t.Fatalf("the node must descend from the project's head: %+v", out.ParentIDs)
	}

	red := green
	red.Sensors = []sensorIn{{ID: "createOrder.fixture", Pass: false}}
	_, bad, err := recordStablePhase(context.Background(), nil, red)
	if err != nil {
		t.Fatalf("recordStablePhase: %v", err)
	}
	if bad.Stable || bad.Recorded || bad.NodeID != "" {
		t.Fatalf("an inconsistent cut must NOT record a node: %+v", bad)
	}
	if bad.BlockCode != "STABLE_PHASE_INCONSISTENT_CUT" || len(bad.HowToFix) == 0 {
		t.Fatalf("the refusal must be STABLE_PHASE_INCONSISTENT_CUT with a fix path: %+v", bad)
	}
}
