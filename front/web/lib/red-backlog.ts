/**
 * lib/red-backlog.ts — the TYPESCRIPT TWIN of the EL17 RedBacklog(graph) → BacklogItem[]
 * (back/runtime/besoin/red_backlog.go). The Go function is the AUTHORITY; this twin lets the
 * /red-backlog Workbench panel topo-sort a graph's emitted Ideas into the architectural promotion
 * order BYTE-EQUIVALENTLY, without a backend round-trip.
 *
 * THE RULE (ROADMAP EL17):
 *   - redBacklog topo-sorts the emitted Ideas (the MAPPING rungs, EL16) along the constrains/seeds
 *     edges → the EXACT promotion order S64 opens its /goal in (the §23 verticale). TOTAL +
 *     DETERMINISTIC: every emitted Idea appears exactly once; same graph → same ordered list.
 *   - A cycle over the emitting rungs is REFUSED (BESOIN_CYCLE) — never an arbitrary order.
 *   - NoEmit rungs (journey/view/invariant) appear in anchorsAbove[] but NEVER in the list.
 *   - The mirror FORM is ANNEXED (levelMirrorForm, EL10) — never written (the wall; the mirror stays
 *     to the user via /goal).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the topo sort is a PURE algorithm (Kahn over the emitting rungs,
 * ties broken by the declared descent rank → a TOTAL order), never an LLM ordering the backlog. The
 * reproducibility mirror (red-backlog.test.ts) pins same-input → same-output.
 */

import { type Anchor, anchorsAbove, type CascadeNode } from "./besoin-cascade";
import { levelMirrorForm, type MirrorForm } from "./besoin-completeness";
import { allLevels, type Level } from "./besoin-grammar";
import { levelToProposes } from "./besoin-proposes";

// Edge is a directed constrains/seeds edge of the BesoinGraph topology (EL03).
export interface Edge {
	from: Level;
	to: Level;
	kind: "constrains" | "seeds";
}

// RefStatus is the @version resolution status of a backlog item's outgoing ref.
export interface RefStatus {
	field: string;
	to: Level;
	resolved: boolean;
}

// BacklogItem is one ordered entry: the projected Idea's rung, its mirror form (annexed), its
// anchors_above (NoEmit rungs included), and its @version ref resolution + carried OpenQuestions.
export interface BacklogItem {
	proposes: string;
	intent: string;
	provenance: { source: "human"; detail: string };
	status: "draft";
	fromLevel: Level;
	mirrorForm: MirrorForm;
	anchorsAbove: Anchor[];
	resolvedRefs: RefStatus[];
	unresolvedRefs: RefStatus[];
	openQuestions: string[];
}

// BacklogNode is the node shape the twin reads: level, status, the verbatim utterance, the resolved
// outgoing refs, the body (for anchors), and any carried OpenQuestions.
export interface BacklogNode {
	level: Level;
	status: "empty" | "drafting" | "resolved";
	utterance: string;
	refs: { field: string; to: Level }[];
	body?: Record<string, unknown>;
	openQuestions?: string[];
}

// BESOIN_CYCLE is the closed refusal code when the emitting rungs form a cycle.
export const BESOIN_CYCLE = "BESOIN_CYCLE" as const;

// CycleError is the typed BESOIN_CYCLE refusal.
export class CycleError extends Error {
	readonly code = BESOIN_CYCLE;
	readonly cycle: Level[];
	constructor(cycle: Level[]) {
		super(
			`besoin: red-backlog: the emitting rungs form a cycle (${cycle.join(",")}) — no total topological order (${BESOIN_CYCLE})`,
		);
		this.cycle = cycle;
		this.name = "CycleError";
	}
}

// descentRank returns the declared total rank of a level (SOURCE rungs by descent index, bands after).
function descentRank(level: Level): number {
	const i = allLevels().indexOf(level);
	return i < 0 ? allLevels().length : i;
}

// sortByRank sorts levels by descent rank then by string — a TOTAL deterministic order (the tie-break).
function sortByRank(ls: Level[]): Level[] {
	return [...ls].sort((a, b) => {
		const ra = descentRank(a);
		const rb = descentRank(b);
		if (ra !== rb) return ra - rb;
		return a < b ? -1 : a > b ? 1 : 0;
	});
}

/**
 * redBacklog topo-sorts the emitted Ideas (the resolved MAPPING rungs) along the constrains/seeds edges
 * into the architectural promotion order. PURE, TOTAL, DETERMINISTIC. Throws a CycleError (BESOIN_CYCLE)
 * when the edges over the emitting rungs form a cycle. Annexes the mirror form, never writes it.
 */
