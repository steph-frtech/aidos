// Fixture mirror (N2: state → command → events) for the goal engine (AIDOS step S29).
//
// Conceptually stored in the `mirrors` schema (reflects: runtime.goal.OpenGoal /
// runtime.goal.IsClosed · test_kind: fixture · cert_language: operation-dsl/go ·
// authority: above) and materialized here for the Go runner (the bootstrap exception,
// CLAUDE.md §6: the mirrors schema persists it from S06, this file IS the red→green proof).
//
// THE done criterion (KRD §56): opening a goal from an idea creates a DRAFT ChangeSet and
// a NON-EMPTY red set. And the stop is NON-GAMEABLE (§57 ①): the goal closes ONLY when the
// red set is green ∧ prior green intact ∧ mutation ≥ threshold ∧ no monster — never on the
// agent's say-so.
package goal_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// orderDiscountIdea is the canonical idea reused from S20/S22's pinned artifacts
// (idea-order-discount / Order.discount / Order.discount.fixture) — no new ids coined.
func orderDiscountIdea() goal.Idea {
	return goal.Idea{
		ID: "idea-order-discount",
		SpecDelta: changeset.Delta{
			Kind:   "add",
			Target: "Order.discount",
		},
		MirrorDelta: &changeset.Delta{
			Kind:   "add",
			Target: "Order.discount.fixture",
		},
	}
}

// reddeningInputs are the S22 inputs that make Order.discount.fixture redden: a bumped
// source (Order.discount, its head moved) plus a load-bearing edge from the mirror pinned
// to the OLD version, so links.Resolve reports it stale.
func reddeningInputs() (bumped []string, edges []goal.Edge, heads links.Heads) {
	bumped = []string{"Order.discount"}
	edges = []goal.Edge{{
		Link: links.Link{
			Kind: "reflects",
			From: links.Ref{ID: "Order.discount.fixture", Version: "m1"},
			To:   links.Ref{ID: "Order.discount", Version: "v1"}, // pinned to the OLD version
		},
		LoadBearing: true,
	}}
	heads = links.Heads{"Order.discount": "v2"} // head moved to v2 ⇒ the v1 pin is stale
	return bumped, edges, heads
}

// TestOpeningAGoalCreatesADraftChangeSetAndNonEmptyRedSet — THE done criterion (§56).
func TestOpeningAGoalCreatesADraftChangeSetAndNonEmptyRedSet(t *testing.T) {
	idea := orderDiscountIdea()
	bumped, edges, heads := reddeningInputs()

	g, br := goal.OpenGoal(goal.OpenInput{
		Idea:        idea,
		ParentPhase: "phase-0",
		Bumped:      bumped,
		Edges:       edges,
		Heads:       heads,
		Budgets:     goal.Budgets{TimeSeconds: 600, Turns: 20, Tokens: 100000},
	})
	if br != nil {
		t.Fatalf("OpenGoal blocked unexpectedly: %s", string(br.Code)+": "+br.Explanation)
	}
	// -> goal.changeset_ref points to a ChangeSet with status == DRAFT (S20, the only door).
	if g.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("changeset status = %q, want DRAFT", g.ChangeSet.Status)
	}
	if g.ChangeSetRef == "" || g.ChangeSetRef != g.ChangeSet.ID {
		t.Fatalf("changeset_ref %q must equal the DRAFT ChangeSet id %q", g.ChangeSetRef, g.ChangeSet.ID)
	}
	// The envelope carries BOTH the spec_delta and the mirror_delta, atomically.
	if g.ChangeSet.SpecDelta == nil || g.ChangeSet.MirrorDelta == nil {
		t.Fatalf("the DRAFT ChangeSet must carry spec_delta AND mirror_delta atomically")
	}
	// -> goal.red_set is non-empty (≥1 red mirror — the goal exists).
	if len(g.RedSet) == 0 {
		t.Fatalf("red_set is empty — a goal must carry ≥1 red mirror (§56)")
	}
	// -> goal.status == OPEN.
	if g.Status != goal.StatusOpen {
		t.Fatalf("status = %q, want OPEN", g.Status)
	}
	// -> idea_ref pins the source idea.
	if g.IdeaRef != idea.ID {
		t.Fatalf("idea_ref = %q, want %q", g.IdeaRef, idea.ID)
	}
}

// TestAnIdeaWithNoMirrorIsRejected — §57, LIVRE XX (a vœu / monster).
func TestAnIdeaWithNoMirrorIsRejected(t *testing.T) {
	idea := orderDiscountIdea()
	idea.ID = "idea-no-mirror"
	idea.MirrorDelta = nil // no mirror_delta

	g, br := goal.OpenGoal(goal.OpenInput{Idea: idea, ParentPhase: "phase-0"})
	if br == nil {
		t.Fatalf("OpenGoal must block an idea with no mirror")
	}
	if br.Code != blockreason.CodeIdeaWithoutMirror {
		t.Fatalf("block code = %q, want IDEA_WITHOUT_MIRROR", br.Code)
	}
	if !containsFix(br.HowToFix, "draft_mirror_for_idea") {
		t.Fatalf("how_to_fix must contain draft_mirror_for_idea; got %v", br.HowToFix)
	}
	// -> no goal, no changeset is opened.
	if g.Status != "" || g.ChangeSet.ID != "" {
		t.Fatalf("no goal / no changeset must be opened on rejection; got %+v", g)
	}
}

