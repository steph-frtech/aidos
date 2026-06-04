// economics.go — BA27: the BRIDGE that finally feeds an AgentRun's CONSUMED cost to the
// harness economy (economics.Evaluate, S51/§66.3). Until BA27 the harness economy
// evaluated declared/telemetry costs but NEVER an AgentRun's measured spend — a hole this
// file closes. The two functions are PURE, TOTAL maps over the run's RunMeter (BA11):
//
//   - MeasuredCostOf(meter)        → economics.MeasuredCost   (the axis projection)
//   - EvaluateRun(meter, budget, vc) → economics.EconomicsDecision  (the §66.3 verdict)
//
// COST IS CONSUMED, NEVER PRODUCED (the S51 discipline). The meter is the tally the loop
// (DriveWithEconomics) carried; this file PRODUCES no cost — it RECEIVES the meter and maps
// it onto the economics axes. The token tally maps to llm_tokens (the harness-economy axis
// an agent run spends on) and the ci-minutes tally to ci_minutes. The turns and wall-clock
// axes have NO harness-economy counterpart in S51's HarnessCostBudget (they are governed by
// the BA11 budget gate, not the §66.3 economy), so they are deliberately NOT mapped — a
// fabricated axis would be a monster (the honesty rule).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Both functions are pure arithmetic over their input —
// no DB, no clock, no rng, no I/O, NO LLM. economics.Evaluate is the AUTHORITATIVE verdict
// (declared caps, switch); this file only maps the meter into its input shape. Same input ⇒
// same output (the reproducibility property mirror pins it).
//
// THE WALL (CLAUDE.md §2/§8). EvaluateRun WRITES NOTHING: economics.Evaluate is a read-only
// diagnostic over the DECLARED, above-the-line HarnessCostBudget (the agent is SELECT-only
// on fitness). A flagged run is an advisory; raising a cap is a /goal, never an edit.
package agentloop

import (
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// MeasuredCostOf projects a run's RunMeter onto the economics.MeasuredCost shape S51's
// Evaluate consumes. The token tally → llm_tokens and the ci-minutes tally → ci_minutes
// (the two axes an AgentRun spends on that the harness economy budgets). MutationRuntime
// and HumanReviewMinutes are NOT produced by an agent run — they stay zero (an agent run
// neither runs the S40 mutation suite nor consumes human-review minutes; fabricating them
// would be a monster). The Turns / WallClock meter axes are governed by the BA11 budget
// gate, not the §66.3 economy, so they are intentionally not mapped here. Pure, total.
func MeasuredCostOf(m agentimpl.RunMeter) economics.MeasuredCost {
	return economics.MeasuredCost{
		LLMTokens: m.Tokens,
		CIMinutes: m.CIMinutes,
	}
}

// EvaluateRun feeds a terminated run's measured cost to the harness economy: it maps the
// meter via MeasuredCostOf and defers to economics.Evaluate — the AUTHORITATIVE §66.3
// verdict over the DECLARED HarnessCostBudget. vc is the optional ValueCase that can clear
// an over-budget flag (nil = none). It is a thin, pure convenience so the loop/panel feeds
// the run in one call; it adds NO judgment of its own (the economics evaluator owns the
// verdict — determinism-first). Writes nothing.
func EvaluateRun(m agentimpl.RunMeter, b economics.HarnessCostBudget, vc *economics.ValueCase) economics.EconomicsDecision {
	return economics.Evaluate(b, MeasuredCostOf(m), vc)
}
