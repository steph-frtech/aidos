/**
 * blocks.ts — the S60 global BlockReason catalog + the truth-write refusal projection.
 *
 * S60 (app-builder EPIC 2) surfaces the REAL refusals the engine raises: a global
 * `/blocks` panel and inline toasts render the actual `BlockReason`
 * (`code, severity, explanation, how_to_fix[]`, KRD §44.5) whenever a write is refused.
 * The screen coins NO new code, NO new prose: every BlockReason here is the SAME object
 * the authoritative twins already pin —
 *   - AGENT_CROSS_PROJECT_WRITE        (lib/projectWall — the project-aware wall, S55)
 *   - GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (lib/gateway — the server-side wall, S58)
 *   - GATEWAY_UNKNOWN_TOOL             (lib/gateway — the closed registry, S58)
 *   - GOAL_STILL_RED                   (lib/goal — the non-gameable stop, S29)
 *
 * ── THE DONE CRITERION (a refused truth-write surfaces its actionable BlockReason) ────
 * `refuseTruthWrite` routes a truth-zone tool through the SAME gateway router the live
 * HTTP server applies (lib/gateway.route, server-side, §2). A `kernel_write` /
 * `mirror_write` / `fitness_write` is refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET —
 * its real code, severity, explanation and how_to_fix[] are returned verbatim, ready to
 * render in the panel and as an inline toast. No truth is written: the wall refuses.
 *
 * ── DETERMINISM-FIRST (CLAUDE.md §6/§8) ──────────────────────────────────────────────
 * Pure total functions over their input — no clock, no rng, no LLM. Same (scope, tool) →
 * same refusal. The reproducibility mirror lib/blocks.test.ts pins it.
 */

import {
	CODE_TRUTH_WRITE_NEEDS_CHANGESET,
	CODE_UNKNOWN_TOOL,
	type RouteDecision,
	route,
} from "./gateway";
import { GOAL_STILL_RED } from "./goal";
import { CODE_AGENT_CROSS_PROJECT_WRITE } from "./projectWall";

/** The actionable refusal shape (KRD §44.5) — the same fields the wall/gateway/goal pin. */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** A catalog entry: a BlockReason plus the origin gesture that raises it (for the panel). */
export interface BlockEntry {
	/** which engine surface raises this refusal — for grouping in the panel. */
	origin: "wall" | "gateway" | "goal";
	reason: BlockReason;
}

/**
 * The fixed origin/code pairs the catalog enumerates. The actual prose is sourced from the
 * authoritative twins at render time (a thin i18n-friendly default lives in messages); the
 * codes here are the closed, declared set — never coined here.
 */
export const CATALOG_CODES: readonly {
	origin: BlockEntry["origin"];
	code: string;
	severity: string;
}[] = [
	{
		origin: "wall",
		code: CODE_AGENT_CROSS_PROJECT_WRITE,
		severity: "error",
	},
	{
		origin: "gateway",
		code: CODE_TRUTH_WRITE_NEEDS_CHANGESET,
		severity: "error",
	},
	{ origin: "gateway", code: CODE_UNKNOWN_TOOL, severity: "error" },
	{
		origin: "goal",
		code: GOAL_STILL_RED.code,
		severity: GOAL_STILL_RED.severity,
	},
];

/**
 * refuseTruthWrite EXECUTES a truth-zone tool through the gateway router — the same wall
 * the live server applies. It returns the real BlockReason (code + severity + explanation
 * + how_to_fix) the router raises, or null when (against expectation) the call routed.
 * Pure + deterministic. THE WALL (§2): nothing here writes truth — the router refuses a
 * truth-write with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (truth moves only via a ChangeSet).
 */
export function refuseTruthWrite(
	identity: string,
	activeProject: string,
	tool: string,
): BlockReason | null {
	const d: RouteDecision = route({ identity, activeProject }, tool, {
		projectId: activeProject,
		claimedIdentity: "",
	});
	if (d.outcome === "route" || d.blockReason === undefined) return null;
	const br = d.blockReason;
	return {
		code: br.code,
		severity: br.severity,
		explanation: br.explanation,
		howToFix: br.howToFix,
	};
}

/** The canonical truth-zone tools the panel offers (the fenced §2 write namespace). */
export const TRUTH_WRITE_TOOLS: readonly string[] = [
	"kernel_write",
	"mirror_write",
	"fitness_write",
];
