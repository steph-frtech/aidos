import type { PreviewPlan } from "@/lib/preview";

/**
 * View model for the /preview panel (S94 — the ephemeral preview environment). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and
 * the initial value live here so both the Server Action and the client panel import them.
 */
export interface PreviewView {
	ok: boolean;
	/** the deterministic, content-addressed preview plan (URL, boot/teardown, hashes). */
	plan?: PreviewPlan;
	/** the served-app hash the (modelled) running preview reports from its emitted bytes. */
	servedAppHash?: string;
	/** whether the served-app hash equals the emitted-app hash (the S94 done-criterion). */
	servedMatches?: boolean;
	/** a malformed input or a hash mismatch → the typed BlockReason explanation. */
	blockExplanation?: string;
}

export const PREVIEW_INITIAL: PreviewView = { ok: false };
