package main

import (
	"context"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// GoalCheck is the goal-check HALF of the Stop hook (KRD §57 Algorithme ①, §8;
// doc.go line `run: "goal-check && completeness-check"`). It is the NON-GAMEABLE
// stop gate for an OPEN goal: the goal may close ONLY when
//
//	red set → green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster
//
// It REUSES the pure engine goal.IsClosed / goal.CloseBlockReason (back/runtime/goal,
// S29) — the verdict is NEVER re-implemented here, and the hook reads NO agent claim
// of "done" (the whole point of S29: the agent never grades its own copy). When the
// goal is not closeable the hook surfaces goal's actionable GOAL_STILL_RED BlockReason
// and BLOCKS the Stop.
//
// THE WALL (CLAUDE.md §2): goal-check READS the goal's live red set + the sensor /
// mutation / monster status (the SELECT-only role); it writes no truth and never
// stamps a goal CLOSED (the DRAFT→APPLIED transition stays S20's commit-gate).

// GoalCheckSource loads the goal-check inputs for the current run: the OPEN goal and
// the live StopInput (red-set sensor verdicts, prior-green state, mutation score +
// declared floor, monster findings). The seam lets the journey feed a fixed
// goal+inputs and the production hook read real Postgres (SELECT-only). It returns
// hasGoal=false when there is no OPEN goal in this run (goal-check is then a no-op:
// nothing to close, the completeness half still runs).
type GoalCheckSource interface {
	Load(ctx context.Context) (g goal.Goal, in goal.StopInput, hasGoal bool, err error)
}

// NoGoalSource is the no-DB / no-open-goal fallback: there is no goal to check, so
// goal-check passes (it is the ABSENCE of an open goal, not a silent pass over a red
// one). The binary uses it when no DATABASE_URL / no open goal is wired.
type NoGoalSource struct{}

// Load reports no open goal.
func (NoGoalSource) Load(context.Context) (goal.Goal, goal.StopInput, bool, error) {
	return goal.Goal{}, goal.StopInput{}, false, nil
}

// CheckGoal runs the goal-check half: load the OPEN goal + its live StopInput, then
// REUSE goal.CloseBlockReason to decide. Returns nil when the goal is closeable (or
// there is no open goal); a non-nil BlockReason BLOCKS the Stop. A load error fails
// CLOSED (anti-passthrough, KRD §82): a goal whose status cannot be read must not
// close on absent evidence — it surfaces a GOAL_STILL_RED block rather than passing.
func CheckGoal(ctx context.Context, src GoalCheckSource) *blockreason.BlockReason {
	if src == nil {
		return nil
	}
	g, in, hasGoal, err := src.Load(ctx)
	if err != nil {
		// Cannot read the goal's verdict → BLOCK (fail-closed). We cannot prove
		// red→green, so we do not let the Stop through on missing evidence.
		br := blockreason.For(blockreason.CodeGoalStillRed)
		return &br
	}
	if !hasGoal {
		// No open goal in this run → nothing to close; the completeness half runs.
		return nil
	}
	return goal.CloseBlockReason(g, in)
}