// TestAnAlreadyGreenIdeaHasNoGoal — §56: a green test is not a goal (NO_RED_SET).
func TestAnAlreadyGreenIdeaHasNoGoal(t *testing.T) {
	idea := orderDiscountIdea()
	idea.ID = "idea-already-true"
	// The mirror is already green: its link is pinned to the live head ⇒ Resolve == green
	// ⇒ Impact derives an EMPTY red set.
	edges := []goal.Edge{{
		Link: links.Link{
			Kind: "reflects",
			From: links.Ref{ID: "Order.discount.fixture", Version: "m1"},
			To:   links.Ref{ID: "Order.discount", Version: "v2"}, // pinned to the live head
		},
		LoadBearing: true,
	}}
	g, br := goal.OpenGoal(goal.OpenInput{
		Idea:        idea,
		ParentPhase: "phase-0",
		Bumped:      []string{"Order.discount"},
		Edges:       edges,
		Heads:       links.Heads{"Order.discount": "v2"},
	})
	if br == nil {
		t.Fatalf("OpenGoal must block an already-green idea")
	}
	if br.Code != blockreason.CodeNoRedSet {
		t.Fatalf("block code = %q, want NO_RED_SET", br.Code)
	}
	if g.Status != "" {
		t.Fatalf("no goal opened on an empty red set; got %+v", g)
	}
}

// TestTheGoalClosesOnlyWhenRedSetGreenAndPriorGreenIntact — non-gameable stop (§57 ①).
func TestTheGoalClosesOnlyWhenRedSetGreenAndPriorGreenIntact(t *testing.T) {
	g := goal.Goal{
		Status: goal.StatusOpen,
		RedSet: []string{"Order.discount.fixture"},
	}
	// red set still red ⇒ cannot close.
	if goal.IsClosed(g, goal.StopInput{
		Sensors:       map[string]goal.SensorState{"Order.discount.fixture": goal.SensorRed},
		PriorGreen:    goal.PriorIntact,
		Mutation:      0.9,
		MutationFloor: 0.8,
		Monsters:      nil,
	}) {
		t.Fatalf("stop must be false while a red mirror remains")
	}
	// red→green ∧ prior intact ∧ mut≥thr ∧ no monster ⇒ close.
	if !goal.IsClosed(g, goal.StopInput{
		Sensors:       map[string]goal.SensorState{"Order.discount.fixture": goal.SensorGreen},
		PriorGreen:    goal.PriorIntact,
		Mutation:      0.9,
		MutationFloor: 0.8,
		Monsters:      nil,
	}) {
		t.Fatalf("stop must be true when all four conditions hold")
	}
}

// TestAnyFaultKeepsTheGoalOpen — a surviving red, a broken prior green, a low mutation
// score, or a monster keeps the goal OPEN (§8).
func TestAnyFaultKeepsTheGoalOpen(t *testing.T) {
	g := goal.Goal{Status: goal.StatusOpen, RedSet: []string{"Order.discount.fixture"}}
	green := map[string]goal.SensorState{"Order.discount.fixture": goal.SensorGreen}

	cases := []struct {
		name string
		in   goal.StopInput
	}{
		{"broken prior green", goal.StopInput{Sensors: green, PriorGreen: goal.PriorBroken, Mutation: 0.9, MutationFloor: 0.8}},
		{"surviving red", goal.StopInput{Sensors: map[string]goal.SensorState{"Order.discount.fixture": goal.SensorRed}, PriorGreen: goal.PriorIntact, Mutation: 0.9, MutationFloor: 0.8}},
		{"low mutation", goal.StopInput{Sensors: green, PriorGreen: goal.PriorIntact, Mutation: 0.5, MutationFloor: 0.8}},
		{"a monster", goal.StopInput{Sensors: green, PriorGreen: goal.PriorIntact, Mutation: 0.9, MutationFloor: 0.8, Monsters: []string{"orphan-mirror-X"}}},
	}
	for _, c := range cases {
		if goal.IsClosed(g, c.in) {
			t.Fatalf("%s: stop must be false (the goal stays OPEN)", c.name)
		}
	}
}

// TestRecordedGoalIDIsContentHashOfBody — content-addressed (S02 reused).
func TestRecordedGoalIDIsContentHashOfBody(t *testing.T) {
	idea := orderDiscountIdea()
	bumped, edges, heads := reddeningInputs()
	g, br := goal.OpenGoal(goal.OpenInput{
		Idea: idea, ParentPhase: "phase-0", Bumped: bumped, Edges: edges, Heads: heads,
		Budgets: goal.Budgets{TimeSeconds: 600, Turns: 20, Tokens: 100000},
	})
	if br != nil {
		t.Fatalf("OpenGoal blocked: %s", string(br.Code)+": "+br.Explanation)
	}
	want, err := goal.ComputeID(g)
	if err != nil {
		t.Fatalf("ComputeID: %v", err)
	}
	if g.ID != want {
		t.Fatalf("goal.id = %q, want Hash(Canonicalize(body)) = %q", g.ID, want)
	}
}

func containsFix(fixes []string, want string) bool {
	for _, f := range fixes {
		if f == want || len(f) >= len(want) && f[:len(want)] == want {
			return true
		}
	}
	return false
}
