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
	/** DP04 — the emitted .env.example (references only, never a value). */
	envText?: string;
	/** DP04 — records.Hash(.env.example bytes). */
	envOutputHash?: string;
	/** DP04 — records.Hash(start.sh bytes). */
	startShOutputHash?: string;
	/** DP04 — records.Hash(start_with_rebuild.sh bytes). */
	rebuildOutputHash?: string;
	/** DP04 — the deterministic gitleaks-like scan verdict (S91, code never LLM). */
	envClean?: boolean;
	/** DP04 — every ${VAR} the compose references exists in the .env.example. */
	coherent?: boolean;
	/** DP04 — whether the re-emitted .env.example output_hash equals the seeded one. */
	sameEnvAsSeeded?: boolean;
}

export const EMIT_INITIAL: EmitView = { ok: false };
