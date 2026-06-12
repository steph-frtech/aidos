import type { Refusal } from "@/lib/stack-manifest";

/**
 * View types shared by the /stack-emit Server Action and the panel (DP03 —
 * the additive Target docker-compose: Emit(stack_manifest) →
 * docker-compose.yml). A "use server" module may only export async
 * functions, so these live here.
 */
export interface EmitView {
	ok: boolean;
	/** the emitted compose document (the /data/dockers projection). */
	yaml?: string;
	/** records.Hash(bytes) — the byte-identical re-emission proof. */
	outputHash?: string;
	/** the manifest's content address (== DP02 kernel head hash). */
	sourceHash?: string;
	/** where the projection lands, below the line. */
	path?: string;
	/** whether the re-emitted output_hash equals the seeded one. */
	sameAsSeeded?: boolean;
	/** the manifest was refused: the closed-set refusal (code + message). */
	refusal?: Refusal;
	/** the submitted JSON did not parse. */
	parseError?: string;
}

export const EMIT_INITIAL: EmitView = { ok: false };
