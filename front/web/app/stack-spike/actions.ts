"use server";

import { decide } from "@/lib/stack-spike";
import type { ReEmitView } from "./view";

/**
 * Server Action for the /stack-spike Workbench panel (DP01 — SPIKE-gate,
 * ratchet OFF, T0).
 *
 * THE STEP (ROADMAP-provisioning-deploy DP01): before engraving anything, prove
 * by MEASUREMENT that a content-addressed StackManifest SOURCE carries its value
 * against a static /data/dockers template — byte-identical re-emission, compose
 * round-trip, drift detection by source-hash. The verdict is a hash measure,
 * never an LLM opinion.
 *
 * THE WALL (CLAUDE.md §2): the action re-runs the PURE twin (lib/stack-spike)
 * and compares hashes — it WRITES NOTHING (no kernel/mirrors/fitness; the spike
 * zone is /spike, the harvest record is a proposal). The route stays read-only
 * with respect to truth: this control only re-measures.
 */
export async function reEmitAction(
	_prev: ReEmitView,
	formData: FormData,
): Promise<ReEmitView> {
	const initialOutputHash = String(formData.get("initialOutputHash") ?? "");
	const verdict = await decide();
	return {
		ok: true,
		verdict,
		bytesEqual: verdict.measurement.outputHash === initialOutputHash,
	};
}
