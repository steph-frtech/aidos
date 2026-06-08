// Package goalpiloting is the AIDOS Runtime engine of S66 — the UI-PILOTED /goal.
// It is the surface a human PORTEUR D'AUTORITÉ (S63) drives from the Workbench to open
// a goal from a grilled idea WITHOUT ever writing the kernel (ROADMAP-app-builder S66,
// KRD §56–§59, §63 ①).
//
// WHAT IT ADDS over S29 (back/runtime/goal). S29 owns the bare, pure goal machinery —
// OpenGoal (DRAFT ChangeSet + derived red set) and IsClosed (the non-gameable stop).
// This package adds the genuinely-product concern S66 demands: a goal can only be
// PILOTED by a REAL acting human carrying authority (S63's RealActor / RequireRealActor),
// never a placeholder, never the agent. The acting human is the first gate; OpenGoal is
// the second; the four-condition stop is the close gate. Each gate DEFERS to its owner —
// nothing here re-implements a transition, a red-set derivation, or a close condition.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING. PilotOpenGoal returns a DRAFT
// ChangeSet PROPOSAL (a value) — the screen proposes it; the aidos CLI role persists it
// via the changeset door (S20) under human approval, never the agent. PilotCloseGoal is
// a pure predicate — it never stamps CLOSED. The screen never reaches the kernel.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE and TOTAL — no clock,
// no rng, no I/O, never panics. The authority gate, the open and the close are all
// deterministic; the LLM never enters. Same input → same output; the reproducibility
// mirror goalpiloting_property_test.go pins it.
//
// FORWARD-DEPENDENCY (documented OpenQuestion, ROADMAP note 3). S63 (authoritybinding) is
// built, so PilotOpenGoal takes a REAL RealActor and the actor-gate is live. The full
// AuthorityGraph admission (role-floor approval over a scope domain) lands at S85's
// approval gate; until then S66 enforces the FIRST authority gate — the actor must be a
// real human (RequireRealActor), never a placeholder/agent. Scope-domain approval is
// annexed for S85, never silently faked here.
package goalpiloting

