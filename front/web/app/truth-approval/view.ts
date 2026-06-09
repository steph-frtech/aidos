import type { Decision } from "@/lib/truth-approval";

/** GateView is the result of one propose/approve through the gate (the §1 control). */
export interface GateView {
	ran: boolean;
	decision?: Decision;
	noTruthWrite: boolean;
}

export const GATE_INITIAL: GateView = { ran: false, noTruthWrite: true };

/** ConcurrencyView is the result of a concurrent batch (the §2 control). */
export interface ConcurrencyView {
	ran: boolean;
	decisions: Decision[];
	appliedCount: number;
	stale: string[];
	startHead: string;
	noTruthWrite: boolean;
}

export const CONCURRENCY_INITIAL: ConcurrencyView = {
	ran: false,
	decisions: [],
	appliedCount: 0,
	stale: [],
	startHead: "",
	noTruthWrite: true,
};

/** RelandView is the result of the stale member re-running against the new head (the §3 control). */
export interface RelandView {
	ran: boolean;
	decision?: Decision;
	newHead: string;
	noTruthWrite: boolean;
}

export const RELAND_INITIAL: RelandView = {
	ran: false,
	newHead: "",
	noTruthWrite: true,
};
