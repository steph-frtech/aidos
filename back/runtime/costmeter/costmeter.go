// Package costmeter is the AIDOS Runtime per-cell COST METER (step S111). It closes the
// last hole in the §66.3 harness economy: the HarnessCostBudget / ValueCase machinery of
// S51 evaluates a MeasuredCost, and BA27 (agentloop/economics.go) maps ONE run's RunMeter
// onto that cost — but nothing AGGREGATES the consumption of the MANY real AgentRuns a cell
// actually burns across its goals. This package is that aggregation: it METERS a cell from
// its recorded AgentRuns and feeds the resulting cost to economics.Evaluate (the advisory)
// and to the S83 disjoncteur (the circuit-breaker over-budget signal).
//
// THE RULE (KRD §66.3, the S111 done-criterion). « Plus une contrainte coûte cher à
// maintenir, plus elle doit justifier sa valeur. » A goal/cell over its declared budget is
// FLAGGED — an advisory, NEVER a silent block (the property mirror pins it). A costly cell
// that carries a ValueCase{decision: justified} has earned its keep. The flag never blocks
// in passing; it advises, exactly like S41 KernelDebt.
//
// MÉTRAGE = COMPTAGE DÉTERMINISTE, JAMAIS UNE ESTIMATION (the S111 determinism mandate).
// The cost is COUNTED from the real RunMeter of each recorded AgentRun, never estimated and
// never an LLM judgment. AggregateMeter is a pure monotone fold (sum) over the runs' meters;
// MeterCell maps the aggregate onto the S51 cost axes and defers to economics.Evaluate (the
// AUTHORITATIVE verdict). Same runs ⇒ same cost ⇒ same verdict (the reproducibility mirror
// pins it). There is NO clock, NO rng, NO I/O, NO LLM anywhere in this package.
//
// COST IS CONSUMED, NEVER PRODUCED (the S51 discipline). This package PRODUCES no cost — it
// RECEIVES the per-run RunMeter (BA11, the tally the loop carried) paired with its AgentRun
// and SUMS it. A run is paired with its meter via RunCost; an unmatched run contributes a
// zero meter (it consumed nothing this package can see — fabricating a cost would be a
// monster, the honesty rule). Only the token and ci-minutes axes have a §66.3 counterpart
// (per BA27); mutation-runtime and human-review minutes are NOT produced by an agent run and
// stay zero (fabricating them would be a monster).
//
// THE WALL (CLAUDE.md §2/§8). This package WRITES NOTHING. economics.Evaluate is a read-only
// diagnostic over the DECLARED, above-the-line HarnessCostBudget (the agent is SELECT-only on
// the fitness zone); a flagged cell is an advisory; raising a cap is a /goal, never an edit
// here. The AgentRun records it reads are append-only telemetry BELOW the line (S52).
package costmeter

