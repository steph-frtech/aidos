"use server";

import { readVia } from "@/lib/gateway-sdk";
import {
	DEMO_REPLAY,
	type LiveReplayView,
	replayDecoder,
} from "@/lib/mirror-replay-live";
import { panelScope } from "@/lib/panelScope";

/**
 * /mirror-watch LIVE Server Action — read the mirror-runner's REPLAY verdict through the
 * typed S58 gateway via the S59 SDK (the below-the-line `mirror_replay` tool of the
 * mirror-runner server, dispatched in-process by the passerelle), decoded with the SHARED
 * pure decoder from lib/mirror-replay-live (never double-typed — one decoder, used here and
 * by /mirror-health), with the deterministic demo replay preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * ── « MATÉRIALISER-ET-LE-VOIR-ROUGIR », made LIVE ───────────────────────────────────
 * The MirrorWatchPanel above is the action-capable demo: author a mirror, materialize it,
 * watch its verdict stream RED → GREEN by code-presence (the pure twin lib/mirror-watch).
 * This section surfaces the engine's ACTUAL recorded verdicts — the "watch it fail" of KRD
 * read live from the run-log, not simulated (strictly additive cutover, the proven pattern).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * mirror_replay reports each living mirror's LAST RECORDED status; it writes only the
 * append-only run-log (runtime.mirror_runs, BELOW the waterline), never truth. A READ only.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The shared decoder + the demo fallback are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo replay.
 */

export type { LiveReplayView } from "@/lib/mirror-replay-live";

/**
 * liveReplay reads the active project's mirror replay verdict (live → demo fallback). An
 * unscoped / unwired gateway falls back to the demo replay.
 */
export async function liveReplay(): Promise<LiveReplayView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"mirror_replay",
		{ ref: "HEAD" },
		replayDecoder,
		DEMO_REPLAY,
	);
	return { ...data, source };
}
