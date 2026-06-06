/**
 * lib/besoin-graph.ts — the TYPESCRIPT TWIN of the EL03 BesoinGraph record
 * (back/runtime/besoin/graph.go). Pure, total, deterministic: same answers → same graph_hash,
 * regardless of insertion or key order; round-trip lossless; distinct projects disjoint. No
 * clock/rng/IO/LLM (determinism-first, CLAUDE.md §6/§8). The /compound-besoin-grammar panel reads
 * this twin so the graph_hash shown on screen is byte-identical to what the Go authority computes
 * (records.Hash(Canonicalize(graph))).
 *
 * THE DOUBLE ABSENCE (the wall, CLAUDE.md §2): a BesoinGraph and its LevelNodes carry NEITHER a
 * version NOR a mirror field — by construction. This twin's canonical body never emits those keys,
 * exactly like the Go record. A need is not a truth.
 *
 * The canonical body mirrors Go's records.Canonicalize: re-encode with object keys sorted
 * lexicographically (recursively), arrays in order, no insignificant whitespace; then SHA-256 hex.
 */

import { createHash } from "node:crypto";
import { isLevel, type Level, outgoingRef } from "./besoin-grammar";

// NodeStatus — the closed need-lifecycle of a single LevelNode (mirrors NodeStatus in graph.go).
export type NodeStatus = "empty" | "drafting" | "resolved";
export const NODE_STATUSES: NodeStatus[] = ["empty", "drafting", "resolved"];
export function isNodeStatus(s: string): s is NodeStatus {
	return (NODE_STATUSES as string[]).includes(s);
}

// EdgeKind — the two closed directed-edge kinds (mirrors EdgeKind in graph.go).
export type EdgeKind = "constrains" | "seeds";
export const EDGE_KINDS: EdgeKind[] = ["constrains", "seeds"];
export function isEdgeKind(k: string): k is EdgeKind {
	return (EDGE_KINDS as string[]).includes(k);
}

export interface Provenance {
	source: string;
	detail: string;
}

export interface Ref {
	field: string;
	to: Level;
}

export interface LevelNode {
	level: Level;
	body?: unknown;
	refs?: Ref[];
	provenance: Provenance;
	status: NodeStatus;
	openQuestions?: string[];
}

export interface Edge {
	from: Level;
	to: Level;
	kind: EdgeKind;
}

export interface BesoinGraph {
	project: string;
	nodes: LevelNode[];
	edges: Edge[];
}

export function newGraph(project: string): BesoinGraph {
	return { project, nodes: [], edges: [] };
}

export type AddError =
	| "unknown_level"
	| "unknown_status"
	| "duplicate_node"
	| "unknown_edge_kind"
	| "edge_level";
export type AddNodeResult =
	| { ok: true; graph: BesoinGraph }
	| { ok: false; error: AddError };

// SOURCE-rung descent rank used to sort nodes (bands rank after the leaf), mirroring levelRank in
// graph.go so the canonical node order is identical.
const SOURCE_ORDER: Level[] = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
];
const BANDS: Level[] = ["invariant", "policy"];
function levelRank(l: Level): number {
	const i = SOURCE_ORDER.indexOf(l);
	if (i >= 0) return i;
	const b = BANDS.indexOf(l);
	if (b >= 0) return SOURCE_ORDER.length + b;
	return SOURCE_ORDER.length + BANDS.length;
}

// addNode appends a LevelNode, refusing an unknown level/status or a duplicate level (overwrite needs
// a ChangeSet, §9). Non-destructive: returns a NEW graph; never mutates the input.
export function addNode(g: BesoinGraph, n: LevelNode): AddNodeResult {
	if (!isLevel(n.level)) return { ok: false, error: "unknown_level" };
	if (!isNodeStatus(n.status)) return { ok: false, error: "unknown_status" };
	if (g.nodes.some((x) => x.level === n.level))
		return { ok: false, error: "duplicate_node" };
	const out: BesoinGraph = {
		project: g.project,
		nodes: [...g.nodes, cloneNode(n)],
		edges: [...g.edges],
	};
	return { ok: true, graph: out };
}

// addEdge appends a directed edge, refusing an unknown kind or non-grammar endpoint. Non-destructive.
export function addEdge(g: BesoinGraph, e: Edge): AddNodeResult {
	if (!isEdgeKind(e.kind)) return { ok: false, error: "unknown_edge_kind" };
	if (!isLevel(e.from) || !isLevel(e.to))
		return { ok: false, error: "edge_level" };
	return {
		ok: true,
		graph: {
			project: g.project,
			nodes: [...g.nodes],
			edges: [...g.edges, { ...e }],
		},
	};
}