import (
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// RunCost pairs a recorded AgentRun (S52, the WHAT-happened) with the RunMeter (BA11) that
// measured its CONSUMPTION. The meter is the deterministic tally the agent loop carried; this
// package never produces it. Pairing them keeps the cost CONTENT-ADDRESSED to the run that
// burned it (Run.ID), so the meter can never silently drift from the run.
type RunCost struct {
	Run   agentrun.AgentRun  `json:"run"`
	Meter agentimpl.RunMeter `json:"meter"`
}

// CellMeter is the deterministic AGGREGATE of a cell's metered runs: the cell it was metered
// for, how many runs contributed, the summed RunMeter, and the projected MeasuredCost the
// §66.3 economy consumes. It is a faithful, drift-free projection of the runs — a COUNT, never
// an estimate. Below the line: a metering snapshot, not a layer/truth (no version, no mirror).
type CellMeter struct {
	CellRef  string                 `json:"cell_ref"`
	RunCount int                    `json:"run_count"`
	Meter    agentimpl.RunMeter     `json:"meter"`
	Cost     economics.MeasuredCost `json:"cost"`
}

// AggregateMeter folds the RunMeters of a sequence of metered runs into one summed RunMeter.
// It is a PURE, TOTAL, MONOTONE counting fold: every axis of the result is the SUM of that
// axis across the runs, so adding a run never decreases any axis (the meter is monotone, BA11).
// No clock, no rng, no I/O, no LLM. Same runs ⇒ same meter (the reproducibility mirror pins
// it); the empty slice folds to the zero meter (a cell that ran nothing consumed nothing — no
// fabricated cost). Order does NOT matter: integer addition is commutative and associative, so
// permuting the runs yields the identical meter (the order-independence property pins it).
func AggregateMeter(runs []RunCost) agentimpl.RunMeter {
	var total agentimpl.RunMeter
	for _, rc := range runs {
		total = agentimpl.RunMeter{
			Tokens:        total.Tokens + nonNeg(rc.Meter.Tokens),
			Turns:         total.Turns + nonNeg(rc.Meter.Turns),
			CIMinutes:     total.CIMinutes + nonNeg(rc.Meter.CIMinutes),
			WallClockSecs: total.WallClockSecs + nonNeg(rc.Meter.WallClockSecs),
		}
	}
	return total
}

// nonNeg clamps a stray negative meter axis to zero so the aggregate is unconditionally
// monotone (a negative axis would be a producer bug; the meter never decreases). This mirrors
// agentimpl.RunMeter's own clamp discipline (BA11) at the aggregation boundary.
func nonNeg(x int) int {
	if x < 0 {
		return 0
	}
	return x
}

// MeasuredCostOf projects a (summed) RunMeter onto the economics.MeasuredCost shape S51's
// Evaluate consumes — REUSING BA27's exact mapping discipline: the token tally → llm_tokens
// and the ci-minutes tally → ci_minutes (the two §66.3 axes an agent run spends on).
// MutationRuntime and HumanReviewMinutes are NOT produced by agent runs and stay zero (an
// agent run neither runs the S40 mutation suite nor consumes human-review minutes; fabricating
// them would be a monster). The Turns / WallClock axes are governed by the BA11 budget gate,
// not the §66.3 economy, so they are intentionally not mapped here. Pure, total.
func MeasuredCostOf(m agentimpl.RunMeter) economics.MeasuredCost {
	return economics.MeasuredCost{
		LLMTokens: m.Tokens,
		CIMinutes: m.CIMinutes,
	}
}

// Aggregate meters a cell from its recorded runs and returns the CellMeter snapshot: the
// summed meter and the projected MeasuredCost. PURE, TOTAL, DETERMINISTIC — a COUNT over the
// real RunMeters, never an estimate (the S111 determinism mandate). Same (cellRef, runs) ⇒
// same CellMeter. It writes nothing.
func Aggregate(cellRef string, runs []RunCost) CellMeter {
	meter := AggregateMeter(runs)
	return CellMeter{
		CellRef:  cellRef,
		RunCount: len(runs),
		Meter:    meter,
		Cost:     MeasuredCostOf(meter),
	}
}

// MeterCell is the keystone of S111: it METERS a cell from its real AgentRuns and feeds the
// aggregated, COUNTED cost to economics.Evaluate against the cell's DECLARED HarnessCostBudget
// — returning both the CellMeter snapshot (for the panel/telemetry) and the §66.3
// EconomicsDecision (the AUTHORITATIVE advisory verdict). The optional ValueCase can clear an
// over-budget flag (nil = none). The cost is COUNTED from the runs' meters (never estimated);
// economics.Evaluate owns the verdict (determinism-first — this function adds no judgment of
// its own). An over-budget cell is FLAGGED (advisory), NEVER silently blocked (the property
// mirror pins it). The cell_ref the runs are metered under is the BUDGET's cell_ref, so the
// meter is always evaluated against the right cap. PURE, TOTAL — no clock, no I/O, no LLM.
// Writes nothing (the wall).
func MeterCell(b economics.HarnessCostBudget, runs []RunCost, vc *economics.ValueCase) (CellMeter, economics.EconomicsDecision) {
	cm := Aggregate(b.CellRef, runs)
	dec := economics.Evaluate(b, cm.Cost, vc)
	return cm, dec
}

// OverBudget reports whether an EconomicsDecision is the FLAGGED over-budget verdict — the
// single boolean signal the S83 disjoncteur (the build-loop circuit-breaker) reads to decide
// whether the metered cell is over its declared cap WITHOUT a justified ValueCase. It is true
// ONLY for VerdictOverBudgetFlagged: a within-budget cell and an over_budget_JUSTIFIED cell
// (earned its keep) both return false — the breaker never trips on a justified cost. This is
// the exact predicate buildloop.Terminate already uses (econ.Verdict == OverBudgetFlagged),
// surfaced here as the named S111→S83 wire. Pure, total.
func OverBudget(dec economics.EconomicsDecision) bool {
	return dec.Verdict == economics.VerdictOverBudgetFlagged
}

// BreakerSignal is the deterministic over-budget signal the S83 disjoncteur consumes from a
// metered cell: whether the breaker should trip on cost, the over-budget axes that triggered
// it (named in the ubiquitous language, empty when not over), and the advisory BlockReason
// (nil unless flagged). It is a faithful projection of the EconomicsDecision — never a new
// judgment. Below the line: a signal, not a layer.
type BreakerSignal struct {
	Trip        bool                     `json:"trip"`
	OverAxes    []string                 `json:"over_axes,omitempty"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// DisjoncteurSignal projects a metered EconomicsDecision onto the BreakerSignal the S83
// disjoncteur reads — Trip == OverBudget(dec), carrying the over-budget axes and the advisory
// BlockReason verbatim from the decision. It NEVER fabricates a block: a within-budget or
// justified decision yields Trip=false with no BlockReason. PURE, TOTAL — same decision ⇒ same
// signal. This is the named S111→S83 contract: the meter feeds a deterministic cost signal to
// the circuit-breaker, which composes it (OR no-progress) exactly as buildloop.Terminate does.
func DisjoncteurSignal(dec economics.EconomicsDecision) BreakerSignal {
	return BreakerSignal{
		Trip:        OverBudget(dec),
		OverAxes:    dec.OverAxes,
		BlockReason: dec.BlockReason,
	}
}
