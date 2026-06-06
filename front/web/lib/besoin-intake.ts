/**
 * lib/besoin-intake.ts — the TYPESCRIPT TWIN of the EL15 besoin-intake MCP's DETERMINISTIC capability
 * surface (back/mcp/besoin-intake/main.go). The MCP is the capability door over the BesoinGraph; its
 * read/state/schema decisions are PURE functions of the grammar + the EL05 mapping — no LLM, no clock,
 * no rng (determinism-first, CLAUDE.md §6/§8). This twin lets the /besoin-intake Workbench panel run
 * the SAME schema + mapping the Go MCP computes (byte-identical), so the door is action-capable from
 * the screen without a backend round-trip.
 *
 * IT MODELS the door's deterministic projection, NOT the persistence (the Postgres `besoin` schema +
 * RLS live behind the Go MCP). The twin computes, for each grammar level:
 *   - the besoin_level_schema (required fields + outgoing ref + EL05 mapping) a client renders;
 *   - the capture tool name + whether the capture EMITS an Idea (a MAPPING rung) or not (NoEmit:
 *     journey/view/invariant) — no silent cast.
 *
 * THE WALL (CLAUDE.md §2): like the MCP, this writes no truth. A capture EMITS an Idea via the legal
 * idea_capture door (EL05); a NoEmit rung emits none. There is NO promote-to-kernel here.
 */

import {
	allLevels,
	isLevel,
	type Level,
	outgoingRef,
	specOf,
} from "./besoin-grammar";
import { levelToProposes, type Mapping } from "./besoin-proposes";

// BesoinTool is the closed set of capability-door tool names (one tool = one backend op, ADR 0009).
export const BESOIN_READ_TOOLS = [
	"besoin_graph_state",
	"besoin_level_schema",
	"besoin_list",
] as const;
export const BESOIN_VALIDATE_TOOLS = [
	"besoin_validate_level",
	"besoin_classify",
] as const;

// The capture tool per SOURCE rung + the invariant band — the closed, declared map (never invented).
export const CAPTURE_TOOL_BY_LEVEL: Record<Level, string> = {
	product: "besoin_capture_product",
	journey: "besoin_capture_journey",
	view: "besoin_capture_view",
	control: "besoin_capture_control",
	action: "besoin_capture_action",
	operation: "besoin_capture_operation",
	entity: "besoin_capture_entity",
	invariant: "besoin_capture_invariant",
	policy: "besoin_capture_invariant", // a policy band is captured through the invariant band tool.
};

// LevelSchema is what besoin_level_schema returns: the fields a client renders + the EL05 mapping.
export interface LevelSchema {
	level: Level;
	requiredFields: string[];
	outgoingRefTo: string | null;
	outgoingRefField: string | null;
	transversal: boolean;
	attachableTo: string[];
	mapping: string; // "emit:<proposes>" | "no_emit" (EL05) — byte-identical to the Go MCP.
}

// besoinLevelSchema is the TWIN of the MCP's besoin_level_schema tool. Pure total: same level → same
// schema. Returns null for a non-grammar level (the wall: a client cannot invent a level).
export function besoinLevelSchema(level: string): LevelSchema | null {
	if (!isLevel(level)) return null;
	const spec = specOf(level);
	if (!spec) return null;
	const ref = outgoingRef(level);
	const m: Mapping = levelToProposes(level);
	return {
		level,
		requiredFields: [...spec.requiredFields],
		outgoingRefTo: ref?.refTo ?? null,
		outgoingRefField: ref?.refField ?? null,
		transversal: spec.transversal ?? false,
		attachableTo: spec.attachableTo ? [...spec.attachableTo] : [],
		mapping: m.kind === "no_emit" ? "no_emit" : `emit:${m.proposes}`,
	};
}

// CaptureProjection is what a capture turn deterministically decides BEFORE persistence: the tool, the
// EL05 mapping, and whether the capture EMITS an Idea (a MAPPING rung) or NOT (a NoEmit rung). This is
// the same decision the Go MCP's `capture` makes (LevelToProposes); the panel runs it to show the user
// what the door will do — no silent cast.
export interface CaptureProjection {
	level: Level;
	tool: string;
	emits: boolean; // true for a MAPPING rung (product/control/action/operation/entity/policy).
	proposes: string | null; // the Idea kind a MAPPING rung emits; null for a NoEmit rung.
}

export function captureProjection(level: string): CaptureProjection | null {
	if (!isLevel(level)) return null;
	const m = levelToProposes(level);
	return {
		level,
		tool: CAPTURE_TOOL_BY_LEVEL[level],
		emits: m.kind === "emit",
		proposes: m.kind === "emit" ? (m.proposes ?? null) : null,
	};
}

// allCaptureProjections returns the closed, ordered capture projection for every grammar level — the
// door's full capture surface (used by the panel to enumerate every tool, ui-completeness CLAUDE.md §7).
export function allCaptureProjections(): CaptureProjection[] {
	return allLevels()
		.map((l) => captureProjection(l))
		.filter((p): p is CaptureProjection => p !== null);
}

// noEmitLevels returns the levels whose capture emits NO Idea (journey/view/invariant) — the closed set
// the panel renders so the user sees the no-silent-cast guarantee.
export function noEmitLevels(): Level[] {
	return allLevels().filter((l) => {
		const p = captureProjection(l);
		return p !== null && !p.emits;
	});
}
