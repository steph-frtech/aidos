import {
	arr,
	type Decoder,
	isObject,
	num,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /decision-reuse live CONTEXTGRAPH read MODEL (the PURE part of the S59 cutover, testable in
 * isolation — ADR 0092 kill-twins batch).
 *
 * This module holds the never-double-typed Decoder for the context server `context_graph_query`
 * tool + the deterministic demo view. It imports NOTHING server-only, so the parity mirror
 * (live.test.ts) can decode a Go-sample output without a server runtime. The Server Action
 * (liveActions.ts) wires panelScope + readVia around these.
 *
 * ── WHY THIS READ ON THIS PANEL ──────────────────────────────────────────────────────
 * The panel renders the ContextGraphDecision reuse GATE (§119.2): the action-capable
 * DecisionReusePanel runs the pure twin `decide()` on a human-picked ledger entry — that worked
 * example STAYS (the gate above the line). This adds the LIVE read of the ContextGraph VIEW the
 * router compiles over (§142): for a goal, the load-bearing layers, the red mirrors, the crossed
 * PUBLIC contracts and the scoped memory the engine would actually pull. The reuse verdict is
 * judged AGAINST this live graph; surfacing it makes the gate's input visible (strictly additive
 * cutover, the proven mutation-score / project-dag pattern).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * context_graph_query is a READ-ONLY query of the derived `context` projection; a decision is
 * recorded by the `aidos` writer role via a ChangeSet (S20), never a screen. "Le LLM ne vit pas
 * dans le ContextGraph" — this module only DECODES a read, it writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The ContextRouter is an algorithm in Go (back/runtime/context, authoritative);
 * this module decodes its query contract, it is NOT a second router.
 *
 * ── THE Go CONTRACT (contextsrv.graphQueryOutput) ────────────────────────────────────
 * `{ layers: [{ id, bounded_context, branch, load_bearing, project? }],
 *    mirrors: [{ id, bounded_context, red, project? }],
 *    contracts: [{ id, bounded_context, public, project? }],
 *    memory: [{ id, kind, scope, confidence, stale, approved, project? }] }`.
 */

/** A ContextGraph layer node — the rctx.Layer shape, decoded ONCE (never double-typed). */
export interface GraphLayer {
	id: string;
	boundedContext: string;
	branch: string;
	loadBearing: boolean;
}

/** A ContextGraph mirror node — the rctx.Mirror shape. */
export interface GraphMirror {
	id: string;
	boundedContext: string;
	red: boolean;
}

/** A ContextGraph contract node — the rctx.Contract shape. */
export interface GraphContract {
	id: string;
	boundedContext: string;
	public: boolean;
}

/** A ContextGraph memory node — the rctx.MemoryRecord shape (pre-scored). */
export interface GraphMemory {
	id: string;
	kind: string;
	scope: string;
	confidence: string;
	stale: boolean;
	approved: boolean;
}

/** The decoder's structural output — the SINGLE declaration of the query shape. */
export interface ContextGraphData {
	layers: GraphLayer[];
	mirrors: GraphMirror[];
	contracts: GraphContract[];
	memory: GraphMemory[];
}

export interface LiveContextGraphView extends ContextGraphData {
	source: Source;
}

const layerDecoder: Decoder<GraphLayer> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const boundedContext = str(raw.bounded_context);
	const branch = str(raw.branch);
	if (id === null || boundedContext === null || branch === null) return null;
	if (typeof raw.load_bearing !== "boolean") return null;
	return { id, boundedContext, branch, loadBearing: raw.load_bearing };
};

const mirrorDecoder: Decoder<GraphMirror> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const boundedContext = str(raw.bounded_context);
	if (id === null || boundedContext === null) return null;
	if (typeof raw.red !== "boolean") return null;
	return { id, boundedContext, red: raw.red };
};

const contractDecoder: Decoder<GraphContract> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const boundedContext = str(raw.bounded_context);
	if (id === null || boundedContext === null) return null;
	if (typeof raw.public !== "boolean") return null;
	return { id, boundedContext, public: raw.public };
};

const memoryDecoder: Decoder<GraphMemory> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const kind = str(raw.kind);
	const scope = str(raw.scope);
	// confidence is a Go Confidence (a string enum: none|low|repeated|high). Decode as a string;
	// some Go encoders may emit a number — accept either, stringified, never coerced to NaN.
	const confidence =
		str(raw.confidence) ??
		(num(raw.confidence) !== null ? String(raw.confidence) : null);
	if (id === null || kind === null || scope === null || confidence === null) {
		return null;
	}
	if (typeof raw.stale !== "boolean" || typeof raw.approved !== "boolean") {
		return null;
	}
	return {
		id,
		kind,
		scope,
		confidence,
		stale: raw.stale,
		approved: raw.approved,
	};
};

/**
 * contextGraphDecoder decodes the context server `context_graph_query` output
 * `{ layers, mirrors, contracts, memory }` (contextsrv.graphQueryOutput) ONCE — never
 * double-typed. A malformed payload (non-array / bad element) → null (the caller falls back
 * to the demo view). The four buckets are independently arr-decoded; an absent bucket
 * (omitted by the Go encoder) defaults to [].
 */
export const contextGraphDecoder: Decoder<ContextGraphData> = (raw) => {
	if (!isObject(raw)) return null;
	const layers = raw.layers === undefined ? [] : arr(layerDecoder)(raw.layers);
	const mirrors =
		raw.mirrors === undefined ? [] : arr(mirrorDecoder)(raw.mirrors);
	const contracts =
		raw.contracts === undefined ? [] : arr(contractDecoder)(raw.contracts);
	const memory = raw.memory === undefined ? [] : arr(memoryDecoder)(raw.memory);
	if (
		layers === null ||
		mirrors === null ||
		contracts === null ||
		memory === null
	) {
		return null;
	}
	return { layers, mirrors, contracts, memory };
};

/**
 * The deterministic demo ContextGraph view — the canonical §142 checkout subgraph the reuse
 * gate judges against: one load-bearing checkout layer, one red mirror (the goal's stop
 * condition), one PUBLIC billing contract that crosses the BC boundary, and one approved,
 * non-stale scoped memory. No clock, no rng, no I/O.
 */
export const DEMO_CONTEXT_GRAPH: ContextGraphData = {
	layers: [
		{
			id: "checkout.total",
			boundedContext: "checkout",
			branch: "main",
			loadBearing: true,
		},
	],
	mirrors: [
		{ id: "checkout.invariant", boundedContext: "checkout", red: true },
	],
	contracts: [
		{ id: "billing.charges", boundedContext: "billing", public: true },
	],
	memory: [
		{
			id: "mem-tva-eu",
			kind: "semantic",
			scope: "checkout",
			confidence: "repeated",
			stale: false,
			approved: true,
		},
	],
};
