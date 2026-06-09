import type { BreakerSignal, CellMeter } from "@/lib/cost-meter";
import type { EconomicsDecision, HarnessCostBudget } from "@/lib/economics";

/** The DECLARED checkout budget the panel meters against (read-only, above the line). */
export const CHECKOUT_BUDGET: HarnessCostBudget = {
	cellRef: "checkout",
	maxCiMinutes: 10,
	maxLlmTokensPerGoal: 50000,
	maxMutationRuntimeSeconds: 300,
	maxHumanReviewMinutes: 30,
	expectedRiskReduction: "high",
};

/** MeterView — the result of metering the cell from its real AgentRuns (controls 1 + 2). */
export interface MeterView {
	ran: boolean;
	cellMeter?: CellMeter;
	decision?: EconomicsDecision;
	noTruthWrite: boolean;
}

export const METER_INITIAL: MeterView = { ran: false, noTruthWrite: true };

/** SignalView — the projected S83 disjoncteur signal (control 3). */
export interface SignalView {
	ran: boolean;
	signal?: BreakerSignal;
	noTruthWrite: boolean;
}

export const SIGNAL_INITIAL: SignalView = { ran: false, noTruthWrite: true };
