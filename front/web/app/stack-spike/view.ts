import type { SpikeVerdict } from "@/lib/stack-spike";

/**
 * View types shared by the /stack-spike Server Action and the panel (DP01 —
 * SPIKE-gate StackManifest-as-source). A "use server" module may only export
 * async functions, so these live here.
 */
export interface ReEmitView {
	ok: boolean;
	/** the fresh verdict of the re-run (pure — same fixture, same engine). */
	verdict?: SpikeVerdict;
	/** whether the re-run's output hash equals the initially rendered one. */
	bytesEqual?: boolean;
}

export const REEMIT_INITIAL: ReEmitView = { ok: false };
