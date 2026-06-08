package main

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// Fault-injection mirror for the GOAL-CHECK half of the Stop hook (CLAUDE.md §5 /
// KRD §32 hook-honesty: a Stop hook that never fires is governance theatre; §57 ①:
// the non-gameable stop). Starting from a real OPEN goal (opened via the S29 engine
// on the canonical idea-order-discount), we inject each fault that must KEEP THE GOAL
// OPEN — (a) a still-red mirror in the red set, (b) a broken prior green — and assert
// the Stop hook BLOCKS with GOAL_STILL_RED; then we present the closeable state
// (red set→green ∧ prior intact ∧ mutation≥floor ∧ no monster) and assert it PASSES.
// We drive the full binary entrypoint (Run over stdin/stdout) through the goalSource
// seam, so the proof is "the hook blocks the close", not merely "IsClosed math holds".

// openTestGoal opens a real goal via the S29 engine (the canonical idea-order-discount,
// the same pinned artifact the goal package's own fixture uses — no new ids coined).
func openTestGoal(t *testing.T) goal.Goal {
	t.Helper()
	g, br := goal.OpenGoal(goal.OpenInput{
		Idea: goal.Idea{
			ID:          "idea-order-discount",
			SpecDelta:   changeset.Delta{Kind: "add", Target: "Order.discount"},
			MirrorDelta: &changeset.Delta{Kind: "add", Target: "Order.discount.fixture"},
		},
		ParentPhase: "phase-0",
		Bumped:      []string{"Order.discount"},
		Edges: []goal.Edge{{
			Link: links.Link{
				Kind: "reflects",
				From: links.Ref{ID: "Order.discount.fixture", Version: "m1"},
				To:   links.Ref{ID: "Order.discount", Version: "v1"},
			},
			LoadBearing: true,
		}},
		Heads:   links.Heads{"Order.discount": "v2"},
		Budgets: goal.Budgets{TimeSeconds: 600, Turns: 20, Tokens: 100000},
	})
	if br != nil {
		t.Fatalf("openTestGoal: OpenGoal blocked: %s", string(br.Code))
	}
	if len(g.RedSet) == 0 {
		t.Fatalf("openTestGoal: red set empty — cannot stage the fault-injection")
	}
	return g
}

// fixedGoalSource stages one OPEN goal + its live StopInput for the goal-check half.
type fixedGoalSource struct {
	g  goal.Goal
	in goal.StopInput
}

func (s fixedGoalSource) Load(context.Context) (goal.Goal, goal.StopInput, bool, error) {
	return s.g, s.in, true, nil
}

// withGoalSource temporarily installs a goal-check source for one Run, restoring the
// default NoGoalSource after (additive, never a permanent mutation of the seam).
func withGoalSource(src GoalCheckSource, fn func()) {
	prev := goalSource
	goalSource = src
	defer func() { goalSource = prev }()
	fn()
}

// runGoalBinary drives the hook with a staged goal source and returns its exit code +
// the goal BlockReason it wrote (if any). The completeness half runs over an EMPTY cut
// (no monster) so the verdict isolates the goal-check half.
func runGoalBinary(t *testing.T, src GoalCheckSource) (int, *blockreason.BlockReason) {
	t.Helper()
	var out bytes.Buffer
	var code int
	withGoalSource(src, func() {
		code = Run(context.Background(), strings.NewReader(`{"ref":"goal-fault-injection"}`), &out, EmptyCutSource{}, nil)
	})
	var br *blockreason.BlockReason
	if out.Len() > 0 {
		var parsed blockreason.BlockReason
		if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
			t.Fatalf("goal BlockReason JSON unreadable: %v (raw=%q)", err, out.String())
		}
		br = &parsed
	}
	return code, br
}

// allGreen is the StopInput where every red-set mirror is green.
func allGreen(g goal.Goal) goal.StopInput {
	sensors := map[string]goal.SensorState{}
	for _, m := range g.RedSet {
		sensors[m] = goal.SensorGreen
	}
	return goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    goal.PriorIntact,
		Mutation:      0.9,
		MutationFloor: 0.8,
		Monsters:      nil,
	}
}

