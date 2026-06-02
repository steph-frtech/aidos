/**
 * The version DAG — the Workbench /version-dag source (AIDOS step S24).
 *
 * KRD §120–§125: the version space is a DAG, not a line. NODES are stable phases (S23,
 * content-addressed) and EDGES are ChangeSets (S20). The THREE §121 navigation moves —
 *   - branch          (open an ALTERNATIVE line of truth from a stable phase),
 *   - checkoutAncestor (make a prior stable phase the current head — a BACKWARD head-flag move),
 *   - rebranch        (from a recheckout-ed ancestor, open a NEW line)
 * — grow the DAG APPEND-ONLY with a MUTABLE head. Nothing is ever destroyed: an abandoned line stays
 * in the DAG as a stepping stone (§123). A node may have ≥1 parents (a DAG, not a tree). The DAG may
 * hold SEVERAL parallel heads — one branch stable while another is in flux (§125). The waterline
 * stratifies nodes (§124): `above` = human truth, `below` = evolutionary variants.
 *
 * This module is the DECLARED projection of the Go package back/archive/dag — the SAME append-only
 * semantics, the same head-flag-move checkout, the same rebranch-parents-on-ancestor — so the
 * /version-dag panel animates the moves EXACTLY as the Go Branch/CheckoutAncestor/Rebranch / the dag
 * MCP compute them. One semantics, no drift. (The front-end uses a deterministic local node id so it
 * can animate a move offline; the authoritative content-addressed id is the Go records.Hash, surfaced
 * via dag_get when wired — OpenQuestion OQ-S24-1, a by-design forward dependency.)
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (dag, command) always yields the same (dag, event). The reproducibility mirror
 * lib/version-dag.test.ts (fast-check) pins append-only growth, the no-cycle invariant, the
 * head-flag-move checkout, rebranch-parents-on-ancestor, and parallel heads.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /version-dag PROJECTS the DAG and animates the
 * moves; recording a node/edge into dag.node/dag.edge goes via the `aidos` writer role through the
 * `dag` MCP, never from this screen.
 */

/** The waterline placement of a node (§124), mirrors dag.Stratum. */
export type Stratum = "above" | "below";

/** A version-DAG node (a stable phase, S23), mirrors dag.Node. */
export interface DagNode {
	id: string;
	parentIds: string[];
	head: boolean;
	stratum: Stratum;
	label: string;
}

/** A version-DAG edge (a ChangeSet, S20), mirrors dag.Edge. */
export interface DagEdge {
	from: string;
	to: string;
	changeset: string;
}

/** A version DAG value (nodes + edges), mirrors dag.DAG. */
export interface Dag {
	nodes: DagNode[];
	edges: DagEdge[];
}

/** The closed set of events a §121 move emits, mirrors dag.MovementEvent. */
export type MovementEvent = "Branched" | "HeadMoved" | "Rebranched";

/** The result of a move: the new DAG, the event, and (for branch/rebranch) the new node id. */
export interface MoveResult {
	dag: Dag;
	event: MovementEvent;
	newNode?: string;
	/** A pure refusal (unknown phase): the move did nothing. */
	blocked?: boolean;
	reason?: string;
}

/** node returns the node with id, or null. */
export function node(d: Dag, id: string): DagNode | null {
	return d.nodes.find((n) => n.id === id) ?? null;
}

/** heads returns the current heads (possibly several parallel lines, §125), in insertion order. */
export function heads(d: Dag): DagNode[] {
	return d.nodes.filter((n) => n.head);
}

/**
 * ancestors returns the ids `id` transitively descends from (its parents, grandparents, …),
 * following parentIds. The node itself is NOT included. Cycle-safe.
 */
export function ancestors(d: Dag, id: string): string[] {
	const seen = new Set<string>();
	const order: string[] = [];
	const walk = (cur: string): void => {
		const n = node(d, cur);
		if (!n) return;
		for (const p of n.parentIds) {
			if (seen.has(p)) continue;
			seen.add(p);
			order.push(p);
			walk(p);
		}
	};
	walk(id);
	return order;
}

/**
 * isReachable reports whether `to` is reachable from `from` upward via parentIds (`from` is an
 * ancestor of `to`). Irreflexive on a node's own back-edge (a node does not reach itself trivially).
 */
export function isReachable(d: Dag, from: string, to: string): boolean {
	if (from === to) return false;
	return ancestors(d, to).includes(from);
}

