"use server";

import { readVia } from "@/lib/gateway-sdk";
import {
	DEMO_GARDEN,
	DEMO_GARDEN_PLAN,
	GARDEN_SCENARIO_SNAPSHOT,
	gardenProjectArgs,
} from "@/lib/kernel-debt-garden-data";
import { panelScope } from "@/lib/panelScope";
import { gardenDecoder, type LiveGardenView, planDecoder } from "./liveGarden";

/**
 * /kernel-debt LIVE GARDEN Server Action (ADR 0092 batch-2 kernel-garden flip — the Go engine
 * is the SINGLE live source).
 *
 * It reads the S112/§82.4 per-project GARDEN the engine actually computes through the typed S58
 * gateway via the S59 SDK: the dispatched below-the-line `garden_tend_project` (the FIVE-rot
 * ranked debt ledger) and `garden_suggest_trim` (the open_idea_* trim plan) of the kernel-garden
 * server, dispatched in-process by the passerelle. Each is decoded with the PURE decoder from
 * ./liveGarden, with the deterministic demo garden/plan (the twin lib/kernel-garden tend +
 * suggestGardenTrim over a fixed snapshot) preserved as the fallback
 * (`gardenSource`/`planSource`: "live" | "demo").
 *
 * ── THE WALL (CLAUDE.md §2/§8) ───────────────────────────────────────────────────────
 * garden_tend_project / garden_suggest_trim are PURE below-the-line reads over a read-only
 * projection — they WRITE NOTHING. /trim PROPOSES — deletesAnything is ALWAYS false; the only
 * door is idea → mirror → /goal → human approval. A READ of a below-the-line garden.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoders + the demo fallbacks (./liveGarden, lib/kernel-garden-data) are pure; a
 * malformed / undispatched / refused gateway answer (e.g. no kernel-garden wired) deterministically
 * yields the demo garden/plan.
 */

export type { LiveGardenView } from "./liveGarden";

/**
 * liveGarden reads the engine's per-project garden + trim plan (live → demo fallback). With no
 * dispatched kernel-garden the gateway answer is unavailable → the demo garden/plan; a wired
 * server surfaces the real FIVE-rot ledger + the open_idea_* suggestions.
 */
export async function liveGarden(): Promise<LiveGardenView> {
	const scope = await panelScope();
	const args = gardenProjectArgs(GARDEN_SCENARIO_SNAPSHOT);
	const tended = await readVia(
		scope,
		"garden_tend_project",
		args,
		gardenDecoder,
		DEMO_GARDEN,
	);
	const planned = await readVia(
		scope,
		"garden_suggest_trim",
		args,
		planDecoder,
		DEMO_GARDEN_PLAN,
	);
	return {
		garden: tended.data,
		plan: planned.data,
		gardenSource: tended.source,
		planSource: planned.source,
	};
}
