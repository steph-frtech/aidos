// Property mirror (rapid, ∀, below the line, computational) for the S66 UI-piloted /goal.
// reflects: runtime.goalpiloting.{PilotOpenGoal,PilotCloseGoal} · test_kind: property ·
// cert_language: rapid · authority: below.
//
// The REPRODUCIBILITY mirror (CLAUDE.md §6 determinism-first): PilotOpenGoal/PilotCloseGoal
// are pure, total and deterministic over their inputs (same input ⇒ same verdict), take NO
// agent-confidence input, and never panic. They compose the S63 actor gate + the S29 engine;
// these properties prove the COMPOSITION stays deterministic and the wall holds.
package goalpiloting_test

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/goalpiloting"
)

// genReddeningInput draws an idea-with-mirror whose spec_delta makes its mirror redden — a
// load-bearing reflects-link pinned to a non-head version (stale) ⇒ a non-empty red set.
func genReddeningInput(t *rapid.T) goalpiloting.OpenInput {
	target := rapid.StringMatching(`[A-Z][a-z]{1,6}\.[a-z]{1,6}`).Draw(t, "target")
	mirror := target + ".fixture"
	return goalpiloting.OpenInput{
		Idea: goal.Idea{
			ID:          rapid.StringMatching(`idea-[a-z]{2,8}`).Draw(t, "ideaID"),
			SpecDelta:   changeset.Delta{Kind: "add", Target: target},
			MirrorDelta: &changeset.Delta{Kind: "add", Target: mirror},
		},
		ParentPhase: "phase-0",
		Bumped:      []string{target},
		Edges: []goal.Edge{{
			Link: links.Link{
				Kind: "reflects",
				From: links.Ref{ID: mirror, Version: "m1"},
				To:   links.Ref{ID: target, Version: "v1"},
			},
			LoadBearing: true,
		}},
		Heads:   links.Heads{target: "v2"},
		Budgets: goal.Budgets{TimeSeconds: 600, Turns: 20, Tokens: 100000},
	}
}

// genRealActor draws a non-placeholder acting human (a real identity + display).
func genRealActor(t *rapid.T) goalpiloting.Actor {
	return goalpiloting.Actor{
		Identity: rapid.StringMatching(`u-[a-z]{2,10}`).Draw(t, "identity"),
		Display:  rapid.StringMatching(`[A-Z][a-z]{2,10}`).Draw(t, "display"),
	}
}

// TestPilotOpenGoalIsDeterministic — same (actor, input) ⇒ byte-identical goal id + red set.
func TestPilotOpenGoalIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		actor := genRealActor(t)
		in := genReddeningInput(t)
		a, ba := goalpiloting.PilotOpenGoal(actor, in)
		b, bb := goalpiloting.PilotOpenGoal(actor, in)
		if (ba == nil) != (bb == nil) {
			t.Fatalf("non-deterministic block: %v vs %v", ba, bb)
		}
		if ba != nil {
			if ba.Code != bb.Code {
				t.Fatalf("non-deterministic block code: %q vs %q", ba.Code, bb.Code)
			}
			return
		}
		if a.Goal.ID != b.Goal.ID {
			t.Fatalf("non-deterministic goal id: %q vs %q", a.Goal.ID, b.Goal.ID)
		}
		if len(a.Goal.RedSet) != len(b.Goal.RedSet) {
			t.Fatalf("non-deterministic red set length")
		}
	})
}

// TestPilotedOpenAlwaysProducesADraftAndNonEmptyRedSet — a real actor + a reddening idea
// always yields an OPEN goal with a DRAFT ChangeSet (spec+mirror) and a non-empty red set.
func TestPilotedOpenAlwaysProducesADraftAndNonEmptyRedSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		res, br := goalpiloting.PilotOpenGoal(genRealActor(t), genReddeningInput(t))
		if br != nil {
			t.Fatalf("a real actor + reddening idea must open a goal; blocked %s", br.Error())
		}
		if res.Goal.ChangeSet.Status != changeset.StatusDraft {
			t.Fatalf("changeset not DRAFT: %q", res.Goal.ChangeSet.Status)
		}
		if res.Goal.ChangeSet.SpecDelta == nil || res.Goal.ChangeSet.MirrorDelta == nil {
			t.Fatalf("DRAFT ChangeSet must carry spec_delta AND mirror_delta")
		}
		if len(goalpiloting.LiveRedSet(res.Goal)) == 0 {
			t.Fatalf("live red set must be non-empty")
		}
		if res.Goal.Status != goal.StatusOpen {
			t.Fatalf("status = %q, want OPEN", res.Goal.Status)
		}
	})
}

// genPlaceholder draws a member of the declared placeholder denylist (S63).
func genPlaceholder(t *rapid.T) string {
	return rapid.SampledFrom([]string{
		"", "  ", "agent", "system", "aidos", "aidos_agent", "tbd", "todo",
		"placeholder", "anonymous", "anon", "unknown", "none", "null", "nobody",
	}).Draw(t, "placeholder")
}

// TestPlaceholderActorAlwaysRefused — the actor gate (the wall): never a goal for nobody.
func TestPlaceholderActorAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		id := genPlaceholder(t)
		res, br := goalpiloting.PilotOpenGoal(
			goalpiloting.Actor{Identity: id, Display: id},
			genReddeningInput(t),
		)
		if br == nil {
			t.Fatalf("placeholder %q must be refused", id)
		}
		if br.Code != "PLACEHOLDER_ACTOR" {
			t.Fatalf("code = %q, want PLACEHOLDER_ACTOR", br.Code)
		}
		if res.Goal.ChangeSet.ID != "" {
			t.Fatalf("no changeset opened on refusal")
		}
	})
}

// TestCloseIffAllFourConditionsHold — the non-gameable stop, ∀: PilotCloseGoal returns nil
// (closeable) IFF red→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster. Same input ⇒
// same verdict; never panics. The agent's confidence is never an input.
func TestCloseIffAllFourConditionsHold(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mirror := "X.y.fixture"
		g := goalpiloting.Goal{Status: goal.StatusOpen, RedSet: []string{mirror}}

		redGreen := rapid.Bool().Draw(t, "redGreen")
		priorIntact := rapid.Bool().Draw(t, "priorIntact")
		mut := rapid.Float64Range(0, 1).Draw(t, "mut")
		floor := rapid.Float64Range(0, 1).Draw(t, "floor")
		hasMonster := rapid.Bool().Draw(t, "hasMonster")

		sensor := goal.SensorRed
		if redGreen {
			sensor = goal.SensorGreen
		}
		prior := goal.PriorBroken
		if priorIntact {
			prior = goal.PriorIntact
		}
		var monsters []string
		if hasMonster {
			monsters = []string{"m"}
		}
		in := goalpiloting.StopInput{
			Sensors:       map[string]goal.SensorState{mirror: sensor},
			PriorGreen:    prior,
			Mutation:      mut,
			MutationFloor: floor,
			Monsters:      monsters,
		}
		want := redGreen && priorIntact && mut >= floor && !hasMonster

		br := goalpiloting.PilotCloseGoal(g, in)
		got := br == nil
		if got != want {
			t.Fatalf("close verdict = %v, want %v (in %+v)", got, want, in)
		}
		if goalpiloting.CanClose(g, in) != want {
			t.Fatalf("CanClose disagrees with PilotCloseGoal")
		}
		if !want && br.Code != "GOAL_STILL_RED" {
			t.Fatalf("refusal code = %q, want GOAL_STILL_RED", br.Code)
		}
	})
}
