import type { Outcome } from "@/lib/learn";

/**
 * View models for the /learn panel (S107 — incident → nouveau miroir → nouvelle dent, EPIC 12 /
 * E12). Kept OUT of actions.ts because a Next "use server" module may only export async functions —
 * types and the initial value live here so both the Server Actions and the client panel import them.
 *
 * `moved` distinguishes a real new tooth (the operation/policy hash bumped, a targeted red wave
 * became the worklist) from a no-op re-reflection (no bump, an empty wave — a cosmetic
 * re-reflection is not a tooth).
 */
export interface LearnView {
	ok: boolean;
	outcome?: Outcome;
	error?: string;
}

export const LEARN_INITIAL: LearnView = { ok: false };