// INJECT (a): leave one red-set mirror RED. ASSERT: the Stop is BLOCKED, GOAL_STILL_RED.
func TestGoalFaultInjection_StillRedMirror_Blocks(t *testing.T) {
	g := openTestGoal(t)
	in := allGreen(g)
	in.Sensors[g.RedSet[0]] = goal.SensorRed // re-redden one mirror

	code, br := runGoalBinary(t, fixedGoalSource{g: g, in: in})
	if code != exitBlock {
		t.Fatalf("a still-red mirror must BLOCK the Stop; exit = %d, want %d", code, exitBlock)
	}
	if br == nil || br.Code != blockreason.CodeGoalStillRed {
		t.Fatalf("want BlockReason GOAL_STILL_RED, got %+v", br)
	}
}

// INJECT (b): redden a previously-green prior truth. ASSERT: the Stop is BLOCKED.
func TestGoalFaultInjection_BrokenPriorGreen_Blocks(t *testing.T) {
	g := openTestGoal(t)
	in := allGreen(g)
	in.PriorGreen = goal.PriorBroken // a regression on a prior truth (§8)

	code, br := runGoalBinary(t, fixedGoalSource{g: g, in: in})
	if code != exitBlock {
		t.Fatalf("a broken prior green must BLOCK the Stop; exit = %d, want %d", code, exitBlock)
	}
	if br == nil || br.Code != blockreason.CodeGoalStillRed {
		t.Fatalf("want BlockReason GOAL_STILL_RED, got %+v", br)
	}
}

// INJECT (c): mutation below the declared floor. ASSERT: the Stop is BLOCKED.
func TestGoalFaultInjection_MutationBelowFloor_Blocks(t *testing.T) {
	g := openTestGoal(t)
	in := allGreen(g)
	in.Mutation = 0.5 // below the 0.8 floor

	code, _ := runGoalBinary(t, fixedGoalSource{g: g, in: in})
	if code != exitBlock {
		t.Fatalf("mutation below floor must BLOCK the Stop; exit = %d, want %d", code, exitBlock)
	}
}

// INJECT (d): a monster present. ASSERT: the Stop is BLOCKED.
func TestGoalFaultInjection_Monster_Blocks(t *testing.T) {
	g := openTestGoal(t)
	in := allGreen(g)
	in.Monsters = []string{"orphan-mirror-1"}

	code, _ := runGoalBinary(t, fixedGoalSource{g: g, in: in})
	if code != exitBlock {
		t.Fatalf("a monster must BLOCK the Stop; exit = %d, want %d", code, exitBlock)
	}
}

// NEGATIVE CONTROL: red set→green ∧ prior intact ∧ mutation≥floor ∧ no monster ⇒ the
// goal is closeable; the Stop must PASS (the gate is passable, not a brick wall).
func TestGoalFaultInjection_CloseableGoal_Passes(t *testing.T) {
	g := openTestGoal(t)
	in := allGreen(g)

	code, br := runGoalBinary(t, fixedGoalSource{g: g, in: in})
	if code != exitAllow {
		t.Fatalf("a fully-green, closeable goal must PASS the Stop; exit = %d, want %d (br=%+v)", code, exitAllow, br)
	}
	if br != nil {
		t.Fatalf("a closeable goal must emit no BlockReason, got %+v", br)
	}
}

// NO OPEN GOAL: the goal-check half is a no-op (NoGoalSource); the Stop passes the
// goal half and falls through to the (empty-cut, monster-free) completeness half.
func TestGoalCheck_NoOpenGoal_IsNoOp(t *testing.T) {
	var out bytes.Buffer
	code := Run(context.Background(), strings.NewReader(`{"ref":"no-goal"}`), &out, EmptyCutSource{}, nil)
	if code != exitAllow {
		t.Fatalf("no open goal ⇒ goal-check is a no-op; exit = %d, want %d", code, exitAllow)
	}
}
