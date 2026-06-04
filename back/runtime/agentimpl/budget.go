// budget.go — the per-run COST COUNTER + BUDGET GATE of a governed build-agent (BA11).
// A RunMeter is a monotone tally of the consumed run cost (tokens / turns / ci-minutes /
// wall-clock, in deltas). CheckBudget is the PURE, TOTAL gate that decides whether a run
// is within its declared budget — and its central rule is the DOUBLE-BUDGET
// RECONCILIATION (gap G1): tokens is declared in BOTH goal.Budgets.Tokens (S29, the
// secondary anti-runaway guard) AND economics.HarnessCostBudget.MaxLLMTokensPerGoal
// (S51, the harness economy cap). The effective per-shared-axis cap is the MINIMUM of
// the two — the tightest cap wins, fail-closed. Raising one declaration alone does not
// loosen the gate while the other stays tight.
//
// COST IS CONSUMED, NEVER PRODUCED (the S51 discipline). The meter is fed deltas by the
// loop (BA27 wires Tally into Drive); budget.go itself produces no cost. It RECEIVES a
// meter and compares it to the declared caps.
//
// COST-AWARE (gap, the cross-agent comparable unit). CostAware projects the token tally
// onto a money/credit unit via the DECLARED model rate (tokens × rate) — a unit
// comparable across the agents of an équipe. The rate is data, declared above the line;
// budget.go never invents or learns it.
//
// WALL-CLOCK DEADLINE (gap G2). A hung agent burns wall-clock time without burning
// tokens, so the gate carries a wall-clock axis: a run that exceeds the declared
// deadline (goal.Budgets.TimeSeconds) breaches even at zero tokens.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). RunMeter.Tally, CostAware and CheckBudget are
// PURE, TOTAL functions of their input — no DB, no clock, no rng, no I/O, NO live LLM.
// The min() over the shared axes is arithmetic; the verdict is a per-axis comparison;
// the BreachedAxis selection is a fixed precedence; the BlockReason is the S13 canonical
// shape. Same input ⇒ same verdict — the min() gate is AUTHORITATIVE (an agent deciding
// "am I within budget?" by inference would be a determinism gap). The reproducibility +
// boundary mirror budget_property_test.go pins it.
//
// THE WALL (CLAUDE.md §2/§8). The caps are DECLARED, never authored here: HarnessCostBudget
// lives in the read-only `fitness` zone (S51), goal.Budgets in the goal body (S29). This
// package READS them and NEVER raises a bar it is measured against. Raising a cap is a
// /goal, never an edit here. CheckBudget writes nothing.
package agentimpl

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// RunDelta is one increment of consumed run cost, fed to RunMeter.Tally as the loop
// (BA27) makes progress: the tokens spent, the turns taken, the CI-minutes burned and
// the wall-clock seconds elapsed since the previous tally. Every field is a NON-NEGATIVE
// delta (the meter only grows — the monotone property pins this; Tally clamps a stray
// negative to zero so the meter can never decrease).
type RunDelta struct {
	Tokens        int `json:"tokens"`
	Turns         int `json:"turns"`
	CIMinutes     int `json:"ci_minutes"`
	WallClockSecs int `json:"wall_clock_secs"`
}

// RunMeter is the MONOTONE tally of a run's consumed cost across the budgeted axes. It
// is the accumulator the loop carries; Tally returns a NEW meter (value semantics, no
// mutation) so the tally is a pure fold. The zero RunMeter is a fresh run (all axes 0).
type RunMeter struct {
	Tokens        int `json:"tokens"`
	Turns         int `json:"turns"`
	CIMinutes     int `json:"ci_minutes"`
	WallClockSecs int `json:"wall_clock_secs"`
}

// nonNeg clamps a stray negative delta to zero so the meter is unconditionally monotone
// (a negative delta would be a producer bug; the meter refuses to decrease).
func nonNeg(x int) int {
	if x < 0 {
		return 0
	}
	return x
}

// Tally folds a delta into the meter and returns the NEW meter. It is pure and monotone:
// every axis of the result is ≥ the corresponding axis of the receiver (negatives are
// clamped to zero). No clock, no I/O — the loop supplies the deltas.
func (m RunMeter) Tally(d RunDelta) RunMeter {
	return RunMeter{
		Tokens:        m.Tokens + nonNeg(d.Tokens),
		Turns:         m.Turns + nonNeg(d.Turns),
		CIMinutes:     m.CIMinutes + nonNeg(d.CIMinutes),
		WallClockSecs: m.WallClockSecs + nonNeg(d.WallClockSecs),
	}
}

// CostAware projects the token tally onto a comparable money/credit unit via the
// DECLARED per-token rate: cost = tokens × rate. It is monotone non-decreasing in tokens
// (the property pins this) and pure — the rate is data, never invented here. This is the
// unit comparable across the agents of an équipe (cheaper model, more tokens vs dearer
// model, fewer tokens).
func CostAware(m RunMeter, ratePerToken float64) float64 {
	return float64(m.Tokens) * ratePerToken
}

