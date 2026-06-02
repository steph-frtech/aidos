// Property mirror (rapid, ∀, below the line, computational) for the goal engine
// (AIDOS step S29). reflects: runtime.goal.{OpenGoal,IsClosed} · test_kind: property ·
// cert_language: rapid · authority: below.
//
// It is the REPRODUCIBILITY mirror (CLAUDE.md §6 determinism-first): OpenGoal and IsClosed
// are pure, total and deterministic over their inputs (same input ⇒ same verdict), take NO
// agent-confidence input, and never panic.
package goal_test

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// genReddeningInput draws an idea-with-mirror whose spec_delta makes its mirror redden:
// a load-bearing reflects-link pinned to a non-head version (stale) ⇒ a non-empty red set.
func genReddeningInput(t *rapid.T) goal.OpenInput {
	target := rapid.StringMatching(`[A-Z][a-z]{1,6}\.[a-z]{1,6}`).Draw(t, "target")
	mirror := target + ".fixture"
	return goal.OpenInput{
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
		Heads: links.Heads{target: "v2"}, // head moved ⇒ v1 pin stale
	}
}

// ∀ idea with a mirror_delta that reddens: OpenGoal opens a DRAFT ChangeSet (never APPLIED),
// red_set non-empty, status OPEN.
func TestOpenGoalAlwaysOpensDraftWithNonEmptyRedSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genReddeningInput(t)
		g, br := goal.OpenGoal(in)
		if br != nil {
			t.Fatalf("blocked unexpectedly: %s", string(br.Code)+": "+br.Explanation)
		}
		if g.ChangeSet.Status != changeset.StatusDraft {
			t.Fatalf("status = %q, want DRAFT (never APPLIED — only S20's commit-gate applies)", g.ChangeSet.Status)
		}
		if len(g.RedSet) == 0 {
			t.Fatalf("red_set must be non-empty (§56)")
		}
		if g.Status != goal.StatusOpen {
			t.Fatalf("a fresh goal is OPEN")
		}
	})
}

// ∀ idea with no mirror_delta: OpenGoal == Blocked(IDEA_WITHOUT_MIRROR) — never silently promoted.
func TestOpenGoalRejectsMirrorlessIdea(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genReddeningInput(t)
		in.Idea.MirrorDelta = nil
		g, br := goal.OpenGoal(in)
		if br == nil || br.Code != blockreason.CodeIdeaWithoutMirror {
			t.Fatalf("a mirror-less idea must be blocked IDEA_WITHOUT_MIRROR; got br=%v", br)
		}
		if g.ChangeSet.ID != "" || g.Status != "" {
			t.Fatalf("no goal/changeset on rejection")
		}
	})
}

// ∀ idea already green: OpenGoal == Blocked(NO_RED_SET).
func TestOpenGoalRejectsAlreadyGreenIdea(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genReddeningInput(t)
		// Pin the mirror to the live head ⇒ green ⇒ empty red set.
		target := in.SpecDeltaTarget()
		in.Edges[0].Link.To.Version = "v2"
		in.Heads = links.Heads{target: "v2"}
		_, br := goal.OpenGoal(in)
		if br == nil || br.Code != blockreason.CodeNoRedSet {
			t.Fatalf("an already-green idea must be blocked NO_RED_SET; got br=%v", br)
		}
	})
}

// ∀ goal,sensors,mutation,monsters: IsClosed is DETERMINISTIC — same inputs ⇒ same verdict
// (and takes no self-assessment input — there is simply no confidence field to draw).
func TestIsClosedIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := goal.Goal{Status: goal.StatusOpen, RedSet: []string{"m.a", "m.b"}}
		in := genStopInput(t, g.RedSet)
		a := goal.IsClosed(g, in)
		b := goal.IsClosed(g, in)
		if a != b {
			t.Fatalf("IsClosed not deterministic: %v vs %v", a, b)
		}
	})
}

// ∀ goal with ≥1 still-red mirror OR broken prior green OR mutation<floor OR any monster:
// IsClosed == false.
func TestAnyFaultMeansNotClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		redSet := []string{"m.a", "m.b"}
		g := goal.Goal{Status: goal.StatusOpen, RedSet: redSet}
		in := genStopInput(t, redSet)
		faulty := anyRed(in.Sensors, redSet) ||
			in.PriorGreen != goal.PriorIntact ||
			in.Mutation < in.MutationFloor ||
			len(in.Monsters) > 0
		if faulty && goal.IsClosed(g, in) {
			t.Fatalf("a fault must mean IsClosed==false; in=%+v", in)
		}
	})
}

// ∀ closed goal: all four conditions hold (red set all green ∧ prior intact ∧ mut≥floor ∧ no monster).
func TestClosedImpliesAllFourHold(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		redSet := []string{"m.a", "m.b"}
		g := goal.Goal{Status: goal.StatusOpen, RedSet: redSet}
		in := genStopInput(t, redSet)
		if goal.IsClosed(g, in) {
			if anyRed(in.Sensors, redSet) {
				t.Fatalf("closed but a red mirror remains")
			}
			if in.PriorGreen != goal.PriorIntact {
				t.Fatalf("closed but prior green not intact")
			}
			if in.Mutation < in.MutationFloor {
				t.Fatalf("closed but mutation below floor")
			}
			if len(in.Monsters) > 0 {
				t.Fatalf("closed but a monster present")
			}
		}
	})
}

// ∀ goal: OpenGoal/IsClosed never panic — a malformed idea/goal yields a BlockReason/verdict.
func TestOpenGoalAndIsClosedNeverPanic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := goal.OpenInput{
			Idea: goal.Idea{
				ID:        rapid.String().Draw(t, "id"),
				SpecDelta: changeset.Delta{Kind: rapid.String().Draw(t, "k"), Target: rapid.String().Draw(t, "tgt")},
			},
		}
		if rapid.Bool().Draw(t, "hasMirror") {
			in.Idea.MirrorDelta = &changeset.Delta{Kind: "add", Target: rapid.String().Draw(t, "mtgt")}
		}
		_, _ = goal.OpenGoal(in) // must not panic
		g := goal.Goal{Status: goal.StatusOpen, RedSet: []string{rapid.String().Draw(t, "r")}}
		_ = goal.IsClosed(g, genStopInput(t, g.RedSet)) // must not panic
	})
}

func genStopInput(t *rapid.T, redSet []string) goal.StopInput {
	sensors := map[string]goal.SensorState{}
	for _, m := range redSet {
		if rapid.Bool().Draw(t, "green-"+m) {
			sensors[m] = goal.SensorGreen
		} else {
			sensors[m] = goal.SensorRed
		}
	}
	prior := goal.PriorIntact
	if rapid.Bool().Draw(t, "priorBroken") {
		prior = goal.PriorBroken
	}
	var monsters []string
	if rapid.Bool().Draw(t, "monster") {
		monsters = []string{"orphan-X"}
	}
	return goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    prior,
		Mutation:      rapid.Float64Range(0, 1).Draw(t, "mut"),
		MutationFloor: 0.8,
		Monsters:      monsters,
	}
}

func anyRed(sensors map[string]goal.SensorState, redSet []string) bool {
	for _, m := range redSet {
		if sensors[m] != goal.SensorGreen {
			return true
		}
	}
	return false
}
