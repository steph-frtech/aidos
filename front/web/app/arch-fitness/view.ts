import type {
	ProposedChangeSet,
	RatchetVerdict,
	StructuralMetric,
} from "@/lib/arch-fitness";

/**
 * View models for the /arch-fitness panel (S102 — the structural ratchet, §47). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and
 * initial values live here so both the Server Actions and the client panel import them.
 */
export interface MeasureView {
	ok: boolean;
	metric?: StructuralMetric;
}

export interface RatchetView {
	ok: boolean;
	verdict?: RatchetVerdict;
}

export interface GateView {
	ok: boolean;
	metric?: StructuralMetric;
	verdict?: RatchetVerdict;
	/** which fault was injected into the candidate cut (clean | violation | cycle). */
	scenario?: string;
}

export interface ProposeView {
	ok: boolean;
	changeset?: ProposedChangeSet;
}

export const MEASURE_INITIAL: MeasureView = { ok: false };
export const RATCHET_INITIAL: RatchetView = { ok: false };
export const GATE_INITIAL: GateView = { ok: false };
export const PROPOSE_INITIAL: ProposeView = { ok: false };
