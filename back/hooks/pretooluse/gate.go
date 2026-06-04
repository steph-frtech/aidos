// gate.go — BA13: the S04 PreToolUse hook gates a GOVERNED AgentImplementation's tool
// calls through the SINGLE composed verdict agentimpl.GateAction, not only the bare
// zone classifier (Classify). When the hook event carries a governed agent identity
// (the LayerRef of an AgentImplementation), the hook consults ALL declared axes — zone,
// path, egress/exec, capacity, skill, budget, hook, determinism — in one precedence-
// ordered verdict, so the interceptor refuses the SAME way the loop would.
//
// SINGLE-SOURCED. The composition lives ONCE in agentimpl.GateAction (BA13); this file
// only ADAPTS a PreToolUse Event into an agentimpl.Action and forwards it. The hook's
// existing bare-zone behaviour (EvaluateGoverned with no impl) is unchanged — a non-
// agent write still goes through Classify (the regression mirrors pass UNCHANGED,
// anti-overwrite §9).
//
// THE WALL (CLAUDE.md §2): the hook is level-1 defense-in-depth and WRITES NOTHING. A
// governed agent's tool call is gated before it runs; a refusal carries the actionable
// BlockReason naming the door.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): EvaluateGoverned is a pure total adapter over the
// (already pure) GateAction — no clock, no rng, no I/O. Same event ⇒ same verdict.
package main

import (
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// GovernedEvent is a PreToolUse event PLUS the governed-agent context the composed gate
// needs: the resolved AgentImplementation whose declared axes constrain this call, the
// per-run meter + the two declared budgets + the per-token rate (BA11), and the per-hook
// binary verdicts (BA10). It carries the structural Action the determinism arbiter reads.
type GovernedEvent struct {
	Impl         agentimpl.AgentImplementation
	Action       agentimpl.Action
	Meter        agentimpl.RunMeter
	Harness      economics.HarnessCostBudget
	GoalBudgets  goal.Budgets
	RatePerToken float64
	HookVerdicts []agentimpl.HookVerdict
}

// EvaluateGoverned is the BA13 hook decision over a GOVERNED agent's tool call: it
// forwards the whole event to agentimpl.GateAction (the single composed verdict, in
// precedence order) and returns the resulting Decision. The hook calls this when an
// event carries a governed agent identity; a plain write still uses Evaluate/Classify.
// Pure, total — it composes nothing itself, it only delegates to the single gate.
func EvaluateGoverned(ev GovernedEvent) agentimpl.Decision {
	return agentimpl.GateAction(
		ev.Impl, ev.Action, ev.Meter, ev.Harness, ev.GoalBudgets, ev.RatePerToken, ev.HookVerdicts,
	)
}
