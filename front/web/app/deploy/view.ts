import type { DeployPlan } from "@/lib/deploy";

/**
 * View model for the /deploy panel (S96 — the phase-keyed deploy pipeline). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and
 * the initial value live here so both the Server Action and the client panel import them.
 */
export interface DeployView {
	ok: boolean;
	/** the deterministic, content-addressed deploy plan (URL, boot/teardown, hashes, migration). */
	plan?: DeployPlan;
	/** the served-app hash the (modelled) running deploy reports from its emitted bytes. */
	servedAppHash?: string;
	/** whether the served-app hash equals the emitted-app hash (the re-projection property). */
	servedMatches?: boolean;
	/** whether the migration is forward-only (expand → backfill → contract). */
	forwardOnly?: boolean;
	/** the refusal code when the deploy is refused (PHASE_NOT_STABLE / OUT_OF_SCOPE / …). */
	blockCode?: string;
	/** a non-stable phase / malformed surface / breaking migration → the BlockReason explanation. */
	blockExplanation?: string;
}

export const DEPLOY_INITIAL: DeployView = { ok: false };
