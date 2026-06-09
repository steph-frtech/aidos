/**
 * The caused_by causal-edge projection — the Workbench /caused-by source (AIDOS step FK12).
 *
 * FKE-35.1 / ROADMAP FK12: the SEVENTH versioned link kind — the BACKWARD CAUSAL edge, the
 * inverse of the forward red-wave `impacts`/staleness propagation (S22 redwave, KRD §42). It is
 * ADDITIVE to the six S17 §41 kinds (projects_to / derives_from / contracts_with / triggers /
 * binds / mirrors) — it sits beside them (anti-overwrite §9). `A caused_by B` means B is a
 * candidate CAUSE of A's redness; Trace walks UPWARD from a red symptom to its candidate causes
 * — the substrate the WhyTree (FK13) builds on.
 *
 * This module is the DECLARED projection of the Go package back/kernel/causedby — the same
 * Validate, the same deterministic upward BFS, the same cycle-refusal, the same content-addressed
 * round-trip — so the /caused-by panel traces and colours exactly as the Go Trace computes. One
 * source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (symptom, edges) always yields the same ordered CauseChain (or the same cycle
 * error). The reproducibility mirror lib/caused-by.test.ts (fast-check) pins determinism,
 * chain==reachable-set, nearest-first order, cycle-refusal, and the content-addressed round-trip.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /caused-by TRACES the graph; it never writes
 * truth. A new caused_by row goes via propose → ChangeSet → approval, never from this screen.
 */

/** A PINNED layer reference: an id plus the concrete version it points at (id@version). */
export interface Ref {
	id: string;
	version: string;
}

/** isPinned reports whether both id and version are non-empty (mirrors links.Ref.IsPinned). */
export function isPinned(r: Ref): boolean {
	return r.id !== "" && r.version !== "";
}

/** refString renders the canonical "id@version" form. */
export function refString(r: Ref): string {
	return `${r.id}@${r.version}`;
}

/** The caused_by link-kind discriminator (the seventh kind, mirrors causedby.Kind). */
export const CAUSED_BY_KIND = "caused_by" as const;

/**
 * A caused_by causal edge: From (the symptom/effect) is caused by To (a candidate cause). Both
 * ends are PINNED id@version refs. Mirrors causedby.Edge.
 */
export interface Edge {
	from: Ref;
	to: Ref;
}

/** The verdict of Trace: the symptom plus the ordered candidate-cause ids. Mirrors causedby.CauseChain. */
export interface CauseChain {
	symptom: string;
	causes: string[];
}

/** The closed set of validation error codes (mirrors the causedby.Err* sentinels). */
export type ValidationError =
	| "UNPINNED_FROM"
	| "UNPINNED_TO"
	| "SELF_CAUSE"
	| null;

/**
 * validate is the PURE shape guard of a caused_by edge (mirrors causedby.Validate): from/to must
 * be pinned id@version refs and from.id != to.id (a node cannot cause itself). Returns null when
 * valid, else the closed error code. Total, never throws.
 */
export function validate(e: Edge): ValidationError {
	if (!isPinned(e.from)) return "UNPINNED_FROM";
	if (!isPinned(e.to)) return "UNPINNED_TO";
	if (e.from.id === e.to.id) return "SELF_CAUSE";
	return null;
}

/** The sentinel thrown / returned when Trace hits a cycle reachable from the symptom. */
export const ERR_CYCLE = "CAUSED_BY_CYCLE" as const;

/** Trace's result: either a CauseChain or the cycle error (a discriminated union). */
export type TraceResult =
	| { ok: true; chain: CauseChain }
	| { ok: false; error: typeof ERR_CYCLE };

/**
 * trace is the PURE deterministic UPWARD traversal of the caused_by graph (mirrors causedby.Trace):
 * from `symptom`, follow every caused_by edge From == node to its To (candidate cause), breadth-
 * first, collecting candidate causes ordered nearest-first (hop distance asc) then by id.
 *   - DETERMINISTIC — edges visited in given order, each node at its SHORTEST distance, final
 *     chain sorted (distance asc, id asc). Same (symptom, edges) ⇒ byte-identical chain.
 *   - TOTAL — a malformed edge (validate != null) is SKIPPED, the rest is still traced; never throws.
 *   - CYCLE-REFUSING — a caused_by cycle reachable from the symptom ⇒ { ok:false, ERR_CYCLE }
 *     (never a partial chain). A cycle unreachable from the symptom does not poison the trace.
 */
export function trace(symptom: string, edges: readonly Edge[]): TraceResult {
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (validate(e) !== null) continue;
		const arr = adj.get(e.from.id);
		if (arr === undefined) adj.set(e.from.id, [e.to.id]);
		else arr.push(e.to.id);
	}

	// cycle detection over the reachable subgraph (white/grey/black DFS).
	const WHITE = 0;
	const GREY = 1;
	const BLACK = 2;
	const color = new Map<string, number>();
	const hasCycle = (node: string): boolean => {
		color.set(node, GREY);
		for (const c of adj.get(node) ?? []) {
			const cc = color.get(c) ?? WHITE;
			if (cc === GREY) return true;
			if (cc === WHITE && hasCycle(c)) return true;
		}
		color.set(node, BLACK);
		return false;
	};
	if (hasCycle(symptom)) return { ok: false, error: ERR_CYCLE };

	// deterministic BFS recording each node at its shortest hop distance.
	const dist = new Map<string, number>([[symptom, 0]]);
	let frontier = [symptom];
	while (frontier.length > 0) {
		const next: string[] = [];
		for (const node of frontier) {
			for (const c of adj.get(node) ?? []) {
				if (dist.has(c)) continue;
				dist.set(c, (dist.get(node) ?? 0) + 1);
				next.push(c);
			}
		}
		frontier = next;
	}

	const keys: { id: string; dist: number }[] = [];
	for (const [id, d] of dist) {
		if (id === symptom) continue;
		keys.push({ id, dist: d });
	}
	keys.sort((a, b) => {
		if (a.dist !== b.dist) return a.dist - b.dist;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return { ok: true, chain: { symptom, causes: keys.map((k) => k.id) } };
}

/**
 * serializeEdgeBody renders the canonical kernel.link body of a caused_by edge — the same shape
 * the Go SerializeEdgeBody produces, with object keys the records canonicaliser will sort. The
 * /caused-by panel shows this body to make the content-addressing concrete. Mirrors
 * causedby.SerializeEdgeBody.
 */
export function serializeEdgeBody(e: Edge): string {
	return JSON.stringify({
		kind: "link",
		link_kind: CAUSED_BY_KIND,
		from: e.from,
		to: e.to,
	});
}