function cloneNode(n: LevelNode): LevelNode {
	return {
		level: n.level,
		body: n.body,
		refs: n.refs ? n.refs.map((r) => ({ ...r })) : undefined,
		provenance: { ...n.provenance },
		status: n.status,
		openQuestions: n.openQuestions ? [...n.openQuestions] : undefined,
	};
}

// withOutgoingRef returns a copy of node with its grammar outgoing ref attached (convenience for the
// wizard form — mirrors what drawNode does in the Go property test).
export function withOutgoingRef(n: LevelNode): LevelNode {
	const r = outgoingRef(n.level);
	if (!r) return n;
	return { ...n, refs: [{ field: r.refField, to: r.refTo }] };
}

// --- canonical form (byte-for-byte twin of records.Canonicalize on the Go marshalled graph) ---

// goJSONValue maps the TS graph to the SAME logical JSON the Go json.Marshal produces, honouring
// omitempty (empty/absent slices and empty body are dropped) so the canonical bytes match Go.
function nodeToGo(n: LevelNode): Record<string, unknown> {
	const o: Record<string, unknown> = {
		level: n.level,
		provenance: { source: n.provenance.source, detail: n.provenance.detail },
		status: n.status,
	};
	if (n.body !== undefined && n.body !== null) o.body = n.body;
	if (n.refs && n.refs.length > 0)
		o.refs = n.refs.map((r) => ({ field: r.field, to: r.to }));
	if (n.openQuestions && n.openQuestions.length > 0)
		o.open_questions = n.openQuestions;
	return o;
}

function sortedNodes(g: BesoinGraph): LevelNode[] {
	return [...g.nodes]
		.map((n) => {
			const refs = n.refs
				? [...n.refs].sort((a, b) =>
						a.field !== b.field
							? a.field < b.field
								? -1
								: 1
							: a.to < b.to
								? -1
								: a.to > b.to
									? 1
									: 0,
					)
				: n.refs;
			const oq = n.openQuestions
				? [...n.openQuestions].sort()
				: n.openQuestions;
			return { ...n, refs, openQuestions: oq };
		})
		.sort((a, b) => {
			const ra = levelRank(a.level);
			const rb = levelRank(b.level);
			if (ra !== rb) return ra - rb;
			return a.level < b.level ? -1 : a.level > b.level ? 1 : 0;
		});
}

function sortedDedupEdges(g: BesoinGraph): Edge[] {
	const sorted = [...g.edges].sort((a, b) => {
		if (a.from !== b.from) return a.from < b.from ? -1 : 1;
		if (a.to !== b.to) return a.to < b.to ? -1 : 1;
		return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
	});
	const out: Edge[] = [];
	for (const e of sorted) {
		const last = out[out.length - 1];
		if (
			!last ||
			last.from !== e.from ||
			last.to !== e.to ||
			last.kind !== e.kind
		)
			out.push(e);
	}
	return out;
}

// graphToGo maps the graph to the Go-equivalent JSON object (honouring omitempty on nodes/edges).
function graphToGo(g: BesoinGraph): Record<string, unknown> {
	const o: Record<string, unknown> = { project: g.project };
	const nodes = sortedNodes(g);
	if (nodes.length > 0) o.nodes = nodes.map(nodeToGo);
	const edges = sortedDedupEdges(g);
	if (edges.length > 0)
		o.edges = edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind }));
	return o;
}

// canonicalEncode re-encodes a JSON value with object keys sorted recursively, arrays in order, no
// insignificant whitespace — the exact rule of records.Canonicalize in Go.
function canonicalEncode(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		const keys = Object.keys(obj).sort();
		return `{${keys
			.map((k) => `${JSON.stringify(k)}:${canonicalEncode(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

// canonicalize returns the canonical JSONB body the graph_hash is computed over (sorted keys, sorted
// nodes/edges, no whitespace). Pure, total.
export function canonicalize(g: BesoinGraph): string {
	return canonicalEncode(graphToGo(g));
}

// hash returns the content address records.Hash(Canonicalize(graph)) — SHA-256 hex over the
// canonical body. Same answers → same graph_hash; distinct project → distinct hash. Pure, total.
export function hash(g: BesoinGraph): string {
	return createHash("sha256")
		.update(Buffer.from(canonicalize(g), "utf8"))
		.digest("hex");
}

// hasVersionOrMirrorKey reports whether the canonical body carries a forbidden version/mirror key.
// Always false by construction — the double-absence the wall demands. Used by the panel + the test.
export function hasVersionOrMirrorKey(g: BesoinGraph): boolean {
	const c = canonicalize(g);
	return c.includes('"version"') || c.includes('"mirror"');
}
