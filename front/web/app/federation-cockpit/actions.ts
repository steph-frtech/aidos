"use server";

import { measure } from "@/lib/arch-fitness";
import {
	assembleSnapshot,
	DEMO_DEP_GRAPH,
	DEMO_FEDERATION,
	DEMO_PROJECT,
	DEMO_REGRESSED_GRAPH,
} from "@/lib/federation-cockpit";
import { demoWave, gatewayFanOutArgs } from "@/lib/federation-cockpit-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { fanOutDecoder } from "./live";
import type { CockpitView } from "./view";

/**
 * Server Actions for the /federation-cockpit Workbench panel (S105 — cockpit de fédération,
 * app-builder EPIC 11, §50).
 *
 * THE STEP: snapshot a project's federation into ONE cockpit view — the cell graph, the
 * inter-cell contracts, the status of BOTH ratchets (S100 behavioural + S102 structural), local
 * vs global stability, and the red-wave fan-out. The done-criterion (executable from the
 * screen): two cells, one contract, a transverse red wave — one cell shows a green local cut and
 * SHIPS while a neighbor is still red.
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The cockpit's RED-WAVE
 * FAN-OUT — which cells a global policy reddened + each reddened cell's RedWorkQueue, the live
 * §51 piece — is now read from the Go federation MCP server through the passerelle
 * (`readVia(scope, "fan_out", …)`, the dispatched below-the-line read), decoded into the front
 * FanOutSpec (./live.fanOutDecoder). The behavioural + structural ratchets (the S100/S102 twins)
 * stay the deterministic DEMO composition (those are the arch-fitness panel's live read, not the
 * cockpit's); the wave is composed into the snapshot via the PURE assembleSnapshot. The `readVia`
 * frontier import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback,
 * source:"live"|"demo"), and a malformed / undispatched / refused fan-out deterministically yields
 * the demo wave.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + assembleSnapshot are pure (lib/federation-
 * cockpit) — same input → byte-identical snapshot, never an LLM. THE WALL (§2/§9): the cockpit
 * COMPOSES + RENDERS; fan_out is a below-the-line READ (it returns the per-cell waves as a VALUE);
 * the structural baseline moves via a ChangeSet (S102), the per-cell RedWorkQueue INSERT is the
 * S22 hook's job — never a direct write from the screen.
 */

// The baseline structural metric the candidate cut is ratcheted against (the demo's steady cut).
const BASELINE = measure(DEMO_DEP_GRAPH);

/**
 * assembleAction — assemble the cockpit. Two toggles drive the §50 scenarios from the screen:
 *   - fireWave: overlay the transverse red wave (reddens payment; order stays green & ships) —
 *     the wave is now read LIVE from the Go federation `fan_out` tool (source:"live"|"demo");
 *   - breakStructure: feed the regressed cut (a new un-contracted edge) → structural ratchet BROKEN.
 */
export async function assembleAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const fireWave = formData.get("fireWave") === "on";
	const breakStructure = formData.get("breakStructure") === "on";
	try {
		const scope = await panelScope();
		// LIVE read of the §51 red-wave fan-out through the passerelle (the dispatched federation
		// `fan_out` tool); the twin demoWave() is the deterministic fallback (source:"live"|"demo").
		const { data: wave, source } = await readVia(
			scope,
			"fan_out",
			gatewayFanOutArgs(fireWave),
			fanOutDecoder,
			demoWave(fireWave),
		);
		const depGraph = breakStructure ? DEMO_REGRESSED_GRAPH : DEMO_DEP_GRAPH;
		const snapshot = assembleSnapshot(
			DEMO_PROJECT,
			depGraph,
			BASELINE,
			DEMO_FEDERATION,
			wave,
		);
		return { ok: true, snapshot, source };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
