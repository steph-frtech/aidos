"use server";

import { demoMeter, demoSignal, meterArgs } from "@/lib/cost-meter-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { meterDecoder, signalDecoder } from "./live";
import {
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
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). `meterAction` /
 * `disjoncteurAction` now read the LIVE verdict from the Go cost-meter MCP server through the
 * passerelle (`readVia(scope, "cost_meter_cell" | "cost_disjoncteur_signal", …)`, the dispatched
 * below-the-line reads), with the twin `lib/cost-meter.meterCell()` / `disjoncteurSignal()`
 * preserved ONLY as the deterministic demo fallback (`lib/cost-meter-data`, tagged
 * `source:"live"|"demo"`). The `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits
 * behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallback (the same pure twin compute
 * the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * verdict. THE WALL (§2): the budget is DECLARED (read-only, above the line); the cockpit WRITES
 * NOTHING — both reads are below-the-line.
 */

export async function meterAction(
	_prev: MeterView,
	formData: FormData,
): Promise<MeterView> {
	const includeHeavy = formData.get("heavy") === "on";
	const withValueCase = formData.get("valueCase") === "on";
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched cost-meter `cost_meter_cell` tool); the twin
	// demoMeter() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"cost_meter_cell",
		meterArgs(includeHeavy, withValueCase),
		meterDecoder,
		demoMeter(includeHeavy, withValueCase),
	);
	return {
		...METER_INITIAL,
		ran: true,
		cellMeter: data.cellMeter,
		decision: data.decision,
		source,
	};
}

export async function disjoncteurAction(
	_prev: SignalView,
	formData: FormData,
): Promise<SignalView> {
	const includeHeavy = formData.get("heavy") === "on";
	const withValueCase = formData.get("valueCase") === "on";
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched cost-meter `cost_disjoncteur_signal` tool);
	// the twin demoSignal() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"cost_disjoncteur_signal",
		meterArgs(includeHeavy, withValueCase),
		signalDecoder,
		demoSignal(includeHeavy, withValueCase),
	);
	return { ...SIGNAL_INITIAL, ran: true, signal: data, source };
}
