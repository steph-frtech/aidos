"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	contextGraphDecoder,
	DEMO_CONTEXT_GRAPH,
	type LiveContextGraphView,
} from "./live";

/**
 * /decision-reuse LIVE Server Action — read the ContextGraph VIEW the reuse gate judges
 * against, through the typed S58 gateway via the S59 SDK (the below-the-line
 * `context_graph_query` tool of the context server, dispatched in-process by the passerelle),
 * decoded with the PURE decoder from ./live, with the deterministic demo view preserved as the
 * fallback (`source: "live" | "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * context_graph_query is a READ-ONLY query of the derived `context` projection. The
 * action-capable reuse GATE above (DecisionReusePanel, the pure twin lib/contextgraph.decide)
 * stays the demo computation; this section surfaces the LIVE graph the gate's verdict is judged
 * against (strictly additive cutover). "Le LLM ne vit pas dans le ContextGraph" — a READ only.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo §142 checkout subgraph.
 */

export type { LiveContextGraphView } from "./live";

/**
 * liveContextGraph reads the ContextGraph view by goal (live → demo fallback). The `by_goal`
 * index returns the load-bearing layers, red mirrors, crossed PUBLIC contracts and scoped
 * memory the router would compile for the goal — the input the reuse gate judges against.
 */
export async function liveContextGraph(): Promise<LiveContextGraphView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"context_graph_query",
		{ by: "by_goal", value: "checkout.total" },
		contextGraphDecoder,
		DEMO_CONTEXT_GRAPH,
	);
	// Never render a blank live graph: an empty live query still falls back to the demo view
	// so the panel and its e2e stay autonomous (the example is always visible).
	const empty =
		data.layers.length === 0 &&
		data.mirrors.length === 0 &&
		data.contracts.length === 0 &&
		data.memory.length === 0;
	if (source === "live" && empty) {
		return { ...DEMO_CONTEXT_GRAPH, source: "demo" };
	}
	return { ...data, source };
}
