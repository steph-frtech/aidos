/**
 * The ContextRouter twin — the Workbench /context-pack source (AIDOS step S33).
 *
 * KRD §141 ("trop de contexte détruit le contexte" — the compiler exists because overload makes
 * the agent invent) · §142 (the ContextGraph: nodes Layer|Mirror|Contract|MemoryRecord, the
 * derived live view) · §143 (the ContextPack: goal, branch, affected_layers, active_kernel,
 * boundaries, memory, skills, tools, stop_condition — "the antidote to context drift") · §144
 * (the ContextRouter — an ALGORITHM, not a prompt: red←red-set(goal); affected_subgraph; include
 * load-bearing kernel + red mirrors + crossed PUBLIC contracts + scoped memory ≥ repeated;
 * exclude cosmetic/stale/out-of-scope; emit pack + hash) · §119.3 (Progressive Disclosure —
 * forbidden: [stale, out_of_scope, unapproved]) · §145 (the bounded ContextMap).
 *
 * This module is the DECLARED projection of the Go package back/runtime/context — the same
 * minimal cut, the same inclusion/exclusion rules, the same wall-as-boundary, reusing the same
 * exclusion-reason taxonomy. One source, no drift; /context-pack renders exactly what Compile
 * computes.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no
 * I/O, no LLM — so the same (goal, branch, graph) always yields the same pack. The router is an
 * ALGORITHM, never a prompt and never a RAG. The reproducibility mirror lib/context-pack.test.ts
 * (fast-check) pins determinism, minimality, the staleness/scope exclusion, wall-as-boundary, and
 * branch-no-leak.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /context-pack PROJECTS the compiled pack; it
 * never writes truth and the pack it renders ALWAYS forbids /kernel/** and /mirror/**. The router
 * reads the ContextGraph view; truth-writes go via propose → ChangeSet → approval, never a screen.
 */

/** A MemoryRecord's declared confidence tier (KRD §119/§144). Memory arrives PRE-SCORED. */
export type Confidence = "once" | "repeated" | "established";

/** Whether a confidence meets the inclusion threshold (≥ repeated, KRD §144). */
export function atLeastRepeated(c: Confidence): boolean {
	const rank: Record<Confidence, number> = {
		once: 1,
		repeated: 2,
		established: 3,
	};
	return (rank[c] ?? 0) >= rank.repeated;
}

/** The pack memory section a record routes to (KRD §143). */
export type MemoryKind = "lesson" | "incident" | "glossary";

/** The CLOSED set of WHY a node was kept out of the pack (KRD §119.3, §145). */
export type ExclusionReason =
	| "cross-BC"
	| "stale"
	| "out-of-scope"
	| "unapproved"
	| "cosmetic-below-threshold";

/** A kernel/source node (§142). */
export interface Layer {
	id: string;
	boundedContext: string;
	branch: string;
	loadBearing: boolean;
}

/** A mirror node (§142). Red = currently defines a stop condition. */
export interface Mirror {
	id: string;
	boundedContext: string;
	red: boolean;
}

/** A cross-cell contract node (§142). Public crosses the BC boundary; internal never does. */
export interface Contract {
	id: string;
	boundedContext: string;
	public: boolean;
}

/** A scored memory node (§142/§144) — arrives PRE-SCORED; the router only FILTERS it. */
export interface MemoryRecord {
	id: string;
	kind: MemoryKind;
	scope: string;
	confidence: Confidence;
	stale: boolean;
	approved: boolean;
}

/** The red goal the pack is compiled for (§143). redSet is the S22 red-set, REUSED. */
export interface Goal {
	id: string;
	boundedContext: string;
	redSet: string[];
	allowedPaths: string[];
}

/** The read-only ContextGraph view the router compiles over (§142). */
export interface ContextGraph {
	layers: Layer[];
	mirrors: Mirror[];
	contracts: Contract[];
	memory: MemoryRecord[];
	skills: string[];
	tools: string[];
}

export interface ActiveKernel {
	mirrors: string[];
	invariants: string[];
	contracts: string[];
}

export interface Boundaries {
	boundedContext: string;
	allowedPaths: string[];
	forbiddenPaths: string[];
}

export interface PackMemory {
	relevantLessons: string[];
	recentIncidents: string[];
	glossaryTerms: string[];
}

export interface Excluded {
	id: string;
	reason: ExclusionReason;
}

/** The compiled, minimal, branch-aware ContextPack (KRD §143). Content-addressed (hash). */
export interface ContextPack {
	goal: string;
	branch: string;
	affectedLayers: string[];
	activeKernel: ActiveKernel;
	boundaries: Boundaries;
	memory: PackMemory;
	skills: string[];
	tools: string[];
	stopCondition: string;
	excluded: Excluded[];
	hash: string;
}

/** The wall paths every pack forbids (KRD §2 rendered as a boundary). */
export const WALL_FORBIDDEN_PATHS = ["/kernel/**", "/mirror/**"];

