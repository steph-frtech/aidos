"use server";

import { decide, MEASURED } from "@/lib/bootstrap-spike";
import type { ReMeasureView } from "./view";

/**
 * Server Action for the /bootstrap-spike Workbench panel (DP10 — SPIKE-gate,
 * ratchet OFF, T0).
 *
 * THE STEP (ROADMAP-provisioning-deploy DP10): before writing DP11-DP13, prove
 * by MEASUREMENT that a deterministic one-shot emitted bootstrap (port resolution
 * + start order as PURE functions of the observed state, healthchecks, print-URLs)
 * beats calling /data/dockers/deploy.sh directly. The verdict is a boolean
 * conjunction over two REAL reproducible docker runs, never an LLM opinion.
 *
 * THE WALL (CLAUDE.md §2): the action re-runs the PURE twin (lib/bootstrap-spike)
 * over the pinned measured runs and compares verdict hashes — it WRITES NOTHING
 * (no kernel/mirrors/fitness; the spike zone is /spike, the harvest record is a
 * proposal). The route stays read-only with respect to truth: this control only
 * re-measures.
 */
export async function reMeasureAction(
	_prev: ReMeasureView,
	formData: FormData,
): Promise<ReMeasureView> {
	const initialVerdictHash = String(formData.get("initialVerdictHash") ?? "");
	const verdict = await decide(MEASURED);
	return {
		ok: true,
		verdict,
		hashEqual: verdict.verdictHash === initialVerdictHash,
	};
}