/** forwardReachable returns the descendant ids of `start` (children, grandchildren, …). Cycle-safe. */
function forwardReachable(d: Dag, start: string): Set<string> {
	const out = new Set<string>();
	const walk = (cur: string): void => {
		for (const n of d.nodes) {
			if (n.parentIds.includes(cur) && !out.has(n.id)) {
				out.add(n.id);
				walk(n.id);
			}
		}
	};
	walk(start);
	return out;
}

/**
 * newNodeId computes a deterministic local id for a new line (parents + stratum + label). It mirrors
 * the SHAPE of the Go records.Hash body (kind + parent_ids + stratum + label) but uses a readable
 * local digest so the panel can animate a move offline. The authoritative content address is the Go
 * hash (surfaced via dag_get). Deterministic: the same inputs yield the same id.
 */
function newNodeId(
	parentIds: string[],
	stratum: Stratum,
	label: string,
): string {
	const body = JSON.stringify({
		kind: "phase",
		parentIds: [...parentIds].sort(),
		stratum,
		label,
	});
	let h = 0;
	for (let i = 0; i < body.length; i++) {
		h = (Math.imul(31, h) + body.charCodeAt(i)) | 0;
	}
	return `n${(h >>> 0).toString(16)}`;
}

/**
 * withNewLine is the shared append-only primitive for branch and rebranch: it appends a new node
 * (parented on `from`, inheriting from's stratum) and a new edge (the S20 ChangeSet) WITHOUT deleting
 * anything. `clearHead` controls whether `from`'s head flag is cleared. The new node is always a head.
 */
function withNewLine(
	d: Dag,
	from: string,
	label: string,
	changeset: string,
	clearHead: boolean,
): { dag: Dag; newNode: string } | null {
	const parent = node(d, from);
	if (!parent) return null;
	const id = newNodeId([from], parent.stratum, label);
	const nodes = d.nodes.map((n) =>
		clearHead && n.id === from ? { ...n, head: false } : { ...n },
	);
	nodes.push({
		id,
		parentIds: [from],
		head: true,
		stratum: parent.stratum,
		label,
	});
	const edges = [...d.edges, { from, to: id, changeset }];
	return { dag: { nodes, edges }, newNode: id };
}

/**
 * branch opens an ALTERNATIVE line of truth from the stable phase `from` (§121). If `from` was a
 * head, the head MOVES to the new node; if `from` was an inner ancestor, the prior head stays a head
 * — yielding TWO parallel lines of truth (§125). The from-node is NEVER deleted (append-only).
 */
export function branch(
	d: Dag,
	from: string,
	label: string,
	changeset: string,
): MoveResult {
	const fromNode = node(d, from);
	if (!fromNode)
		return {
			dag: d,
			event: "Branched",
			blocked: true,
			reason: "unknown phase",
		};
	const r = withNewLine(d, from, label, changeset, fromNode.head);
	if (!r)
		return {
			dag: d,
			event: "Branched",
			blocked: true,
			reason: "unknown phase",
		};
	return { dag: r.dag, event: "Branched", newNode: r.newNode };
}

/**
 * checkoutAncestor makes the prior stable phase `ancestor` the current head (§120/§121) — a BACKWARD
 * move. It ONLY moves the head flag: it clears the head flag of every node descending from the
 * ancestor and sets the ancestor's head flag. It appends and deletes NOTHING — every later node and
 * edge stays (append-only; the abandoned line remains a stepping stone, §123). Independent parallel
 * heads (off a different branch point) are left untouched (§125).
 */
export function checkoutAncestor(d: Dag, ancestor: string): MoveResult {
	if (!node(d, ancestor))
		return {
			dag: d,
			event: "HeadMoved",
			blocked: true,
			reason: "unknown phase",
		};
	const descendants = forwardReachable(d, ancestor);
	const nodes = d.nodes.map((n) => {
		if (n.id === ancestor) return { ...n, head: true };
		if (descendants.has(n.id)) return { ...n, head: false };
		return { ...n };
	});
	return { dag: { nodes, edges: [...d.edges] }, event: "HeadMoved" };
}

/**
 * rebranch opens a NEW line from the recheckout-ed ancestor `ancestor` (the branch-of-a-branch,
 * §121): a new node parented on `ancestor` becomes a head. It does NOT clear the ancestor's head flag
 * (after a checkout the ancestor is the current head and stays the base of the new line); the
 * ancestor's other descendants remain present (append-only).
 */
export function rebranch(
	d: Dag,
	ancestor: string,
	label: string,
	changeset: string,
): MoveResult {
	const r = withNewLine(d, ancestor, label, changeset, false);
	if (!r)
		return {
			dag: d,
			event: "Rebranched",
			blocked: true,
			reason: "unknown phase",
		};
	return { dag: r.dag, event: "Rebranched", newNode: r.newNode };
}
