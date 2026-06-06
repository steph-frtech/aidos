/**
 * lib/besoin-proposes.ts — the TYPESCRIPT TWIN of EL05's LevelToProposes table
 * (back/runtime/besoin/proposes.go). Pure, total, deterministic: same Level → same Mapping; no
 * clock/rng/IO/LLM (determinism-first, CLAUDE.md §6/§8). The /compound-besoin-proposes panel reads
 * this twin so the table shown on screen is byte-identical to what the Go authority computes — never
 * a fork.
 *
 * THE HONEST JOIN with the EXISTING closed set ideas.ProposesKinds()
 * (control|policy|operation|action|entity|product):
 *   - control/action/operation/entity/product → THEMSELVES (the level name IS a ProposesKind;
 *     self-mapping is the only legal Emit — never an alias of another level).
 *   - policy (band) → policy.
 *   - journey, view → NoEmit (no legal Proposes target; they seed anchors_above[], never a silent
 *     cast journey→product or view→view*).
 *   - invariant (band) → NoEmit (its mirror is a property N1, not an idea kind).
 * Each non-mapping is justified by ADR 0041 (docs/adr/0041), never a footnote.
 *
 * THE WALL (CLAUDE.md §2): this decides ONLY the Proposes target; it emits NO Idea (EL16 does, via
 * the legal idea-intake door) and writes no truth.
 */

import { allLevels, isLevel, type Level } from "./besoin-grammar";

export type { Level } from "./besoin-grammar";

// The closed set of ideas.Proposes kinds (mirrors back/kernel/ideas ProposesKinds()). The ONLY legal
// Emit targets. Declared, never invented — a mapping outside this set is a hard error.
export const PROPOSES_KINDS = [
	"control",
	"policy",
	"operation",
	"action",
	"entity",
	"product",
] as const;
export type ProposesKind = (typeof PROPOSES_KINDS)[number];

export type MappingKind = "emit" | "no_emit";

export interface Mapping {
	kind: MappingKind;
	proposes?: ProposesKind;
}

const NO_EMIT: Mapping = { kind: "no_emit" };
const emit = (p: ProposesKind): Mapping => ({ kind: "emit", proposes: p });

// LEVEL_PROPOSES_TABLE — the FIRST-CLASS, CLOSED, TOTAL declared map. Its domain is exactly
// allLevels(); each Emit target is a member of PROPOSES_KINDS (the honest join).
export const LEVEL_PROPOSES_TABLE: Record<Level, Mapping> = {
	// The 5 SOURCE rungs whose name IS a ProposesKind → self-mapping (the only legal Emit).
	control: emit("control"),
	action: emit("action"),
	operation: emit("operation"),
	entity: emit("entity"),
	product: emit("product"),
	// The policy transversal band → policy.
	policy: emit("policy"),
	// NoEmit — no legal Proposes target (journey/view) or a property-mirror band (invariant).
	journey: NO_EMIT, // ADR 0041: no "journey" kind; seeds anchors.
	view: NO_EMIT, // ADR 0041: no "view" kind; seeds anchors (view→view* impossible).
	invariant: NO_EMIT, // ADR 0041: ∀ statement is a property mirror, not an idea kind.
};

// levelToProposes returns the declared Mapping for a Level. For an out-of-grammar string it returns
// the safe NoEmit verdict (callers iterating valid levels never throw). Pure, total, deterministic.
export function levelToProposes(l: string): Mapping {
	if (isLevel(l)) return LEVEL_PROPOSES_TABLE[l];
	return NO_EMIT;
}

export type CheckedResult =
	| { ok: true; mapping: Mapping }
	| { ok: false; error: "out_of_grammar" };

// levelToProposesChecked is levelToProposes with a HARD error for an out-of-grammar level — a mapping
// toward an unknown kind is impossible (never a silent alias, never an LLM guess). Pure, total.
export function levelToProposesChecked(l: string): CheckedResult {
	if (isLevel(l)) return { ok: true, mapping: LEVEL_PROPOSES_TABLE[l] };
	return { ok: false, error: "out_of_grammar" };
}

// noEmitLevels returns the closed set of levels that emit NO Idea, in canonical order. A copy.
export function noEmitLevels(): Level[] {
	return ["journey", "view", "invariant"];
}

// emitLevels returns the closed set of levels that MAP to a ProposesKind (Emit), in allLevels() order.
export function emitLevels(): Level[] {
	return allLevels().filter((l) => levelToProposes(l).kind === "emit");
}

// isNoEmit reports whether a level emits no Idea. Pure, total.
export function isNoEmit(l: string): boolean {
	return levelToProposes(l).kind === "no_emit";
}

// proposesKinds returns the closed set of Proposes kinds (a copy). The Workbench renders exactly
// these; none is invented.
export function proposesKinds(): ProposesKind[] {
	return [...PROPOSES_KINDS];
}
