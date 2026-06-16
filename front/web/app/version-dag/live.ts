import {
	arr,
	type Decoder,
	isObject,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /version-dag live FULL-GRAPH read MODEL (the PURE part of the S59 cutover, testable in
 * isolation — ADR 0092 kill-twins batch).
 *
 * This module holds the never-double-typed Decoder for the dag server `dag_get` tool + the
 * deterministic demo graph. It imports NOTHING server-only, so the parity mirror
 * (live.test.ts) can decode a Go-sample output without a server runtime. The Server Action
 * (actions.ts → liveGraph) wires panelScope + readVia around these.
 *
 * ── WHY A SECOND READ ON THIS PANEL ──────────────────────────────────────────────────
 * The panel already surfaces the live HEADS via `dag_heads` (actions.ts → liveHeads). This
 * adds the live WHOLE graph (nodes + edges + heads) via `dag_get` — the read the Go server
 * documents as "for /version-dag rendering". The action-capable VersionDagPanel (the §121
 * pure-twin worked example) stays the demo navigation; this section surfaces the engine's
 * ACTUAL nodes/edges alongside it (strictly additive cutover, the proven mutation-score /
 * project-dag pattern).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * dag_get READS the whole version space (append-only, §120); recording a node/edge rides
 * the privileged dag writer (S24), never a screen. This module only DECODES a read — it
 * writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The version-space logic lives in Go (back/archive/dag, authoritative); this
 * module decodes its read contract, it is NOT a second DAG implementation.
 *
 * ── THE Go CONTRACT (dagsrv.getOutput) ───────────────────────────────────────────────
 * `{ nodes: [{ id, parent_ids?, head, stratum, label? }], edges: [{ from, to, changeset }],
 *    heads: string[] }` — `parent_ids`/`label` are omitempty (absent ⇒ root / unlabelled).
 */

/** A DAG node — the dagsrv.nodeIO shape, decoded ONCE (never double-typed). */
export interface GraphNode {
	id: string;
	parentIds: string[];
	head: boolean;
	stratum: string;
	label: string | null;
}

/** A DAG edge — the dagsrv.edgeIO shape (a ChangeSet, S20). */
export interface GraphEdge {
	from: string;
	to: string;
	changeset: string;
}

/** The decoder's structural output — the SINGLE declaration of the dag_get shape. */
export interface GraphData {
	nodes: GraphNode[];
	edges: GraphEdge[];
	heads: string[];
}

export interface LiveGraphView extends GraphData {
	source: Source;
}

const nodeDecoder: Decoder<GraphNode> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const stratum = str(raw.stratum);
	if (id === null || stratum === null) return null;
	if (typeof raw.head !== "boolean") return null;
	// parent_ids is omitempty (absent ⇒ a root node) — default to [].
	const parentIds =
		raw.parent_ids === undefined ? [] : arr(str)(raw.parent_ids);
	if (parentIds === null) return null;
	// label is omitempty (absent ⇒ unlabelled) — default to null.
	const label = raw.label === undefined ? null : str(raw.label);
	if (label === null && raw.label !== undefined) return null;
	return { id, parentIds, head: raw.head, stratum, label };
};

const edgeDecoder: Decoder<GraphEdge> = (raw) => {
	if (!isObject(raw)) return null;
	const from = str(raw.from);
	const to = str(raw.to);
	const changeset = str(raw.changeset);
	if (from === null || to === null || changeset === null) return null;
	return { from, to, changeset };
};

/**
 * graphDecoder decodes the dag server `dag_get` output `{ nodes, edges, heads }`
 * (dagsrv.getOutput) ONCE — never double-typed. A malformed payload (non-array / bad node /
 * bad edge / non-string head) → null (the caller falls back to the demo graph).
 */
export const graphDecoder: Decoder<GraphData> = (raw) => {
	if (!isObject(raw)) return null;
	const nodes = arr(nodeDecoder)(raw.nodes);
	const edges = arr(edgeDecoder)(raw.edges);
	const heads = arr(str)(raw.heads);
	if (nodes === null || edges === null || heads === null) return null;
	return { nodes, edges, heads };
};

/**
 * The deterministic demo graph — the canonical §120 example: a human-truth trunk
 * v0 → v1 → v2 (above the waterline) and an evolutionary variant w1 off v1 (below). No
 * clock, no rng, no I/O. The heads are v2 + w1 (the two live parallel lines, §125).
 */
export const DEMO_GRAPH: GraphData = {
	nodes: [
		{
			id: "v0",
			parentIds: [],
			head: false,
			stratum: "above",
			label: "genesis",
		},
		{ id: "v1", parentIds: ["v0"], head: false, stratum: "above", label: null },
		{ id: "v2", parentIds: ["v1"], head: true, stratum: "above", label: null },
		{
			id: "w1",
			parentIds: ["v1"],
			head: true,
			stratum: "below",
			label: "variant",
		},
	],
	edges: [
		{ from: "v0", to: "v1", changeset: "cs-1" },
		{ from: "v1", to: "v2", changeset: "cs-2" },
		{ from: "v1", to: "w1", changeset: "cs-w1" },
	],
	heads: ["v2", "w1"],
};

/** countByStratum — a pure helper the panel uses to summarise above/below (no I/O). */
export function countByStratum(nodes: GraphNode[]): {
	above: number;
	below: number;
} {
	let above = 0;
	let below = 0;
	for (const n of nodes) {
		if (n.stratum === "above") above += 1;
		else below += 1;
	}
	return { above, below };
}
