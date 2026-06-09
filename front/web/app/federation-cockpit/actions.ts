"use server";

import { measure } from "@/lib/arch-fitness";
import {
	assembleSnapshot,
	DEMO_DEP_GRAPH,
	DEMO_FEDERATION,
	DEMO_PROJECT,
	DEMO_REGRESSED_GRAPH,
	DEMO_WAVE,
	type FanOutSpec,
} from "@/lib/federation-cockpit";
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
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): assembleSnapshot is a PURE function (lib/federation-
 * cockpit) — same input → byte-identical snapshot, never an LLM. THE WALL (§2/§9): the cockpit
 * COMPOSES + RENDERS; the structural baseline moves via a ChangeSet (S102), the per-cell
 * RedWorkQueue INSERT is the S22 hook's job — never a direct write from the screen.
 */

// The baseline structural metric the candidate cut is ratcheted against (the demo's steady cut).
const BASELINE = measure(DEMO_DEP_GRAPH);

/**
 * assembleAction — assemble the cockpit. Two toggles drive the §50 scenarios from the screen:
 *   - fireWave: overlay the transverse red wave (reddens payment; order stays green & ships);
 *   - breakStructure: feed the regressed cut (a new un-contracted edge) → structural ratchet BROKEN.
 */
export async function assembleAction(
	_prev: CockpitView,
	formData: FormData,
): Promise<CockpitView> {
	const fireWave = formData.get("fireWave") === "on";
	const breakStructure = formData.get("breakStructure") === "on";
	try {
		const wave: FanOutSpec = fireWave
			? DEMO_WAVE
			: { policyWaveId: "wave-pii-1", cells: [] };
		const depGraph = breakStructure ? DEMO_REGRESSED_GRAPH : DEMO_DEP_GRAPH;
		const snapshot = assembleSnapshot(
			DEMO_PROJECT,
			depGraph,
			BASELINE,
			DEMO_FEDERATION,
			wave,
		);
		return { ok: true, snapshot };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
