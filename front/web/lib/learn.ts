/**
 * The learn CONTRACT — the typed shape of the Workbench /learn read (AIDOS S107, EPIC 12 / E12).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The /learn panel now reads the
 * LIVE loop-closure outcome from the Go learn MCP server (back/mcp/learn/learnsrv:
 * bump_hash · targeted_wave · close_loop) through the passerelle
 * (`readVia(scope, "close_loop", …)`, app/learn/live.ts). The PURE, DETERMINISTIC loop computation
 * (the hash bump + the targeted red wave) is the GO ENGINE's — it is AUTHORITATIVE on the wire and
 * the front no longer re-implements it.
 *
 * This module therefore carries ONLY the TYPES the decoder fills (the contract, never a second
 * business logic — the twin compute moved to lib/learn-data.ts, behind `source:"demo"`):
 *
 *   - the loop-closure outcome the panel renders (`Outcome`);
 *   - its parts (`Bump`, `RedWave`, `RedWorkItem`) and the wall code;
 *   - the loop's INPUT contract (`ApprovedMirror`, `Target`, `Edge`) the demo fixtures shape.
 *
 * THE WALL (CLAUDE.md §2): the loop NEVER writes truth and NEVER authors the approved mirror (the
 * human's /goal does). `wroteKernel` is always false; the direct Reality→Kernel edge is always
 * refused (REALITY_CANNOT_DECLARE_TRUTH). Nothing learns its own fitness.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): these are the SINGLE front declaration of the live
 * outcome shape; the decoder (app/learn/live.ts) fills them from the Go `close_loop` output, and the
 * parity mirror (app/learn/live.test.ts) pins the decoder == the Go contract — NOT a re-derivation
 * of the bump/wave logic (the Go learn.Close is authoritative).
 */

export type TargetKind = "operation" | "policy";

/** The human-approved new mirror (the /goal outcome) the loop attaches to a target. */
export interface ApprovedMirror {
	mirrorId: string;
	/** the target ref the mirror reflects, "id@version". */
	reflectsId: string;
	reflectsVersion: string;
}

/** The operation/policy target the incident teaches a lesson about, at its current head. */
export interface Target {
	kind: TargetKind;
	id: string;
	version: string;
	/** the canonical JSON of the target's AST body BEFORE the reflection attaches. */
	specBody: Record<string, unknown>;
}

/** The deterministic content-address delta a learned mirror causes on its target. */
export interface Bump {
	targetId: string;
	before: string;
	after: string;
	moved: boolean;
}

export type WaveLayer = "mirror" | "projection" | "operation_action" | "button";

/** One element of the red wave (the worklist) — a target that is now red. */
export interface RedWorkItem {
	target: string;
	reason: "version_stale" | "failed_test" | "incident";
	layer: WaveLayer;
}

/** The ordered (mirror-first) red wave a bump triggers — the worklist. */
export interface RedWave {
	items: RedWorkItem[];
}

/** A target's link edge (S17), with its declared load-bearing flag + render layer. */
export interface Edge {
	/** the consuming `from` side ref, "id@version" (the layer that goes red). */
	fromId: string;
	fromVersion: string;
	/** the pinned `to` target ref. */
	toId: string;
	toVersion: string;
	loadBearing: boolean;
	layer: WaveLayer;
}

/** The wall refusal — reality never declares truth. */
export const WALL_CODE = "REALITY_CANNOT_DECLARE_TRUTH" as const;

/** The full /learn loop outcome — the value the panel renders (the lean view of the Go Outcome). */
export interface Outcome {
	provenanceSource: "incident";
	provenanceDetail: string;
	bump: Bump;
	wave: RedWave;
	wallCode: typeof WALL_CODE;
	wroteKernel: false;
}
