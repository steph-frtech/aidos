import type {
	BlockReason,
	PairVerdict,
	ProposedChangeSet,
} from "@/lib/context-map";

/**
 * View models for the /context-map panel (S101 — Context-Map + inter-cell contract pairs).
 * Kept OUT of actions.ts because a Next "use server" module may only export async functions —
 * types and initial values live here so both the Server Actions and the client panel import them.
 */
export interface VerifyPairView {
	ok: boolean;
	verdict?: PairVerdict;
}

export interface VerifyAllView {
	ok: boolean;
	verdicts?: PairVerdict[];
}

export interface CheckCallView {
	ok: boolean;
	allowed?: boolean;
	block?: BlockReason;
}

export interface ProposeView {
	ok: boolean;
	changeset?: ProposedChangeSet;
}

export const VERIFY_PAIR_INITIAL: VerifyPairView = { ok: false };
export const VERIFY_ALL_INITIAL: VerifyAllView = { ok: false };
export const CHECK_CALL_INITIAL: CheckCallView = { ok: false };
export const PROPOSE_INITIAL: ProposeView = { ok: false };
