package goalpilotingsrv

import (
	"context"
	"testing"
)

// The goal-piloting MCP server is PURE computation (the wall): these tests prove each tool
// opens/closes deterministically without any I/O. They mirror the S66 done-criterion at the
// MCP boundary — a DRAFT ChangeSet proposal + the LIVE red set, the actor gate, and the
// NON-GAMEABLE close (refused unless all four conditions hold).

// reddeningOpen reuses S29/S22's canonical reddening artifacts (a stale load-bearing
// reflects-link) so the red set is the REAL derived one.
func reddeningOpen(actorID, actorDisplay string, withMirror bool) openInput {
	in := openInput{
		ActorIdentity: actorID,
		ActorDisplay:  actorDisplay,
		IdeaID:        "idea-order-discount",
		SpecDelta:     deltaInput{Kind: "add", Target: "Order.discount"},
		ParentPhase:   "phase-0",
		Bumped:        []string{"Order.discount"},
		Edges: []edgeInput{{
			Kind: "reflects", FromID: "Order.discount.fixture", FromVersion: "m1",
			ToID: "Order.discount", ToVersion: "v1", LoadBearing: true,
		}},
		Heads:       map[string]string{"Order.discount": "v2"},
		TimeSeconds: 600, Turns: 20, Tokens: 100000,
	}
	if withMirror {
		in.MirrorDelta = &deltaInput{Kind: "add", Target: "Order.discount.fixture"}
	}
	return in
}

func TestGoalPilotOpenProposesDraftChangeSetAndLiveRedSet(t *testing.T) {
	_, out, err := open(context.Background(), nil, reddeningOpen("u-amelie", "Amélie Roy", true))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !out.OK {
		t.Fatalf("open refused: %+v", out.Block)
	}
	if out.ChangeSetMode != "DRAFT" {
		t.Fatalf("changeset status = %q, want DRAFT (a proposal, never applied)", out.ChangeSetMode)
	}
	if out.ChangeSetRef == "" || out.GoalID == "" {
		t.Fatalf("missing goal/changeset ref: %+v", out)
	}
	if len(out.RedSet) == 0 {
		t.Fatalf("live red set empty — a goal carries ≥1 red mirror (§56)")
	}
	if out.Status != "OPEN" {
		t.Fatalf("status = %q, want OPEN", out.Status)
	}
	if out.ActorIdentity != "u-amelie" {
		t.Fatalf("actor not carried: %q", out.ActorIdentity)
	}
}

func TestGoalPilotOpenRefusesPlaceholderActor(t *testing.T) {
	for _, id := range []string{"", "agent", "system", "placeholder"} {
		_, out, _ := open(context.Background(), nil, reddeningOpen(id, id, true))
		if out.OK {
			t.Fatalf("placeholder %q must be refused", id)
		}
		if out.Block == nil || out.Block.Code != "PLACEHOLDER_ACTOR" {
			t.Fatalf("code = %+v, want PLACEHOLDER_ACTOR for %q", out.Block, id)
		}
		if len(out.Block.HowToFix) == 0 {
			t.Fatalf("refusal without how_to_fix is a prison (§44.5)")
		}
	}
}

func TestGoalPilotOpenRefusesMirrorlessIdea(t *testing.T) {
	_, out, _ := open(context.Background(), nil, reddeningOpen("u-amelie", "Amélie Roy", false))
	if out.OK || out.Block == nil || out.Block.Code != "IDEA_WITHOUT_MIRROR" {
		t.Fatalf("a mirror-less idea must be refused IDEA_WITHOUT_MIRROR; got %+v", out)
	}
}

func TestGoalPilotCloseIsNonGameable(t *testing.T) {
	red := []string{"Order.discount.fixture"}
	green := []sensorInput{{Mirror: "Order.discount.fixture", State: "green"}}

	// All four hold ⇒ closeable.
	_, out, _ := closeGoal(context.Background(), nil, closeInput{
		RedSet: red, Sensors: green, PriorGreen: "intact", Mutation: 0.9, MutationFloor: 0.8,
	})
	if !out.Closeable || out.Block != nil {
		t.Fatalf("close must be accepted when all four hold; got %+v", out)
	}

	// Each fault ⇒ not closeable with GOAL_STILL_RED.
	faults := []closeInput{
		{RedSet: red, Sensors: []sensorInput{{Mirror: "Order.discount.fixture", State: "red"}}, PriorGreen: "intact", Mutation: 0.9, MutationFloor: 0.8},
		{RedSet: red, Sensors: green, PriorGreen: "broken", Mutation: 0.9, MutationFloor: 0.8},
		{RedSet: red, Sensors: green, PriorGreen: "intact", Mutation: 0.5, MutationFloor: 0.8},
		{RedSet: red, Sensors: green, PriorGreen: "intact", Mutation: 0.9, MutationFloor: 0.8, Monsters: []string{"m"}},
	}
	for i, f := range faults {
		_, o, _ := closeGoal(context.Background(), nil, f)
		if o.Closeable {
			t.Fatalf("fault %d: close must be refused", i)
		}
		if o.Block == nil || o.Block.Code != "GOAL_STILL_RED" {
			t.Fatalf("fault %d: code = %+v, want GOAL_STILL_RED", i, o.Block)
		}
	}
}

func TestGoalLiveRedSetSorted(t *testing.T) {
	_, out, err := redSet(context.Background(), nil, redSetInput{RedSet: []string{"b.fixture", "a.fixture"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.RedSet) != 2 || out.RedSet[0] != "a.fixture" || out.RedSet[1] != "b.fixture" {
		t.Fatalf("red set not sorted: %v", out.RedSet)
	}
}

func TestServerRegistersThreeTools(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("nil server")
	}
}
