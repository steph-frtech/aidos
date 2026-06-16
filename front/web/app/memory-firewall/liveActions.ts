"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { DEMO_RECALL, type LiveRecallView, recallDecoder } from "./live";

/**
 * /memory-firewall LIVE Server Action — recall the memories the firewall governs, through the
 * typed S58 gateway via the S59 SDK (the below-the-line `memory_recall` tool of the memory
 * server, dispatched in-process by the passerelle), decoded with the PURE decoder from ./live,
 * with the deterministic demo hits preserved as the fallback (`source: "live" | "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * memory_recall is a below-the-line READ of the `brain` store. The action-capable firewall GATE
 * above (MemoryFirewallPanel, the pure twin lib/firewall) stays the demo computation proving the
 * direct Memory → Kernel edge is ALWAYS blocked; this section surfaces the LIVE carburant the
 * firewall lets PROPOSE but never DECLARE (strictly additive cutover). A READ only.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo hits (the tainted firewall carburant).
 */

export type { LiveRecallView } from "./live";

/**
 * liveRecall recalls the nearest memories for the firewall's worked-example query (live → demo
 * fallback). The query mirrors the §119.1 example (the checkout TVA memory + the incident-derived
 * one); an unscoped / unwired gateway falls back to the demo hits.
 */
export async function liveRecall(): Promise<LiveRecallView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"memory_recall",
		{ query: "checkout total", k: 5 },
		recallDecoder,
		DEMO_RECALL,
	);
	// Never render a blank live recall: an empty live hit set still falls back to the demo hits
	// so the panel and its e2e stay autonomous (the example is always visible).
	if (source === "live" && data.hits.length === 0) {
		return { ...DEMO_RECALL, source: "demo" };
	}
	return { ...data, source };
}