import (
	"github.com/steph-frtech/aidos/back/runtime/authoritybinding"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// Re-exports so a caller expresses the whole flow in goalpiloting terms while every type
// stays owned by its origin package (aliases — NOT forks; the same structs, the same code).

// Actor is the acting human a goal-open is attributed to (S63). A goal can never be opened
// by nobody: PilotOpenGoal refuses the empty/blank/placeholder actor.
type Actor = authoritybinding.RealActor

// OpenInput is S29's pure input to OpenGoal (the idea, the parent phase, the S22 red-wave
// inputs, the budgets). Reused verbatim.
type OpenInput = goal.OpenInput

// Goal is S29's promotion record (the idea_ref, the DRAFT ChangeSet, the red set, the
// computed status, the budgets). Reused verbatim.
type Goal = goal.Goal

// StopInput is S29's pure input to the non-gameable close predicate (the live sensors, the
// prior-green state, the mutation score + its declared floor, the monster findings).
type StopInput = goal.StopInput

// PilotBlock is the S66 unified, actionable refusal surfaced to the screen. It carries the
// refusal CODE VERBATIM (a string) from whichever gate refused — S63's actor codes
// (PLACEHOLDER_ACTOR / INSUFFICIENT_AUTHORITY, an S63-local BlockCode) or S29's open/close
// codes (IDEA_WITHOUT_MIRROR / NO_RED_SET / GOAL_STILL_RED, a blockreason.Code). Carrying
// the string AVOIDS inventing a member in either CLOSED enum (CLAUDE.md §9): the code is
// copied, never coined. The how_to_fix is carried verbatim so the wall always names the door.
type PilotBlock struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

func (b *PilotBlock) Error() string { return b.Code + ": " + b.Explanation }

// PilotResult is what the screen RECEIVES when an authority-bearing human opens a goal: the
// acting actor (carried for provenance + display) and the OPEN Goal carrying its DRAFT
// ChangeSet proposal + the live red set. It is a VALUE — nothing is persisted. The actor's
// real-actor provenance is what the changeset door (S20) records when the human approves.
type PilotResult struct {
	// Actor is the real acting human the goal-open is attributed to (S63). Carried so the
	// screen can render it and the changeset door can record real-actor provenance.
	Actor Actor `json:"actor"`
	// Goal is the OPEN goal S29 produced: the DRAFT ChangeSet proposal + the live red set.
	Goal Goal `json:"goal"`
}

// PilotOpenGoal is the S66 UI-piloted goal-open. It runs TWO gates in order and DEFERS each
// transition to its owner:
//
//  1. THE ACTOR GATE (S63): the acting human must be a REAL actor (not empty/blank, not a
//     declared placeholder, not "agent"). A placeholder is refused with PLACEHOLDER_ACTOR
//     — a goal-open (a step toward truth) is never attributed to nobody (the wall, §2).
//  2. THE OPEN (S29): OpenGoal opens a DRAFT ChangeSet wrapping the idea's spec_delta +
//     mirror_delta atomically and DERIVES the live red set via S22's Impact. A mirror-less
//     idea is refused (IDEA_WITHOUT_MIRROR); an empty red set is refused (NO_RED_SET).
//
// On success it returns a PilotResult carrying the actor + the OPEN goal (a DRAFT ChangeSet
// PROPOSAL + the live red set). It WRITES NOTHING. PURE: no DB, no clock, no rng.
//
// The returned PilotBlock carries the refusal code verbatim from whichever gate refused —
// the S63 actor refusal or S29's own open refusal — both actionable (code + how_to_fix).
func PilotOpenGoal(actor Actor, in OpenInput) (PilotResult, *PilotBlock) {
	// (1) The actor gate — a real human, never a placeholder, never the agent (S63, the wall).
	if abr := authoritybinding.RequireRealActor(actor); abr != nil {
		b := fromActorBlock(abr)
		return PilotResult{}, &b
	}
	// (2) The open — S29 owns the DRAFT ChangeSet + the live red-set derivation.
	g, gbr := goal.OpenGoal(in)
	if gbr != nil {
		b := fromGoalBlock(gbr)
		return PilotResult{}, &b
	}
	return PilotResult{Actor: actor, Goal: g}, nil
}

// PilotCloseGoal is the S66 UI-piloted close attempt. It DEFERS entirely to S29's
// non-gameable stop (goal.IsClosed): a goal closes iff
//
//	red set → green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster.
//
// It returns the actionable GOAL_STILL_RED refusal while any condition fails (nil when the
// goal IS closeable). It NEVER stamps the goal CLOSED — that truth-write stays the aidos CLI
// role via S20's commit-gate. PURE and TOTAL; takes NO agent-confidence input (there is no
// such field) — "done" is computed, never declared (§8). This is the screen's close gate.
func PilotCloseGoal(g Goal, in StopInput) *PilotBlock {
	gbr := goal.CloseBlockReason(g, in)
	if gbr == nil {
		return nil
	}
	b := fromGoalBlock(gbr)
	return &b
}

// CanClose reports whether the four-condition non-gameable stop holds for a goal — a small
// convenience for the screen's live close indicator. DEFERS to goal.IsClosed. PURE.
func CanClose(g Goal, in StopInput) bool {
	return goal.IsClosed(g, in)
}

// LiveRedSet returns the goal's live red set in stable sorted order — the worklist the panel
// renders (each entry a failing mirror red → green). DEFERS to goal.RedSetSorted. PURE.
func LiveRedSet(g Goal) []string {
	return goal.RedSetSorted(g)
}

// fromActorBlock carries S63's actor refusal verbatim into the S66 PilotBlock — the code
// (PLACEHOLDER_ACTOR / INSUFFICIENT_AUTHORITY) stringified, never coined (CLAUDE.md §9). Pure.
func fromActorBlock(abr *authoritybinding.BlockReason) PilotBlock {
	return PilotBlock{
		Code:        string(abr.Code),
		Severity:    abr.Severity,
		Explanation: abr.Explanation,
		HowToFix:    abr.HowToFix,
	}
}

// fromGoalBlock carries S29's open/close refusal verbatim into the S66 PilotBlock — the code
// (IDEA_WITHOUT_MIRROR / NO_RED_SET / GOAL_STILL_RED) stringified, never coined. Pure.
func fromGoalBlock(gbr *blockreason.BlockReason) PilotBlock {
	return PilotBlock{
		Code:        string(gbr.Code),
		Severity:    string(gbr.Severity),
		Explanation: gbr.Explanation,
		HowToFix:    gbr.HowToFix,
	}
}
