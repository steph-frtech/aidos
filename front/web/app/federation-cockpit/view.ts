import type { CockpitSnapshot } from "@/lib/federation-cockpit";
import type { Source } from "@/lib/gateway-sdk";

/**
 * View models for the /federation-cockpit panel (S105 — cockpit de fédération, §50). Kept OUT
 * of actions.ts because a Next "use server" module may only export async functions — types and
 * initial values live here so both the Server Actions and the client panel import them.
 */
export interface CockpitView {
	ok: boolean;
	snapshot?: CockpitSnapshot;
	/** whether the red-wave fan-out came from the live Go engine or the demo fallback (ADR 0092). */
	source?: Source;
	error?: string;
}

export const COCKPIT_INITIAL: CockpitView = { ok: false };
