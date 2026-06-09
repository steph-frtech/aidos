/**
 * Per-cell cost meter — the PURE TS twin of back/runtime/costmeter (AIDOS step S111).
 *
 * Determinism-first (CLAUDE.md §6/§8): the metered cost is the exact arithmetic SUM of
 * the runs' RunMeters — a COUNT, never an estimate, never an LLM. `meterCell` aggregates
 * and defers to the AUTHORITATIVE `evaluate` (S51/§66.3). No I/O, no Date.now(), no clock.
 * Same runs → same CellMeter → same EconomicsDecision. Covered by lib/cost-meter.test.ts
 * (the reproducibility mirror, fast-check), law-for-law with the Go costmeter_property_test.
 *
 * The rule (KRD §66.3): a cell over its DECLARED budget WITHOUT a justified ValueCase is
 * FLAGGED — an advisory, never a silent block. « Plus une contrainte coûte cher à
 * maintenir, plus elle doit justifier sa valeur. » The over-budget signal feeds the S83
 * disjoncteur (`disjoncteurSignal`). Cost is CONSUMED, never produced here.
 */

import {
	type BlockReason,
	type EconomicsDecision,
	evaluate,
	type HarnessCostBudget,
	type MeasuredCost,
	type ValueCase,
} from "./economics";

/** The RunMeter (BA11) — the deterministic tally an agent run carried. */
export interface RunMeter {
	tokens: number;
	turns: number;
	ciMinutes: number;
	wallClockSecs: number;
}

/** A real recorded AgentRun (S52) paired with the RunMeter that measured its consumption. */
export interface RunCost {
	/** The run's content-address (AgentRun.ID), so the cost stays bound to the run that burned it. */
	runId: string;
	meter: RunMeter;
}

/** The deterministic aggregate of a cell's metered runs — a COUNT, never an estimate. */
export interface CellMeter {
	cellRef: string;
	runCount: number;
	meter: RunMeter;
	cost: MeasuredCost;
}

/** The S83 disjoncteur (circuit-breaker) over-budget signal projected from a metered verdict. */
export interface BreakerSignal {
	trip: boolean;
	overAxes: string[];
	blockReason: BlockReason | null;
}

/** Clamp a stray negative axis to zero so the aggregate is unconditionally monotone (BA11). */
function nonNeg(x: number): number {
	return x < 0 ? 0 : x;
}

/**
 * aggregateMeter — the pure, total, monotone counting fold over the runs' RunMeters.
 * Every axis of the result is the SUM of that axis across the runs (order-independent:
 * addition is commutative). The empty slice folds to the zero meter.
 */
export function aggregateMeter(runs: RunCost[]): RunMeter {
	return runs.reduce<RunMeter>(
		(acc, rc) => ({
			tokens: acc.tokens + nonNeg(rc.meter.tokens),
			turns: acc.turns + nonNeg(rc.meter.turns),
			ciMinutes: acc.ciMinutes + nonNeg(rc.meter.ciMinutes),
			wallClockSecs: acc.wallClockSecs + nonNeg(rc.meter.wallClockSecs),
		}),
		{ tokens: 0, turns: 0, ciMinutes: 0, wallClockSecs: 0 },
	);
}

/**
 * measuredCostOf — project a (summed) RunMeter onto the MeasuredCost shape `evaluate`
 * consumes, reusing BA27's mapping: tokens → llmTokens, ciMinutes → ciMinutes. The
 * mutation-runtime and human-review axes are NOT produced by an agent run and stay zero
 * (fabricating them would be a monster).
 */
export function measuredCostOf(m: RunMeter): MeasuredCost {
	return {
		llmTokens: m.tokens,
		ciMinutes: m.ciMinutes,
		mutationRuntimeSeconds: 0,
		humanReviewMinutes: 0,
	};
}

/** aggregate — meter a cell from its recorded runs into the CellMeter snapshot. Pure, total. */
export function aggregate(cellRef: string, runs: RunCost[]): CellMeter {
	const meter = aggregateMeter(runs);
	return {
		cellRef,
		runCount: runs.length,
		meter,
		cost: measuredCostOf(meter),
	};
}

/**
 * meterCell — the keystone: meter a cell from its real AgentRuns and feed the COUNTED
 * cost to the authoritative `evaluate` against the DECLARED budget. Returns the CellMeter
 * and the §66.3 EconomicsDecision (advisory verdict). An over-budget cell is FLAGGED,
 * never silently blocked. Writes nothing.
 */
export function meterCell(
	b: HarnessCostBudget,
	runs: RunCost[],
	vc: ValueCase | null,
): { cellMeter: CellMeter; decision: EconomicsDecision } {
	const cellMeter = aggregate(b.cellRef, runs);
	const decision = evaluate(b, cellMeter.cost, vc);
	return { cellMeter, decision };
}

/** overBudget — the single boolean the S83 disjoncteur reads: true ONLY for over_budget_flagged. */
export function overBudget(dec: EconomicsDecision): boolean {
	return dec.verdict === "over_budget_flagged";
}

/**
 * disjoncteurSignal — project the metered verdict onto the S83 circuit-breaker signal.
 * trip == overBudget(dec): a within-budget or justified cell does NOT trip. Carries the
 * over-budget axes and the advisory BlockReason verbatim — never a fabricated trip.
 */
export function disjoncteurSignal(dec: EconomicsDecision): BreakerSignal {
	return {
		trip: overBudget(dec),
		overAxes: dec.overAxes,
		blockReason: dec.blockReason,
	};
}
