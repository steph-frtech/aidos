/**
 * cost-meter-data — the DETERMINISTIC demo fixtures for the /cost-meter cockpit (S111; the ADR
 * 0092 batch-2 flip). It holds the canonical checkout cell's REAL recorded AgentRuns (S52, each
 * with its RunMeter), a justified ValueCase, the gateway-arg projections, and the twin
 * `meterCell()` / `disjoncteurSignal()` compute of them — the demo `{cellMeter,decision}` /
 * `{signal}` the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /cost-meter computed
 * its displayed verdict from the TS twin `lib/cost-meter.meterCell()` directly in actions.ts — the
 * twin WAS the live source. The flip routes `meterAction` / `disjoncteurAction` through the Go
 * engine via the passerelle (`readVia(scope, "cost_meter_cell" | "cost_disjoncteur_signal", …)`,
 * the dispatched below-the-line read of the cost-meter MCP server); these fixtures are KEPT only as
 * the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what makes the T5
 * cliquet (twin-as-live-fitness) RECOGNISE `lib/cost-meter` as a twin — the panel stays GREEN
 * because `actions.ts` imports the `readVia` frontier (the witness the twin sits behind
 * `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdict is the same PURE twin compute the Go
 * `costmeter.MeterCell` reproduces — same runs + budget → byte-identical verdict. The parity mirror
 * app/cost-meter/live.test.ts pins the decoders' shape == the Go meterOut / signalOut contract.
 *
 * THE WALL (CLAUDE.md §2): the budget is DECLARED (read-only, above the line); these fixtures and
 * the panel WRITE NOTHING.
 */

import {
	type BreakerSignal,
	type CellMeter,
	disjoncteurSignal,
	meterCell,
	type RunCost,
} from "./cost-meter";
import type {
	EconomicsDecision,
	HarnessCostBudget,
	ValueCase,
} from "./economics";

/**
 * The cell's REAL recorded AgentRuns (S52), each carrying its consumed RunMeter. The within-set
 * sums to 38000 tokens / 6 CI minutes (inside the cap); the heavy run tips it to 78000 (over).
 * These are the args the panel sends to the gateway `cost_meter_cell` tool (mapped via
 * gatewayRunArgs) AND the input to the demo verdict.
 */
export const WITHIN_RUNS: RunCost[] = [
	{
		runId: "run-discount",
		meter: { tokens: 12000, turns: 1, ciMinutes: 2, wallClockSecs: 300 },
	},
	{
		runId: "run-tax",
		meter: { tokens: 18000, turns: 1, ciMinutes: 3, wallClockSecs: 300 },
	},
	{
		runId: "run-total",
		meter: { tokens: 8000, turns: 1, ciMinutes: 1, wallClockSecs: 300 },
	},
];

export const HEAVY_RUN: RunCost = {
	runId: "run-heavy",
	meter: { tokens: 40000, turns: 1, ciMinutes: 2, wallClockSecs: 300 },
};

/** The justified ValueCase that clears the over-budget advisory flag (KRD §66.3). */
export const JUSTIFIED_VC: ValueCase = {
	truth: "checkout.invariant",
	riskIfBroken: "critical",
	expectedImpact:
		"le checkout protège chaque commande — un faux total facture mal le client",
	harnessCost: {},
	decision: "justified",
};

/** The DECLARED checkout budget the cockpit meters against (read-only, above the line). */
export const CHECKOUT_BUDGET: HarnessCostBudget = {
	cellRef: "checkout",
	maxCiMinutes: 10,
	maxLlmTokensPerGoal: 50000,
	maxMutationRuntimeSeconds: 300,
	maxHumanReviewMinutes: 30,
	expectedRiskReduction: "high",
};

/** runsFor — the cell's runs, optionally including the heavy run that tips it over budget. */
export function runsFor(includeHeavy: boolean): RunCost[] {
	return includeHeavy ? [...WITHIN_RUNS, HEAVY_RUN] : WITHIN_RUNS;
}

/**
 * gatewayRunArgs maps a front RunCost[] to the Go `cost_meter_cell` `runs` arg shape: each run is
 * a `{ red_work_item, tokens, ci_minutes }` object (the meterInput.runs contract — runCostIn,
 * snake_case). PURE — a deterministic projection, never an LLM. The Go server content-addresses
 * the run from `red_work_item` and counts `tokens`/`ci_minutes` (the COUNTED sum, never an
 * estimate). Each run is a scalar object — no json.RawMessage body, the S59 transport scar avoided.
 */
export function gatewayRunArgs(runs: RunCost[]): Record<string, unknown>[] {
	return runs.map((r) => ({
		red_work_item: r.runId,
		tokens: r.meter.tokens,
		ci_minutes: r.meter.ciMinutes,
	}));
}

/**
 * gatewayBudgetArgs maps the DECLARED HarnessCostBudget to the Go `budget` arg shape (budgetIn,
 * snake_case). PURE projection. The mutation-runtime + human-review caps are carried verbatim; the
 * Go meterOut only counts tokens + ci_minutes (an agent run produces neither of the other two).
 */
export function gatewayBudgetArgs(
	b: HarnessCostBudget,
): Record<string, unknown> {
	return {
		cell_ref: b.cellRef,
		max_ci_minutes: b.maxCiMinutes,
		max_llm_tokens_per_goal: b.maxLlmTokensPerGoal,
		max_mutation_runtime_seconds: b.maxMutationRuntimeSeconds,
		max_human_review_minutes: b.maxHumanReviewMinutes,
		expected_risk_reduction: b.expectedRiskReduction,
	};
}

/** gatewayValueCaseArgs maps the justified ValueCase to the Go `value_case` arg shape (valueCaseIn). */
export function gatewayValueCaseArgs(vc: ValueCase): Record<string, unknown> {
	return {
		truth: vc.truth,
		risk_if_broken: vc.riskIfBroken,
		expected_impact: vc.expectedImpact,
		decision: vc.decision,
	};
}

/**
 * meterArgs — the full `cost_meter_cell` / `cost_disjoncteur_signal` argument object: the declared
 * budget, the cell's runs, and (optionally) the justified value case. The Go meterInput shape.
 */
export function meterArgs(
	includeHeavy: boolean,
	withValueCase: boolean,
): Record<string, unknown> {
	const args: Record<string, unknown> = {
		budget: gatewayBudgetArgs(CHECKOUT_BUDGET),
		runs: gatewayRunArgs(runsFor(includeHeavy)),
	};
	if (withValueCase) args.value_case = gatewayValueCaseArgs(JUSTIFIED_VC);
	return args;
}

/**
 * demoMeter is the deterministic demo metered result — the twin `meterCell()` of the cell's runs
 * against the declared budget (optionally with the heavy run / the justified ValueCase). It is the
 * `{ cellMeter, decision }` pair the panel falls back to, identical in shape to the live decoded
 * read (the twin sits behind `source:"demo"`).
 */
export function demoMeter(
	includeHeavy: boolean,
	withValueCase: boolean,
): { cellMeter: CellMeter; decision: EconomicsDecision } {
	return meterCell(
		CHECKOUT_BUDGET,
		runsFor(includeHeavy),
		withValueCase ? JUSTIFIED_VC : null,
	);
}

/**
 * demoSignal is the deterministic demo disjoncteur signal — the twin `disjoncteurSignal()` of the
 * metered verdict. Identical in shape to the live decoded `cost_disjoncteur_signal` read.
 */
export function demoSignal(
	includeHeavy: boolean,
	withValueCase: boolean,
): BreakerSignal {
	const { decision } = demoMeter(includeHeavy, withValueCase);
	return disjoncteurSignal(decision);
}
