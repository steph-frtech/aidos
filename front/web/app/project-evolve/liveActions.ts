"use server";

import {
	type Decoder,
	isObject,
	num,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /project-evolve LIVE Server Action — read a variant's RECORDED out-of-sample evaluation
 * through the typed S58 gateway via the S59 SDK (the below-the-line `backtest_get` read of the
 * closed registry), decoded with a PURE decoder, with a deterministic demo evaluation preserved
 * as the fallback (`source: "live" | "demo"`).
 *
 * ── A CHEAP READ ONLY (the OBJECTIVE) ───────────────────────────────────────────────────
 * backtest_get is dispatched SYNCHRONOUSLY because it READS a recorded verdict from the
 * in-memory evaluation store — no market feed, no replay subprocess. It is the determinism-first
 * READ; the HEAVY tool backtest_out_of_sample (the EVALUATE op behind the data-feed seam) is NOT
 * dispatched from the screen — only this read evaluation. So the front never triggers a walk-
 * forward replay from a panel; it only surfaces the last recorded score.
 *
 * THE WALL (CLAUDE.md §2): a READ only. backtest_get stages no truth; the promotion of an élite
 * is a PROPOSAL frozen at /goal (the human), never a write from the screen. The
 * ProjectEvolvePanel above stays the action-capable demo computation (the pure twin
 * lib/project-evolve); this section only surfaces the live recorded evaluation alongside it.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo evaluation.
 */

export interface LiveBacktestView {
	variantId: string;
	verdict: string;
	score: number;
	bar: number;
	source: Source;
}

// backtest_get → { variant_id, verdict, score, bar, reason? } (backtestersrv.backtestOutput),
// decoded ONCE (never double-typed). An un-recorded variant returns an empty verdict + zero
// score — a valid live answer ("not yet evaluated"), distinct from the demo fallback.
const backtestDecoder: Decoder<{
	variantId: string;
	verdict: string;
	score: number;
	bar: number;
}> = (raw) => {
	if (!isObject(raw)) return null;
	const variantId = str(raw.variant_id);
	if (variantId === null) return null;
	// verdict is omitted ("") for an un-recorded variant — accept absent as the empty verdict.
	const verdict = raw.verdict == null ? "" : str(raw.verdict);
	if (verdict === null) return null;
	const score = num(raw.score);
	if (score === null) return null;
	// bar is omitted for an un-recorded variant — accept absent as 0 (no bar to clear yet).
	const bar = raw.bar == null ? 0 : num(raw.bar);
	if (bar === null) return null;
	return { variantId, verdict, score, bar };
};

/** The deterministic demo evaluation — a green élite clearing the out-of-sample bar. */
const DEMO_EVAL: {
	variantId: string;
	verdict: string;
	score: number;
	bar: number;
} = {
	variantId: "demo-elite",
	verdict: "green",
	score: 0.82,
	bar: 0.7,
};

/**
 * liveBacktest reads a named variant's RECORDED out-of-sample evaluation (live → demo
 * fallback). An unscoped / unwired gateway falls back to the demo evaluation.
 */
export async function liveBacktest(): Promise<LiveBacktestView> {
	const variantId = "demo-elite";
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"backtest_get",
		{ variant_id: variantId },
		backtestDecoder,
		DEMO_EVAL,
	);
	return {
		variantId: data.variantId,
		verdict: data.verdict,
		score: data.score,
		bar: data.bar,
		source,
	};
}
