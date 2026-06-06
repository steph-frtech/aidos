/**
 * lib/besoin-interview.ts — the TYPESCRIPT TWIN of EL13 (back/runtime/besoin/interview.go). The
 * backing of the umbrella skill /compound-besoin: the level-by-level FORCED interview where the LLM
 * LEADS the dialogue but the CODE JUDGES (CLAUDE.md §6/§8 determinism-first). Every verdict is a pure
 * function, the LLM excluded:
 *
 *   - dispatchOf(level) → Gesture: the DECLARED closed table of which gesture a level dispatches to
 *     (grill / view / action / generic). Total over the grammar, fail-closed otherwise.
 *   - enterableLevel(nodes) → the first SOURCE rung not yet `enough` (forcing: a level opens only when
 *     its parent is right-sized). COMPUTED via canDescend, never guessed.
 *   - recordAnswer(level, body, metaComplete, routeToSpike) → the deterministic routing:
 *       1. OFF-ALTITUDE (isOffAltitude / EL12 schema-mismatch) — an entity body at `product` is rejected
 *          by SCHEMA, never by an LLM opinion of altitude;
 *       2. FUZZY → /spike — an unverifiable answer is routed to the legal three-hop gate
 *          (idea_capture → idea_grill → idea_spike), NOT a descent;
 *       3. RECORD — otherwise the body is recorded and `resolved` is COMPUTED (canDescend.enough),
 *          NEVER declared by the LLM.
 *
 * Byte-equivalent to the Go authority; reuses the grammar / branchtree / candescend twins (single
 * source). Writes NO truth — the wall (§2): the result is the BesoinGraph to be appended via the EL15
 * MCP, never a kernel write.
 */

import {
	branchTree,
	classifyAltitude,
	isOffAltitude,
	type LevelBody,
	type OpenBranch,
	openBranches,
} from "./besoin-branchtree";
import { canDescend, type NodeInput, type Verdict } from "./besoin-candescend";
import {
	allLevels,
	isLevel,
	isSourceRung,
	type Level,
	levels,
	outgoingRef,
} from "./besoin-grammar";

export type Gesture = "grill" | "view" | "action" | "generic";

// dispatchTable is the CLOSED declared map of every grammar Level to the gesture the umbrella skill
// dispatches its dialogue to. Declared once (CLAUDE.md §8), never an LLM choice.
const DISPATCH_TABLE: Record<Level, Gesture> = {
	product: "grill",
	journey: "generic",
	view: "view",
	control: "action",
	action: "action",
	operation: "generic",
	entity: "generic",
	invariant: "generic",
	policy: "generic",
};

// dispatchOf returns the gesture a level's dialogue dispatches to. (generic,false) for an
// out-of-grammar level (fail-closed). Pure, total.
export function dispatchOf(level: string): { gesture: Gesture; ok: boolean } {
	if (!isLevel(level)) return { gesture: "generic", ok: false };
	return { gesture: DISPATCH_TABLE[level], ok: true };
}

export type AnswerRouting = "record" | "off_altitude" | "spike";

// The legal three-hop /spike route — idea_capture(draft) → idea_grill → idea_spike. The interview NEVER
// captures directly in "spiking" (idea_spike is an advance, not a capture). Declared, never invented.
export const SPIKE_GATE: readonly string[] = [
	"idea_capture",
	"idea_grill",
	"idea_spike",
];

export interface InterviewResult {
	level: Level;
	routing: AnswerRouting;
	verdict: Verdict;
	resolved: boolean;
	openBranches: OpenBranch[];
	spikeRoute: string[];
	blockReason: { code: string; explanation: string; howToFix: string[] } | null;
}

// enterableLevel computes the SOURCE rung the interview may currently work — the first rung (descent
// order) not yet `enough` under its declared metadata. A rung is enterable iff every rung above it is
// already enough (the forcing). COMPUTED via canDescend; null when the descent is complete. The
// `nodeOf` callback supplies each level's NodeInput; `metaComplete` whether its metadata certifies.
export function enterableLevel(
	nodeOf: (l: Level) => NodeInput,
	metaComplete: (l: Level) => boolean,
): Level | null {
	for (const l of levels()) {
		if (!canDescend(nodeOf(l), l, metaComplete(l)).enough) return l;
	}
	return null;
}

