/**
 * The compositional-truth aggregate projection — the Workbench /truth-tree source (AIDOS step S18).
 *
 * KRD §108 (composes, the 7th link — mereology: a whole contains a part, versioned + weighted
 * load-bearing|cosmetic) · §109 (aggregate_complete(L) := own_mirror(L)==GREEN ∧ ∀ child via
 * composes(L) : aggregate_complete(c)) · §110 (drill-down / fall-back-up) · §112 (weighted,
 * thresholded activation — a cosmetic change below the DECLARED activation_threshold does NOT
 * reopen the parent's emergent invariant; weights/thresholds are declared, never learned).
 *
 * This module is the DECLARED projection of the Go package back/kernel/composes — the same §109
 * recursive law, the same §112 activation — so the /truth-tree panel colours each node exactly as
 * the Go Aggregate computes it. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O
 * — so the same (tree, root) always yields the same verdict + drill-down path. The reproducibility
 * mirror lib/truth-tree.test.ts (fast-check) pins the law at every node, monotone reddening,
 * cosmetic isolation, totality, and the cycle guard.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /truth-tree renders the recursive verdict; it never
 * writes truth (the wall). Truth-writes (a composes edge, a declared threshold) go via propose →
 * ChangeSet → approval, never from this screen.
 */

/** The DECLARED weight of a composes edge (KRD §112) — the closed two-set. */
export type Weight = "load-bearing" | "cosmetic";

/** A node's aggregate (or own_mirror) verdict — the closed two-set. */
export type Verdict = "GREEN" | "RED";

/** A PINNED layer reference: an id plus the concrete version it points at (id@version). */
export interface Ref {
	id: string;
	version: string;
}

/** The 7th KRD §108 link as a value: parent composes child, version-pinned, weighted. */
export interface Composes {
	parent: Ref;
	child: Ref;
	weight: Weight;
}

/** The minimal read-model of a kernel.layer the aggregate needs (mirrors composes.Node). */
export interface Node {
	layerId: string;
	version: string;
	ownMirror: Verdict;
	activationThreshold: number;
}

/** The composes DAG + per-node own_mirror verdicts + the changed children (mirrors composes.Tree). */
export interface Tree {
	nodes: Record<string, Node>;
	edges: readonly Composes[];
	changed?: readonly string[];
}

/** One node on the drill-down path (KRD §110). */
export interface PathStep {
	layerId: string;
	version: string;
	ownMirror: Verdict;
	aggregate: Verdict;
}

/** Aggregate's output: the recursive verdict + the drill-down path naming the chain to the red child. */
export interface Result {
	verdict: Verdict;
	drillDown: PathStep[];
}

/** A typed cycle error (KRD §82: an OpenQuestion made explicit, never an infinite recursion). */
export interface CycleError {
	cycle: string[];
}

/** weightValue maps a declared weight to its §112 activation contribution (load-bearing 1, cosmetic 0). */
export function weightValue(w: Weight): number {
	return w === "load-bearing" ? 1.0 : 0.0;
}

/** childrenOf — the declared composes edges whose parent is `id`, in stable child-id order. */
function childrenOf(t: Tree, id: string): Composes[] {
	return t.edges
		.filter((e) => e.parent.id === id)
		.sort((a, b) =>
			a.child.id < b.child.id ? -1 : a.child.id > b.child.id ? 1 : 0,
		);
}

/**
 * aggregate — the recursive compositional-truth verdict at `rootId` (KRD §109), mirroring
 * composes.Aggregate: GREEN ⟺ own_mirror(root)==GREEN ∧ ∀ child via composes(root) :
 * aggregate(child)==GREEN. A red own mirror, or ANY composes-child whose aggregate is RED,
 * reddens the parent. Returns the drill-down path (KRD §110) down to the red child. On a cycle it
 * throws a typed CycleError (never recurses forever, never invents an edge). Pure + total on a DAG.
 */
export function aggregate(t: Tree, rootId: string): Result {
	return aggregateRec(t, rootId, new Set<string>());
}

function aggregateRec(t: Tree, id: string, onPath: Set<string>): Result {
	if (onPath.has(id)) {
		const err: CycleError = { cycle: [...onPath, id].sort() };
		throw err;
	}
	const node = t.nodes[id];
	if (node === undefined) {
		// a declared edge points at an absent layer: treat as RED (a dangling part is unprovable).
		return {
			verdict: "RED",
			drillDown: [
				{ layerId: id, version: "", ownMirror: "RED", aggregate: "RED" },
			],
		};
	}

	onPath.add(id);
	let verdict: Verdict = node.ownMirror; // a red own mirror reddens regardless of children
	let redChildPath: PathStep[] | null = null;
	for (const edge of childrenOf(t, id)) {
		const childRes = aggregateRec(t, edge.child.id, onPath);
		if (childRes.verdict === "RED") {
			verdict = "RED";
			if (redChildPath === null) redChildPath = childRes.drillDown;
		}
	}
	onPath.delete(id);

	const step: PathStep = {
		layerId: node.layerId,
		version: node.version,
		ownMirror: node.ownMirror,
		aggregate: verdict,
	};
	if (verdict === "GREEN") return { verdict: "GREEN", drillDown: [step] };
	return { verdict: "RED", drillDown: [step, ...(redChildPath ?? [])] };
}

/** isCycleError — narrows an unknown thrown value to a typed CycleError. */
export function isCycleError(e: unknown): e is CycleError {
	return (
		typeof e === "object" &&
		e !== null &&
		Array.isArray((e as CycleError).cycle)
	);
}

/**
 * activation — the §112 activation of a composite: Σ weight(changed children) over the declared
 * composes edges whose child is in the tree's `changed` set. Cosmetic children contribute 0.
 */
export function activation(t: Tree, parentId: string): number {
	const changed = new Set(t.changed ?? []);
	return childrenOf(t, parentId)
		.filter((e) => changed.has(e.child.id))
		.reduce((sum, e) => sum + weightValue(e.weight), 0);
}

/**
 * reopensOnChange — true iff activation(parent) ≥ the parent's DECLARED activation_threshold (a
 * positive threshold is the declared gate; a zero threshold means "any load-bearing change
 * reopens"). A cosmetic change below threshold returns false — "épingle un défaut, pas un
 * changement". This is the change-signal S19's weighted propagation consumes; it is independent of
 * the §109 verdict.
 */
export function reopensOnChange(t: Tree, parentId: string): boolean {
	const node = t.nodes[parentId];
	if (node === undefined) return false;
	if (node.activationThreshold <= 0) return activation(t, parentId) > 0;
	return activation(t, parentId) >= node.activationThreshold;
}
