import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /truth-level live read — the decoders over the Go truth-level tools' output (FK01; S59
 * cutover, ADR 0092 — the Go engine is the SINGLE live source). Kept OUT of actions.ts (a Next
 * "use server" module may only export async functions) so the parity mirror (live.test.ts) can
 * import the PURE decoders directly.
 *
 * THE THREE DISPATCHED READS. The truth-level node is the FK01 capability door over
 * back/kernel/truthlevel. The passerelle dispatches the three below-the-line reads of the
 * truth-level MCP server (truthlevelsrv):
 *   - compute       — the SOLE legal writer of a truth_level: signals → the highest rung
 *                     ({ ok, level, name }); a VALUE the transition computes, never hand-posed;
 *   - check_parity  — the parity mirror: recompute from the signals and compare to the stored
 *                     rung ({ ok, aligned, stored, computed, reason? }); aligned = GREEN, divergence = RED;
 *   - levels        — the seven canonical FKE-5 rungs ({ ok, levels: [{level, name}] }), the
 *                     panel filter set, never invented.
 *
 * THE WALL (CLAUDE.md §2): all three are PURE below-the-line reads — they compute a level, check
 * parity, and list the rungs as VALUES and write NOTHING (WroteKernel false). Persisting a level
 * onto a record stays the privileged aidos CLI's job at the legal door, never from this screen.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): each `Decoder<T>` is the SINGLE runtime declaration
 * of its tool's output shape; the static type is INFERRED via Decoded<>. The parity mirror
 * (live.test.ts) pins these decoders == the Go truthlevelsrv computeOutput / parityOutput /
 * levelsOutput CONTRACT, NOT a second implementation of the FKE-5 transition (back/kernel/truthlevel
 * is authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM; a malformed
 * payload returns null and readVia falls back to the deterministic demo fixture.
 */

/** The decoded `compute` verdict — the highest satisfied FKE-5 rung for a record's signals. */
export interface ComputeVerdict {
	ok: boolean;
	/** the rung (1=raw … 7=reconciled, 0=unknown). */
	level: number;
	/** the canonical level name (raw…reconciled, unknown). */
	name: string;
}

/** The decoded `check_parity` verdict — the stored rung vs the recomputed one (divergence = RED). */
export interface ParityVerdict {
	ok: boolean;
	/** aligned iff stored == computed (GREEN); divergence is RED. */
	aligned: boolean;
	/** the rung stored on the record. */
	stored: number;
	/** the rung the transition recomputed from the signals. */
	computed: number;
}

/** One row of the `levels` reference table — a rung + its canonical name. */
export interface LevelRow {
	level: number;
	name: string;
}

/**
 * computeDecoder decodes the Go `compute` tool output (truthlevelsrv.computeOutput:
 * `{ ok: bool, level: int, name: string }`). `ok` is required; `level` is the rung and `name`
 * its canonical label. A malformed payload (missing/ill-typed field) → null, so the read falls
 * back to the demo verdict. PURE.
 */
export const computeDecoder: Decoder<ComputeVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	const level = num(raw.level);
	const name = str(raw.name);
	if (level === null || name === null) return null;
	return { ok: raw.ok, level, name };
};

/**
 * parityDecoder decodes the Go `check_parity` tool output (truthlevelsrv.parityOutput:
 * `{ ok: bool, aligned: bool, stored: int, computed: int, reason?: string }`). `ok`, `aligned`,
 * `stored`, `computed` are required; `reason` is ignored by the panel. A malformed payload → null.
 */
export const parityDecoder: Decoder<ParityVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	if (typeof raw.aligned !== "boolean") return null;
	const stored = num(raw.stored);
	const computed = num(raw.computed);
	if (stored === null || computed === null) return null;
	return { ok: raw.ok, aligned: raw.aligned, stored, computed };
};

/** levelRowDecoder decodes one `{ level, name }` row of the levels reference table. */
const levelRowDecoder: Decoder<LevelRow> = (raw) => {
	if (!isObject(raw)) return null;
	const level = num(raw.level);
	const name = str(raw.name);
	if (level === null || name === null) return null;
	return { level, name };
};

/**
 * levelsDecoder decodes the Go `levels` tool output (truthlevelsrv.levelsOutput:
 * `{ ok: bool, levels: [{level, name}] }`). `ok` is required; `levels` MUST decode as a
 * homogeneous array of rows (any malformed row → null → demo fallback). PURE.
 */
export const levelsDecoder: Decoder<LevelRow[]> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	return arr(levelRowDecoder)(raw.levels);
};