// recordAnswer is the deterministic recorder of one interview turn. The LLM has phrased the question
// and paraphrased the utterance into `body`; recordAnswer DECIDES the routing by CODE. PURE, TOTAL,
// DETERMINISTIC — the LLM never enters. `metaComplete` / `routeToSpike` are the EL04 verdict the screen
// passes (computed by certifyMetadata); `refsTo` is the resolved outgoing ref of the level (for the
// canDescend recompute).
export function recordAnswer(
	level: string,
	body: LevelBody,
	metaComplete: boolean,
	routeToSpike: boolean,
): InterviewResult {
	const b = body ?? {};

	if (!isLevel(level)) {
		return {
			level: level as Level,
			routing: "off_altitude",
			verdict: {
				enough: false,
				missing: [],
				openQuestions: [],
				blockReasons: [],
			},
			resolved: false,
			openBranches: [],
			spikeRoute: [],
			blockReason: {
				code: "BESOIN_NODE_ABSENT",
				explanation: `Le niveau « ${level} » n'est pas un rung de la grammaire (EL02) : rien à enregistrer.`,
				howToFix: ["use_a_grammar_level"],
			},
		};
	}

	// 1. OFF-ALTITUDE (EL12 schema-mismatch).
	if (isOffAltitude(level, b)) {
		const alt = classifyAltitude(b);
		let explanation = `La réponse ne satisfait pas le schéma du niveau « ${level} » (mismatch de champs déclaré, EL12) : elle n'est PAS enregistrée à ce niveau.`;
		const howToFix = ["answer_at_the_current_altitude"];
		if (alt.matched) {
			explanation += ` Elle ressemble au schéma du niveau « ${alt.best} ».`;
			howToFix.push(`or_open_level:${alt.best}`);
		}
		return {
			level,
			routing: "off_altitude",
			verdict: refusedVerdict(),
			resolved: false,
			openBranches: openBranches(branchTree(level, {})),
			spikeRoute: [],
			blockReason: {
				code: "BESOIN_BODY_VACANT_OR_MALFORMED",
				explanation,
				howToFix,
			},
		};
	}

	// 2. FUZZY → /spike.
	if (routeToSpike) {
		return {
			level,
			routing: "spike",
			verdict: refusedVerdict(),
			resolved: false,
			openBranches: openBranches(branchTree(level, b)),
			spikeRoute: [...SPIKE_GATE],
			blockReason: {
				code: "BESOIN_METADATA_INCOMPLETE",
				explanation:
					"La réponse est floue (verifiability unverifiable) : elle est routée vers /spike via idea_capture(draft) → idea_grill → idea_spike, JAMAIS une descente.",
				howToFix: ["route_to_spike", ...SPIKE_GATE],
			},
		};
	}

	// 3. RECORD. Recompute the EL07 verdict over the recorded body — `resolved` is COMPUTED, never
	//    declared.
	const ref = outgoingRef(level);
	const node: NodeInput = {
		level,
		body: b,
		refsTo: ref ? [ref.refTo] : [],
		present: true,
	};
	const verdict = canDescend(node, level, metaComplete);
	return {
		level,
		routing: "record",
		verdict,
		resolved: verdict.enough,
		openBranches: openBranches(branchTree(level, b)),
		spikeRoute: [],
		blockReason: null,
	};
}

function refusedVerdict(): Verdict {
	return { enough: false, missing: [], openQuestions: [], blockReasons: [] };
}

// dispatchableLevels returns every grammar level with its dispatched gesture (for the screen's panel).
// Pure, total.
export function dispatchableLevels(): { level: Level; gesture: Gesture }[] {
	return allLevels().map((level) => ({
		level,
		gesture: dispatchOf(level).gesture,
	}));
}

// isVerticalRung re-exports the source-rung predicate so the screen can mark which levels the vertical
// interview descends through (vs the transversal bands dialogued by /besoin-invariant, EL14).
export function isVerticalRung(level: string): boolean {
	return isSourceRung(level);
}
