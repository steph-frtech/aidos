import type { BreakerSignal, CellMeter } from "@/lib/cost-meter";
import { CHECKOUT_BUDGET } from "@/lib/cost-meter-data";
import type { EconomicsDecision } from "@/lib/economics";
import type { Source } from "@/lib/gateway-sdk";

/**
 * The DECLARED checkout budget the panel meters against (read-only, above the line). It now lives
 * in lib/cost-meter-data (the demo-fallback fixtures) — the single declaration shared by the demo
 * compute and the gateway-arg projection; re-exported here so the panel's existing import is
 * unchanged.
 */
export { CHECKOUT_BUDGET };

/**
 * MeterView — the result of metering the cell from its real AgentRuns (controls 1 + 2). `source`
 * tags whether the verdict came from the live Go engine (the dispatched cost_meter_cell read) or
 * the deterministic demo fallback (ADR 0092 flip).
 */
export interface MeterView {
	ran: boolean;
	cellMeter?: CellMeter;
	decision?: EconomicsDecision;
	noTruthWrite: boolean;
	source?: Source;
}

export const METER_INITIAL: MeterView = { ran: false, noTruthWrite: true };

/**
 * SignalView — the projected S83 disjoncteur signal (control 3). `source` tags live (the dispatched
 * cost_disjoncteur_signal read) vs the demo fallback.
 */
export interface SignalView {
	ran: boolean;
	signal?: BreakerSignal;
	noTruthWrite: boolean;
	source?: Source;
}

export const SIGNAL_INITIAL: SignalView = { ran: false, noTruthWrite: true };
