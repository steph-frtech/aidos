"use server";

import { readVia } from "@/lib/gateway-sdk";
import {
	DEMO_REPLAY,
	type LiveReplayView,
	replayDecoder,
} from "@/lib/mirror-replay-live";
import { panelScope } from "@/lib/panelScope";

/**
 * /mirror-health LIVE Server Action — read the mirror-runner's REPLAY verdict through the
 * typed S58 gateway via the S59 SDK (the below-the-line `mirror_replay` tool of the
 * mirror-runner server, dispatched in-process by the passerelle), decoded with the PURE
 * decoder from ./live, with the deterministic demo replay preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * mirror_replay replays the living mirrors and reports each one's LAST RECORDED status; it
 * writes only the append-only run-log (runtime.mirror_runs, BELOW the waterline), never
 * truth. A READ only. The completeness computation above (HealthRunner, the pure twin
 * lib/mirror-health) stays the demo computation; this section surfaces the LIVE replay
 * verdict alongside it (strictly additive cutover — the proven mirrors/context-pack pattern).
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo replay (the green baseline). The replay
 * logic itself is the Go Replayer (authoritative) — this never re-implements it.
 */

export type { LiveReplayView } from "@/lib/mirror-replay-live";

/**
 * liveReplay reads the active project's mirror replay verdict (live → demo fallback). The
 * `ref` is the active-phase HEAD marker; an unscoped / unwired gateway falls back to demo.
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
