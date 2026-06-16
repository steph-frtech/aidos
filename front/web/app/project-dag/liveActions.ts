"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { DEMO_HEADS, headsDecoder, type LiveHeadsView } from "./live";

/**
 * /project-dag LIVE Server Action — read the version space's CURRENT heads through the typed
 * S58 gateway via the S59 SDK (the below-the-line `dag_heads` tool of the dag server,
 * dispatched in-process by the passerelle), decoded with the PURE decoder from ./live, with
 * the deterministic demo heads preserved as the fallback (`source: "live" | "demo"`).
 *
 * ── THE LIVE GATEWAY PATH THE PANEL WAS WAITING FOR ──────────────────────────────────
 * The ProjectDagPanel actions (actions.ts) were explicitly `source:"demo"`, annotated "the
 * live gateway path arrives at S58; until then the version-space verdict is computed from the
 * authoritative twin". This is that path: the panel's deterministic twin (lib/projectDag,
 * byte-identical to back/archive/projectdag) stays the action-capable demo; this section
 * surfaces the engine's ACTUAL current heads alongside it (strictly additive cutover).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * dag_heads READS the current head ids; the DAG records ride the privileged dag writer (S24),
 * never a screen. A READ only — it writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer deterministically yields the demo heads (the genesis baseline).
 */

export type { LiveHeadsView } from "./live";

/** liveHeads reads the version space's current heads (live → demo fallback). */
export async function liveHeads(): Promise<LiveHeadsView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"dag_heads",
		{},
		headsDecoder,
		DEMO_HEADS,
	);
	return { heads: data.heads, source };
}
