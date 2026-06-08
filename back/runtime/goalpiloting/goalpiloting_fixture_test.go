// Fixture mirror (N2: state → command → events) for the S66 UI-piloted /goal.
//
// Conceptually stored in the `mirrors` schema (reflects: runtime.goalpiloting.PilotOpenGoal /
// runtime.goalpiloting.PilotCloseGoal · test_kind: fixture · cert_language: operation-dsl/go ·
// authority: above) and materialized here for the Go runner (bootstrap exception, CLAUDE.md §6).
//
// THE S66 done criterion (ROADMAP-app-builder S66, KRD §56–§57): a user PORTEUR D'AUTORITÉ
// opens a goal from an idea → a DRAFT ChangeSet (Truth + Mirror) + the LIVE red set; a
// placeholder actor is refused; closing is NON-GAMEABLE and the screen never writes the Kernel.
package goalpiloting_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/goalpiloting"
)

func mirrorIdea() goal.Idea {
	return goal.Idea{
		ID:          "idea-order-discount",
		SpecDelta:   changeset.Delta{Kind: "add", Target: "Order.discount"},
		MirrorDelta: &changeset.Delta{Kind: "add", Target: "Order.discount.fixture"},
	}
}

func realActor() goalpiloting.Actor {
	return goalpiloting.Actor{Identity: "u-amelie", Display: "Amélie Roy"}
}

// TestAuthorityBearingUserOpensADraftChangeSetAndLiveRedSet — THE S66 done criterion.
func TestAuthorityBearingUserOpensADraftChangeSetAndLiveRedSet(t *testing.T) {
	res, br := goalpiloting.PilotOpenGoal(realActor(), reddeningOpenInput(mirrorIdea()))
	if br != nil {
		t.Fatalf("PilotOpenGoal blocked unexpectedly: %s", br.Error())
	}
	// The acting human is carried for provenance + display (never a placeholder).
	if res.Actor.Identity != "u-amelie" || res.Actor.Display != "Amélie Roy" {
		t.Fatalf("actor not carried: %+v", res.Actor)
	}
	// A DRAFT ChangeSet carrying spec_delta AND mirror_delta atomically (the proposal).
	if res.Goal.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("changeset status = %q, want DRAFT", res.Goal.ChangeSet.Status)
	}
	if res.Goal.ChangeSet.SpecDelta == nil || res.Goal.ChangeSet.MirrorDelta == nil {
		t.Fatalf("the DRAFT ChangeSet must carry spec_delta AND mirror_delta")
	}
	// A non-empty LIVE red set (the worklist) and an OPEN goal.
	if len(goalpiloting.LiveRedSet(res.Goal)) == 0 {
		t.Fatalf("live red set empty — a goal carries ≥1 red mirror (§56)")
	}
	if res.Goal.Status != goal.StatusOpen {
		t.Fatalf("status = %q, want OPEN", res.Goal.Status)
	}
}

// TestPlaceholderActorCannotPilotAGoal — the S63 actor gate (the wall): no goal for nobody.
func TestPlaceholderActorCannotPilotAGoal(t *testing.T) {
	for _, id := range []string{"", "agent", "system", "placeholder", "  "} {
		res, br := goalpiloting.PilotOpenGoal(
			goalpiloting.Actor{Identity: id, Display: id},
			reddeningOpenInput(mirrorIdea()),
		)
		if br == nil {
			t.Fatalf("placeholder %q must be refused", id)
		}
		if br.Code != "PLACEHOLDER_ACTOR" {
			t.Fatalf("code = %q, want PLACEHOLDER_ACTOR for %q", br.Code, id)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("refusal without how_to_fix is a prison (§44.5)")
		}
		if res.Goal.ChangeSet.ID != "" || res.Goal.Status != "" {
			t.Fatalf("no goal/changeset opened on a placeholder refusal; got %+v", res.Goal)
		}
	}
}

