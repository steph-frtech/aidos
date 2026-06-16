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
 * /mirrors LIVE Server Action — read the cliquet's CURRENT ratchet verdict through the
 * typed S58 gateway via the S59 SDK (the below-the-line `ratchet_check` read of the closed
 * registry), decoded with a PURE decoder, with a deterministic demo verdict preserved as the
 * fallback (`source: "live" | "demo"`).
 *
 * ── A CHEAP READ ONLY (the OBJECTIVE) ───────────────────────────────────────────────────
 * ratchet_check is dispatched SYNCHRONOUSLY because at S05 the mirror-runner Replayer is the
 * pure BaselineReplayer — it reports each mirror's LAST RECORDED status (a comparison reader,
 * no test subprocess). It is a CHEAP READ over runtime.mirror_runs ⋈ the `mirrors` schema, so
 * the front may dispatch it on render. It NEVER triggers a heavy run: mirror_replay-as-a-real-
 * runner (S06+ seam) is NOT dispatched synchronously from the screen — only this read verdict.
 *
 * THE WALL (CLAUDE.md §2): a READ only. ratchet_check writes solely the append-only run-log
 * (runtime.mirror_runs, BELOW the waterline) — never truth (kernel/mirrors/fitness). The
 * RatchetRunner above stays the action-capable demo computation (the pure twin lib/mirrors);
 * this section only surfaces the live gateway verdict alongside it (strictly additive cutover).
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo verdict.
 */

export interface LiveRatchetView {
	verdict: string;
	regressed: string[];
	runId: string;
	source: Source;
}

// ratchet_check → { run_id, verdict, regressed:[{mirror_id,…}] } (mirrorrunnersrv.checkOutput),
// decoded ONCE (never double-typed). We project the regressed set to its mirror ids — the
// status section only needs which mirrors regressed, not their full RunRecord.
const ratchetDecoder: Decoder<{
	verdict: string;
	regressed: string[];
	runId: string;
}> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = str(raw.verdict);
	if (verdict === null) return null;
	const runId = str(raw.run_id);
	if (runId === null) return null;
	// regressed is omitted (null) when the merge is ALLOWED — treat absent as the empty set.
	let regressed: string[] = [];
	if (raw.regressed != null) {
		const rows = arr((row: unknown) => {
			if (!isObject(row)) return null;
			return str(row.mirror_id);
		})(raw.regressed);
		if (rows === null) return null;
		regressed = rows;
	}
	return { verdict, regressed, runId };
};

/** The deterministic demo verdict — the canonical green baseline (no regression). */
const DEMO_VERDICT: { verdict: string; regressed: string[]; runId: string } = {
	verdict: "ALLOWED",
	regressed: [],
	runId: "demo:check",
};

/**
 * liveRatchet reads the active project's CURRENT ratchet verdict (live → demo fallback). The
 * `ref` is the active-phase HEAD marker; an unscoped / unwired gateway falls back to demo.
 */
export async function liveRatchet(): Promise<LiveRatchetView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"ratchet_check",
		{ ref: "HEAD", run_id: "workbench:mirrors:ratchet_check" },
		ratchetDecoder,
		DEMO_VERDICT,
	);
	return {
		verdict: data.verdict,
		regressed: data.regressed,
		runId: data.runId,
		source,
	};
}
