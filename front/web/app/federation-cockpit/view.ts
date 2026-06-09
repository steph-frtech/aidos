import type { CockpitSnapshot } from "@/lib/federation-cockpit";

/**
 * View models for the /federation-cockpit panel (S105 — cockpit de fédération, §50). Kept OUT
 * of actions.ts because a Next "use server" module may only export async functions — types and
 * initial values live here so both the Server Actions and the client panel import them.
 */
export interface CockpitView {
	ok: boolean;
	snapshot?: CockpitSnapshot;
	error?: string;
}

export const COCKPIT_INITIAL: CockpitView = { ok: false };