// TestAMirrorlessIdeaIsRefused — S29's IDEA_WITHOUT_MIRROR carried through the pilot.
func TestAMirrorlessIdeaIsRefused(t *testing.T) {
	idea := mirrorIdea()
	idea.ID = "idea-no-mirror"
	idea.MirrorDelta = nil
	res, br := goalpiloting.PilotOpenGoal(realActor(), reddeningOpenInput(idea))
	if br == nil || br.Code != "IDEA_WITHOUT_MIRROR" {
		t.Fatalf("a mirror-less idea must be refused IDEA_WITHOUT_MIRROR; got %+v", br)
	}
	if res.Goal.Status != "" {
		t.Fatalf("no goal opened on rejection; got %+v", res.Goal)
	}
}

// TestAnAlreadyGreenIdeaHasNoGoal — S29's NO_RED_SET carried through (a green test is no goal).
func TestAnAlreadyGreenIdeaHasNoGoal(t *testing.T) {
	idea := mirrorIdea()
	idea.ID = "idea-already-true"
	in := goalpiloting.OpenInput{
		Idea:        idea,
		ParentPhase: "phase-0",
		Bumped:      []string{"Order.discount"},
		Edges: []goal.Edge{{
			Link: links.Link{
				Kind: "reflects",
				From: links.Ref{ID: "Order.discount.fixture", Version: "m1"},
				To:   links.Ref{ID: "Order.discount", Version: "v2"}, // pinned to the live head ⇒ green
			},
			LoadBearing: true,
		}},
		Heads: links.Heads{"Order.discount": "v2"},
	}
	_, br := goalpiloting.PilotOpenGoal(realActor(), in)
	if br == nil || br.Code != "NO_RED_SET" {
		t.Fatalf("an already-green idea must be refused NO_RED_SET; got %+v", br)
	}
}

// TestCloseIsNonGameable — THE close done criterion: refused unless all four conditions hold.
func TestCloseIsNonGameable(t *testing.T) {
	g := goalpiloting.Goal{Status: goal.StatusOpen, RedSet: []string{"Order.discount.fixture"}}
	green := map[string]goal.SensorState{"Order.discount.fixture": goal.SensorGreen}

	// All four hold ⇒ close accepted (nil block, CanClose true).
	if br := goalpiloting.PilotCloseGoal(g, goalpiloting.StopInput{
		Sensors: green, PriorGreen: goal.PriorIntact, Mutation: 0.9, MutationFloor: 0.8,
	}); br != nil {
		t.Fatalf("close must be accepted when all four conditions hold; got %s", br.Error())
	}

	// Each single fault keeps it OPEN with GOAL_STILL_RED.
	faults := []struct {
		name string
		in   goalpiloting.StopInput
	}{
		{"surviving red", goalpiloting.StopInput{Sensors: map[string]goal.SensorState{"Order.discount.fixture": goal.SensorRed}, PriorGreen: goal.PriorIntact, Mutation: 0.9, MutationFloor: 0.8}},
		{"broken prior green", goalpiloting.StopInput{Sensors: green, PriorGreen: goal.PriorBroken, Mutation: 0.9, MutationFloor: 0.8}},
		{"low mutation", goalpiloting.StopInput{Sensors: green, PriorGreen: goal.PriorIntact, Mutation: 0.5, MutationFloor: 0.8}},
		{"a monster", goalpiloting.StopInput{Sensors: green, PriorGreen: goal.PriorIntact, Mutation: 0.9, MutationFloor: 0.8, Monsters: []string{"orphan-mirror-X"}}},
	}
	for _, f := range faults {
		br := goalpiloting.PilotCloseGoal(g, f.in)
		if br == nil {
			t.Fatalf("%s: close must be refused (the goal stays OPEN)", f.name)
		}
		if br.Code != "GOAL_STILL_RED" {
			t.Fatalf("%s: code = %q, want GOAL_STILL_RED", f.name, br.Code)
		}
		if goalpiloting.CanClose(g, f.in) {
			t.Fatalf("%s: CanClose must be false", f.name)
		}
	}
}
