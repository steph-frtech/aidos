"use server";

import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /evolution-sandbox live read (S59 cutover). It reads the LIVE list of recorded
 * EvolutionRun ids through the typed S58 gateway via the S59 SDK — the below-the-line
 * `evolve_run_list` read of the dispatched evolve server (S42, KRD §66.1) — decoded with a
 * PURE decoder, with the deterministic demo fixture preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. /evolve runs ONLY inside the EvolutionSandbox
 * quarantine and writes ONLY branches/reports/ideas (never the kernel/mirrors/authority/
 * fitness). A promotion is a PROPOSAL the human /goal freezes — never a truth-write from
 * this screen. The evolution explores; it does not govern.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; the dispatched evolve
 * server is SANS LLM (the self-play generator is never armed in the dispatch path); a
 * malformed / undispatched / refused gateway answer deterministically yields the demo list.
 */

export interface LiveRunsView {
	runIds: string[];
	source: Source;
}

// The decoder is the SINGLE declaration of the live run-list shape (never double-typed).
const runListDecoder: Decoder<{ runIds: string[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const runIds = arr(str)(raw.run_ids);
	if (runIds === null) return null;
	return { runIds };
};

/** The deterministic demo list — the canonical recorded sandbox run. */
function demoRuns(): { runIds: string[] } {
	return { runIds: ["evrun-checkout-discount-0001"] };
}

/** liveRuns reads the active project's recorded EvolutionRun ids (live → demo fallback). */
export async function liveRuns(): Promise<LiveRunsView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"evolve_run_list",
		{},
		runListDecoder,
		demoRuns(),
	);
	// Never render a blank live list: an empty live run-list still falls back to the demo
	// fixture so the panel and its e2e stay autonomous (the example is always visible).
	if (source === "live" && data.runIds.length === 0) {
		return { runIds: demoRuns().runIds, source: "demo" };
	}
	return { runIds: data.runIds, source };
}