// BudgetVerdict is CheckBudget's typed result: WithinBudget (true IFF the measured cost
// is ≤ the effective cap on EVERY axis), the BreachedAxis (the first axis over, in a
// fixed precedence — empty when within budget), the CostAware comparable unit for the
// token tally, and the S13 BlockReason on a breach (nil when within budget). It carries
// the cell_ref the check was taken against, for provenance.
type BudgetVerdict struct {
	WithinBudget bool                     `json:"within_budget"`
	BreachedAxis string                   `json:"breached_axis,omitempty"`
	CostAware    float64                  `json:"cost_aware"`
	CellRef      string                   `json:"cell_ref,omitempty"`
	BlockReason  *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// minInt is the arithmetic core of the double-budget reconciliation (gap G1): the
// effective cap on a SHARED axis is the minimum of the two declarations — the tightest
// wins, fail-closed.
func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// EffectiveTokensCap is the reconciled tokens cap: min(goal.Budgets.Tokens (S29),
// economics.HarnessCostBudget.MaxLLMTokensPerGoal (S51)). EXPORTED so the SemanticDiff
// suggested in the roadmap (eventually deduplicate to one owner per axis) can be checked
// against the live behaviour, and so the loop (BA27) and the panel can pre-compute the
// authoritative cap. The min() is the AUTHORITATIVE rule (§8).
func EffectiveTokensCap(h economics.HarnessCostBudget, b goal.Budgets) int {
	return minInt(b.Tokens, h.MaxLLMTokensPerGoal)
}

// CheckBudget is the PURE, TOTAL budget gate of BA11. Given the consumed RunMeter, the
// two declared budgets (S51 HarnessCostBudget ∧ S29 Budgets) and the declared per-token
// rate, it decides whether the run is within budget on EVERY axis. The effective per-
// shared-axis cap is the MIN of the two declarations (tokens is the shared axis — the
// tightest cap wins, fail-closed); the single-source axes use their one declared cap
// (turns from S29, ci-minutes from S51, wall-clock from S29.TimeSeconds). A cost EXACTLY
// EQUAL to the cap is within budget (the cap is the inclusive ceiling); cap+1 breaches
// (the boundary the property pins).
//
// Over on ANY axis is over budget (per-axis OR — fail-closed). The BreachedAxis is the
// FIRST axis over in a fixed precedence (tokens → turns → ci_minutes → wall_clock), so
// the verdict is deterministic. A breach carries the S13 BlockReason AGENT_BUDGET_EXCEEDED
// (the canonical actionable form naming the /goal door). Same input ⇒ same verdict; no
// DB, no clock, no rng, no I/O, no LLM.
func CheckBudget(m RunMeter, h economics.HarnessCostBudget, b goal.Budgets, ratePerToken float64) BudgetVerdict {
	cost := CostAware(m, ratePerToken)
	effTokens := EffectiveTokensCap(h, b)

	// Per-axis comparison, in a fixed precedence so BreachedAxis is deterministic.
	// tokens — the SHARED axis, capped by min(S29, S51) (the tightest wins).
	axis := ""
	switch {
	case m.Tokens > effTokens:
		axis = "tokens"
	case m.Turns > b.Turns:
		axis = "turns"
	case m.CIMinutes > h.MaxCIMinutes:
		axis = "ci_minutes"
	case m.WallClockSecs > b.TimeSeconds:
		axis = "wall_clock"
	}

	if axis == "" {
		return BudgetVerdict{WithinBudget: true, CostAware: cost, CellRef: h.CellRef}
	}
	br := budgetExceeded(h.CellRef, axis, m, effTokens, h, b)
	return BudgetVerdict{
		WithinBudget: false,
		BreachedAxis: axis,
		CostAware:    cost,
		CellRef:      h.CellRef,
		BlockReason:  &br,
	}
}

// budgetExceeded builds the canonical AGENT_BUDGET_EXCEEDED BlockReason (the S13 shape,
// KRD §44.5 — every refusal names the door out). It reuses the closed registry's
// canonical reason (blockreason.For) and SPECIALISES the explanation with the concrete
// breached axis + the effective cap, so the advisory is never a fabricated target (the
// honesty rule). The how_to_fix path is preserved from the registry (it names the /goal
// door and the tightest-cap-wins rule).
func budgetExceeded(cellRef, axis string, m RunMeter, effTokens int, h economics.HarnessCostBudget, b goal.Budgets) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeAgentBudgetExceeded)
	var measured, capVal int
	switch axis {
	case "tokens":
		measured, capVal = m.Tokens, effTokens
	case "turns":
		measured, capVal = m.Turns, b.Turns
	case "ci_minutes":
		measured, capVal = m.CIMinutes, h.MaxCIMinutes
	case "wall_clock":
		measured, capVal = m.WallClockSecs, b.TimeSeconds
	}
	br.Explanation = fmt.Sprintf(
		"%s — axe dépassé %q : coût mesuré %d > cap effectif %d pour la cellule %q.",
		br.Explanation, axis, measured, capVal, cellRef,
	)
	return br
}
