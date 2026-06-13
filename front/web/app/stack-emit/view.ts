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
	/** DP05 — the S23 content address of the phase pinning the manifest. */
	phaseVersion?: string;
	/** DP05 — the bundle's own output address (phase + the 5 artifacts). */
	bundleHash?: string;
	/** DP05 — the emitted traefik dynamic config (file provider, references only). */
	traefikText?: string;
	/** DP05 — records.Hash(traefik.dynamic.yml bytes). */
	traefikOutputHash?: string;
	/** DP05 — « ré-émettre deux fois, hash égaux » : re-emitted bundle_hash == seeded. */
	sameBundleAsSeeded?: boolean;
}

export const EMIT_INITIAL: EmitView = { ok: false };

/**
 * View types for the DP11 PROFILE selector (the deterministic include/exclude
 * over the closed SPEC-stack-2026 profile set). Selecting a profile re-emits the
 * compose of the profiled manifest NARROWED to that selection — services
 * appear/disappear, BYTE-IDENTICAL per selection. A profile outside the closed
 * set is unselectable (the dropdown is closed), but the action still surfaces the
 * BlockReason if one is returned (UNKNOWN_PROFILE / DOLTGRES_NOT_ALLOWED_IN_PROD).
 */
export interface ProfileEmitView {
	ok: boolean;
	/** the selection that was applied (echoed for the screen). */
	profile?: string;
	/** the target environment the selection was checked against (DP06 cross). */
	env?: string;
	/** the emitted compose of the narrowed manifest. */
	yaml?: string;
	/** records.Hash(bytes) — byte-identical per (manifest, selection). */
	outputHash?: string;
	/** the narrowed manifest's content address (S02 reused). */
	sourceHash?: string;
	/** the names of the services KEPT by the selection (visible include/exclude). */
	keptServices?: string[];
	/** the count of services kept (vs. the manifest's total). */
	keptCount?: number;
	/** the manifest's total service count (the `full` cardinality). */
	totalCount?: number;
	/** the DP11 refusal (code + message): UNKNOWN_PROFILE / DOLTGRES_NOT_ALLOWED_IN_PROD. */
	block?: { code: string; message: string };
}

export const PROFILE_EMIT_INITIAL: ProfileEmitView = { ok: false };
