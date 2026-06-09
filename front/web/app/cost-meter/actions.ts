"use server";

import { disjoncteurSignal, meterCell, type RunCost } from "@/lib/cost-meter";
import type { ValueCase } from "@/lib/economics";
import {
	CHECKOUT_BUDGET,
	METER_INITIAL,
	type MeterView,
	SIGNAL_INITIAL,
	type SignalView,
} from "./view";

/**
 * Server Actions for the /cost-meter cockpit (S111 — per-cell HarnessCostBudget + ValueCase
 * wired to real AgentRun counters).
 *
 * THE STEP: each cell DECLARES its budget; the meter AGGREGATES the consumption of the cell's
 * real recorded AgentRuns (a COUNT, never an estimate) and feeds it to economics.Evaluate.
 * A costly cell WITHOUT a justified ValueCase is FLAGGED (advisory), never silently blocked;
 * the over-budget signal feeds the S83 disjoncteur.
 *
 * Two controls (both run the PURE twin lib/cost-meter — same input → identical verdict, never
 * an LLM; THE WALL §2: the cockpit WRITES NOTHING — the budget is DECLARED, read-only):
 *   - meterAction: meter the cell from its real runs (optionally with a justified ValueCase).
 *   - disjoncteurAction: project the metered verdict onto the S83 circuit-breaker signal.
 */

// The cell's REAL recorded AgentRuns (S52), each carrying its consumed RunMeter. The within-set
// sums to 38000 tokens / 6 CI minutes (inside the cap); the heavy run tips it to 78000 (over).
const WITHIN_RUNS: RunCost[] = [
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
const HEAVY_RUN: RunCost = {
	runId: "run-heavy",
	meter: { tokens: 40000, turns: 1, ciMinutes: 2, wallClockSecs: 300 },
};

const JUSTIFIED_VC: ValueCase = {
	truth: "checkout.invariant",
	riskIfBroken: "critical",
	expectedImpact:
		"le checkout protège chaque commande — un faux total facture mal le client",
	harnessCost: {},
	decision: "justified",
};

function runsFor(includeHeavy: boolean): RunCost[] {
	return includeHeavy ? [...WITHIN_RUNS, HEAVY_RUN] : WITHIN_RUNS;
}

export async function meterAction(
	_prev: MeterView,
	formData: FormData,
): Promise<MeterView> {
	const includeHeavy = formData.get("heavy") === "on";
	const withValueCase = formData.get("valueCase") === "on";
	const { cellMeter, decision } = meterCell(
		CHECKOUT_BUDGET,
		runsFor(includeHeavy),
		withValueCase ? JUSTIFIED_VC : null,
	);
	return { ...METER_INITIAL, ran: true, cellMeter, decision };
}

export async function disjoncteurAction(
	_prev: SignalView,
	formData: FormData,
): Promise<SignalView> {
	const includeHeavy = formData.get("heavy") === "on";
	const withValueCase = formData.get("valueCase") === "on";
	const { decision } = meterCell(
		CHECKOUT_BUDGET,
		runsFor(includeHeavy),
		withValueCase ? JUSTIFIED_VC : null,
	);
	return { ...SIGNAL_INITIAL, ran: true, signal: disjoncteurSignal(decision) };
}