export function redBacklog(nodes: BacklogNode[], edges: Edge[]): BacklogItem[] {
	// 1. The emitting rungs (resolved + mapping) and their Idea sketches.
	const emitting = new Set<Level>();
	const byLevel = new Map<Level, BacklogNode>();
	for (const n of nodes) {
		byLevel.set(n.level, n);
		if (n.status !== "resolved") continue;
		const m = levelToProposes(n.level);
		if (m.kind === "emit" && m.proposes) emitting.add(n.level);
	}

	// 2. Topologically sort the emitting rungs (Kahn, deterministic tie-break by descent rank).
	const order = topoSortEmitting(emitting, edges);

	// 3. Build the ordered items, annexing anchors_above + mirror form + @version ref resolution.
	const cascadeNodes: CascadeNode[] = nodes.map((n) => ({
		level: n.level,
		body: n.body ?? {},
		status: n.status,
		refsTo: n.refs.map((r) => r.to),
	}));
	const out: BacklogItem[] = [];
	for (const level of order) {
		const node = byLevel.get(level);
		if (!node) continue;
		const form = levelMirrorForm(level);
		if (!form) continue; // total over the 9 grammar levels; emitting rungs always have one.
		const { resolved, unresolved, openQuestions } = resolveItemRefs(
			node,
			byLevel,
		);
		const m = levelToProposes(level);
		out.push({
			proposes: m.proposes ?? "",
			intent: node.utterance,
			provenance: { source: "human", detail: node.utterance },
			status: "draft",
			fromLevel: level,
			mirrorForm: form,
			anchorsAbove: anchorsAbove(cascadeNodes, level),
			resolvedRefs: resolved,
			unresolvedRefs: unresolved,
			openQuestions,
		});
	}
	return out;
}

// topoSortEmitting runs Kahn's algorithm over the emitting rungs, using the constrains/seeds edges that
// connect two emitting rungs as the precedence relation. Ties broken by descent rank → a TOTAL order.
// A remaining set after the queue drains = a cycle → throws CycleError. Pure.
function topoSortEmitting(emitting: Set<Level>, edges: Edge[]): Level[] {
	const adj = new Map<Level, Level[]>();
	const indeg = new Map<Level, number>();
	for (const l of emitting) indeg.set(l, 0);
	const seen = new Set<string>();
	for (const e of edges) {
		if (!emitting.has(e.from) || !emitting.has(e.to)) continue;
		if (e.from === e.to) throw new CycleError([e.from]); // self-loop.
		const key = `${e.from}->${e.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
		indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
	}

	let ready = sortByRank(
		[...emitting].filter((l) => (indeg.get(l) ?? 0) === 0),
	);
	const order: Level[] = [];
	while (ready.length > 0) {
		const cur = ready[0];
		ready = ready.slice(1);
		order.push(cur);
		let newly = false;
		for (const to of sortByRank(adj.get(cur) ?? [])) {
			indeg.set(to, (indeg.get(to) ?? 0) - 1);
			if ((indeg.get(to) ?? 0) === 0) {
				ready.push(to);
				newly = true;
			}
		}
		if (newly) ready = sortByRank(ready);
	}

	if (order.length !== emitting.size) {
		const placed = new Set(order);
		const remaining = sortByRank([...emitting].filter((l) => !placed.has(l)));
		throw new CycleError(remaining);
	}
	return order;
}

// resolveItemRefs classifies a node's outgoing refs by @version resolution: resolved iff the targeted
// deeper rung exists as a RESOLVED node; otherwise a dangling forward-dep carried as a non-blocking
// OpenQuestion (bootstrap §6 — never dropped). Pure, total.
function resolveItemRefs(
	node: BacklogNode,
	byLevel: Map<Level, BacklogNode>,
): { resolved: RefStatus[]; unresolved: RefStatus[]; openQuestions: string[] } {
	const resolved: RefStatus[] = [];
	const unresolved: RefStatus[] = [];
	const openQuestions: string[] = [...(node.openQuestions ?? [])];
	for (const r of node.refs) {
		const target = byLevel.get(r.to);
		const isResolved = target?.status === "resolved";
		const st: RefStatus = { field: r.field, to: r.to, resolved: isResolved };
		if (isResolved) {
			resolved.push(st);
		} else {
			unresolved.push(st);
			openQuestions.push(
				`ref "${r.field}" (${node.level}→${r.to}) ne résout pas @version : le niveau cible n'existe pas encore (forward-dep portée, bootstrap §6 — non bloquant)`,
			);
		}
	}
	openQuestions.sort();
	return { resolved, unresolved, openQuestions };
}

/** backlogCount returns the depth of the backlog (the count authority the panel renders). Pure. */
export function backlogCount(nodes: BacklogNode[], edges: Edge[]): number {
	try {
		return redBacklog(nodes, edges).length;
	} catch {
		return 0; // a cycle has no backlog.
	}
}
