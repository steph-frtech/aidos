import { createHash } from "node:crypto";

/**
 * capture-idea.ts — the deterministic TS twin of back/kernel/ideas.Capture (S64).
 *
 * It content-addresses a free-text human intention BYTE-IDENTICALLY to the Go package:
 * the sketch {intent, proposes, provenance} is canonicalised (object keys sorted
 * lexicographically, recursively, no insignificant whitespace — records.Canonicalize)
 * then hashed with SHA-256 hex (records.Hash). So an idea captured from the Workbench
 * lands at the SAME id the engine (ideas.Capture) would compute — the canonical door
 * (idea-intake MCP) and this twin agree.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): content-addressing is a PURE function — same
 * (proposes, intent, provenance) → same id, regardless of input field order (the
 * reproducibility mirror lib/capture-idea.test.ts pins it, including the exact id of
 * the canonical sample, so the twin can never drift from the Go authority). The
 * project a capture is scoped to is a SEPARATE scope dimension (S54) — it does NOT
 * enter the hash (the SAME sketch is the SAME idea across projects; the per-project
 * inbox isolates by the project_id COLUMN, never by re-hashing).
 *
 * THE WALL (CLAUDE.md §2): a captured idea is a CANDIDATE-truth staged ABOVE the
 * product but BELOW the freeze — it carries NO version and NO mirror (the type makes
 * those two absences unrepresentable: there is simply no field for them). status is
 * always "draft" (the only legal first state). Promotion to a kernel truth is /goal,
 * never a write from the capture screen.
 */

/** The five lifecycle statuses — mirrors ideas.Status (the closed set). A capture is always draft. */
export type Status = "draft" | "grilled" | "spiking" | "harvested" | "rejected";

/** The layer/kind an idea would become if promoted — mirrors ideas.Proposes (the closed set). */
export type Proposes =
	| "control"
	| "policy"
	| "operation"
	| "action"
	| "entity"
	| "product";

/** PROPOSES_KINDS is the closed list the capture form offers + validates against. */
export const PROPOSES_KINDS: readonly Proposes[] = [
	"control",
	"policy",
	"operation",
	"action",
	"entity",
	"product",
] as const;

/** The provenance source — mirrors ideas.ProvenanceSource. A capture from the screen is "human". */
export type ProvenanceSource = "human" | "incident";

/** Provenance — who wanted what (mirrors ideas.Provenance): source + verbatim detail. */
export interface Provenance {
	source: ProvenanceSource;
	detail: string;
}

/**
 * CapturedIdea — a candidate-truth (mirrors ideas.Idea). It carries NO `version` and
 * NO `mirror` field: those two absences are what make it an idea and not a truth, and
 * the type makes them unrepresentable. The id is the content hash of the sketch.
 */
export interface CapturedIdea {
	id: string;
	proposes: Proposes;
	intent: string;
	provenance: Provenance;
	status: Status;
}

/** sha256Hex matches records.Hash (canonical SHA-256 hex over UTF-8 bytes). */
function sha256Hex(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/**
 * canonicalSketch mirrors ideas.Canonicalize: the JSON object {intent, proposes,
 * provenance:{detail, source}} with ALL keys in lexicographic order and no
 * whitespace. Status and reject_reason are EXCLUDED (lifecycle metadata, not part of
 * the address) — exactly as the Go `body` struct excludes them.
 */
export function canonicalSketch(
	proposes: Proposes,
	intent: string,
	provenance: Provenance,
): string {
	// Keys MUST be emitted in sorted order (records.Canonicalize sorts recursively):
	// top level → intent < proposes < provenance ; nested → detail < source.
	const ordered = {
		intent,
		proposes,
		provenance: { detail: provenance.detail, source: provenance.source },
	};
	return JSON.stringify(ordered);
}

/** contentAddress returns the idea id == version == Hash(canonicalSketch). */
export function contentAddress(
	proposes: Proposes,
	intent: string,
	provenance: Provenance,
): string {
	return sha256Hex(canonicalSketch(proposes, intent, provenance));
}

/**
 * captureIdea builds a content-addressed draft idea from a free-text human intention —
 * the pure twin of ideas.Capture. status is always "draft"; the id is the content
 * hash of the sketch. No I/O, no clock, no rng — the same sketch always yields the
 * same idea.
 */
export function captureIdea(
	proposes: Proposes,
	intent: string,
	provenance: Provenance,
): CapturedIdea {
	return {
		id: contentAddress(proposes, intent, provenance),
		proposes,
		intent,
		provenance,
		status: "draft",
	};
}