/** The canonical stop condition every pack carries (§143, §8). */
export const STOP_CONDITION =
	"red_set_green AND previous_green_intact AND aggregate_complete";

function has(xs: string[], x: string): boolean {
	return xs.includes(x);
}

/** A small deterministic FNV-1a-ish hash over the canonical JSON (a content address, not crypto).
 * It mirrors the Go pack's content-addressing intent: same pack content ⇒ same hash. The Go side
 * uses SHA-256; this twin only needs a STABLE, deterministic id for the UI to display + replay. */
function contentHash(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * compile is the ContextRouter twin (KRD §144) — the PURE deterministic pipeline. Same
 * (goal, branch, graph) ⇒ identical pack and identical hash. It mirrors back/runtime/context.Compile
 * rule-for-rule: minimality (only red-set, load-bearing, same-BC layers), red mirrors define the
 * stop condition, a neighbor BC crosses ONLY via its PUBLIC contract, memory is scope/confidence/
 * staleness/approval filtered, and the wall is forbidden on every pack.
 */
export function compile(
	goal: Goal,
	branch: string,
	graph: ContextGraph,
): ContextPack {
	const excluded: Excluded[] = [];

	// affected_layers — red-set, branch-fenced, BC-fenced, load-bearing.
	const affected: string[] = [];
	for (const l of graph.layers) {
		if (l.branch !== "" && l.branch !== branch) continue; // branch-no-leak
		if (!has(goal.redSet, l.id)) continue; // minimality
		if (l.boundedContext !== "" && l.boundedContext !== goal.boundedContext) {
			excluded.push({ id: l.id, reason: "cross-BC" });
			continue;
		}
		if (!l.loadBearing) {
			excluded.push({ id: l.id, reason: "cosmetic-below-threshold" });
			continue;
		}
		affected.push(l.id);
	}
	for (const l of graph.layers) {
		if (has(goal.redSet, l.id)) continue;
		if (l.branch !== "" && l.branch !== branch) continue;
		if (l.boundedContext !== "" && l.boundedContext !== goal.boundedContext) {
			excluded.push({ id: l.id, reason: "cross-BC" });
			continue;
		}
		excluded.push({ id: l.id, reason: "cosmetic-below-threshold" });
	}
	affected.sort();

	// active_kernel.mirrors — red mirrors define the stop condition; neighbor-BC out.
	const mirrors: string[] = [];
	for (const m of graph.mirrors) {
		if (m.boundedContext !== "" && m.boundedContext !== goal.boundedContext) {
			excluded.push({ id: m.id, reason: "cross-BC" });
			continue;
		}
		mirrors.push(m.id);
	}
	mirrors.sort();

	// active_kernel.contracts — goal-BC contracts + neighbor crossed PUBLIC contract.
	const contracts: string[] = [];
	for (const c of graph.contracts) {
		if (c.boundedContext === "" || c.boundedContext === goal.boundedContext) {
			contracts.push(c.id);
			continue;
		}
		if (c.public) {
			contracts.push(c.id);
			continue;
		}
		excluded.push({ id: c.id, reason: "cross-BC" });
	}
	contracts.sort();

	// memory — scope overlap ∧ confidence ≥ repeated ∧ not stale ∧ approved (§119.3).
	const lessons: string[] = [];
	const incidents: string[] = [];
	const glossary: string[] = [];
	for (const r of graph.memory) {
		if (r.stale) {
			excluded.push({ id: r.id, reason: "stale" });
			continue;
		}
		if (!r.approved) {
			excluded.push({ id: r.id, reason: "unapproved" });
			continue;
		}
		if (r.scope !== "" && r.scope !== goal.boundedContext) {
			excluded.push({ id: r.id, reason: "out-of-scope" });
			continue;
		}
		if (!atLeastRepeated(r.confidence)) {
			excluded.push({ id: r.id, reason: "cosmetic-below-threshold" });
			continue;
		}
		if (r.kind === "incident") incidents.push(r.id);
		else if (r.kind === "glossary") glossary.push(r.id);
		else lessons.push(r.id);
	}
	lessons.sort();
	incidents.sort();
	glossary.sort();

	excluded.sort((a, b) =>
		a.id !== b.id ? (a.id < b.id ? -1 : 1) : a.reason < b.reason ? -1 : 1,
	);

	const pack: ContextPack = {
		goal: goal.id,
		branch,
		affectedLayers: affected,
		activeKernel: { mirrors, invariants: [], contracts },
		boundaries: {
			boundedContext: goal.boundedContext,
			allowedPaths: [...goal.allowedPaths],
			forbiddenPaths: [...WALL_FORBIDDEN_PATHS],
		},
		memory: {
			relevantLessons: lessons,
			recentIncidents: incidents,
			glossaryTerms: glossary,
		},
		skills: [...graph.skills].sort(),
		tools: [...graph.tools].sort(),
		stopCondition: STOP_CONDITION,
		excluded,
		hash: "",
	};
	pack.hash = contentHash(JSON.stringify({ ...pack, hash: "" }));
	return pack;
}
