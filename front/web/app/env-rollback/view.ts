import type { Promotion, RollbackDecision } from "@/lib/env-rollback";

/**
 * View models for the /env-rollback panel (S98 — environments + rollback-to-phase). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and the
 * initial values live here so both the Server Actions and the client panel import them.
 */
export interface PromoteView {
	ok: boolean;
	promotion?: Promotion;
	blockCode?: string;
	blockExplanation?: string;
}

export interface RollbackView {
	ok: boolean;
	decision?: RollbackDecision;
	/** whether the env serves a fresh re-emit of N-1 (the re-projection property, code-judged). */
	servesFresh?: boolean;
	/** whether the stale artifact of N is rejected (nothing restored as stale). */
	rejectsStale?: boolean;
	blockCode?: string;
	blockExplanation?: string;
}

export const PROMOTE_INITIAL: PromoteView = { ok: false };
export const ROLLBACK_INITIAL: RollbackView = { ok: false };
