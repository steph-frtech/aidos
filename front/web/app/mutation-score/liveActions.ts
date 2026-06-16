"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	DEMO_THRESHOLD,
	type LiveThresholdView,
	thresholdDecoder,
} from "./live";

/**
 * /mutation-score LIVE Server Action — read the DECLARED mutation-score threshold (the
 * densimètre's bar) through the typed S58 gateway via the S59 SDK (the below-the-line
 * `read_threshold` tool of the mutation-runner server, dispatched in-process by the
 * passerelle), decoded with the PURE decoder from ./live, with the deterministic demo bar
 * preserved as the fallback (`source: "live" | "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2/§8) ───────────────────────────────────────────────────────
 * read_threshold reads the bar SELECT-only from `fitness` — the agent is GRADED by it,
 * never authors it. The canonical wall-read: a below-the-line read of a value declared
 * above the line; the screen surfaces it READ-ONLY and writes NOTHING. The action-capable
 * Gate above (MutationScorePanel, the pure twin lib/mutation.gate) stays the demo
 * computation; this section only surfaces the LIVE declared bar alongside it (strictly
 * additive cutover — the proven mirrors/context-pack pattern).
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo bar (DECLARED_THRESHOLD, the 0.80 example).
 */

export type { LiveThresholdView } from "./live";

/**
 * liveThreshold reads the DECLARED mutation-score bar (live → demo fallback). The `scope`
 * selects which declared bar to read (go = gremlins ; front = stryker). An unscoped /
 * unwired gateway falls back to the demo bar.
 */
export async function liveThreshold(): Promise<LiveThresholdView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"read_threshold",
		{ scope: "go" },
		thresholdDecoder,
		DEMO_THRESHOLD,
	);
	return {
		scope: data.scope,
		threshold: data.threshold,
		declared: data.declared,
		source,
	};
}
