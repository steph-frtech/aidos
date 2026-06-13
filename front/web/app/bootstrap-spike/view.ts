import type { SpikeVerdict } from "@/lib/bootstrap-spike";

/**
 * View types shared by the /bootstrap-spike Server Action and the panel (DP10 —
 * SPIKE-gate bootstrap one-shot déterministe vs deploy.sh). A "use server"
 * module may only export async functions, so these live here.
 */
export interface ReMeasureView {
	ok: boolean;
	/** the fresh verdict of the re-decision (pure — same measured runs, same engine). */
	verdict?: SpikeVerdict;
	/** whether the re-decided verdict hash equals the initially rendered one. */
	hashEqual?: boolean;
}

export const REMEASURE_INITIAL: ReMeasureView = { ok: false };
