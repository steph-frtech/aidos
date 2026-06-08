import type { Decision } from "@/lib/doltgres-spike";

/**
 * View model for the /doltgres-spike panel (S88). Kept OUT of actions.ts because a
 * Next "use server" module may only export async functions — types and the initial
 * value live here so both the Server Action and the client panel can import them.
 */
export interface DecideView {
	ok: boolean;
	decision?: Decision;
}

export const DECIDE_INITIAL: DecideView = { ok: false };
