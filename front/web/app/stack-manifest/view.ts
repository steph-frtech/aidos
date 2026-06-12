import type { Refusal } from "@/lib/stack-manifest";

/**
 * View types shared by the /stack-manifest Server Action and the panel (DP02 —
 * the StackManifest engraved as a first-class Kernel SOURCE). A "use server"
 * module may only export async functions, so these live here.
 */
export interface MeasureView {
	ok: boolean;
	/** the manifest was valid: its content address (id == version). */
	hash?: string;
	/** whether the re-measured hash equals the seeded record's hash. */
	sameAsSeeded?: boolean;
	/** the manifest was refused: the closed-set refusal (code + message). */
	refusal?: Refusal;
	/** the submitted JSON did not parse. */
	parseError?: string;
}

export const MEASURE_INITIAL: MeasureView = { ok: false };
