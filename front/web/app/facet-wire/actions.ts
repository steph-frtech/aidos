"use server";

import { wireSkeleton } from "@/lib/facetwire";
import { emptyView, type FacetWireView, SCENARIOS } from "./fixtures";

/**
 * Server Action for the /facet-wire Workbench panel (FK08 — câbler les facettes S/R/V/M/X).
 *
 * THE STEP (ROADMAP-fke FK08, FKE-1.3 — les 6 tables de facettes): the five non-functional
 * facet columns are wired as parallel six-pair skeletons, each reusing an existing sensor.
 * The judge is the same docmirror-style STRUCTURAL set-comparison (§8): a declared-not-proven
 * pair reddens its column. The HARD columns (S/R/V/M) flip the overall verdict; the SOFT X
 * column is ADVISORY — it informs, never clicks the ratchet hard (§13.6).
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): the CÂBLER control is bound to this action,
 * which runs the pure twin lib/facetwire — pick a scenario, run the skeleton judge, watch the
 * per-column verdicts + the overall verdict appear, plus the determinism proof (run twice →
 * same verdict). THE WALL (§2): the action WRITES NOTHING — the report is a projection.
 */
export async function wireAction(
	_prev: FacetWireView,
	formData: FormData,
): Promise<FacetWireView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = SCENARIOS.find((s) => s.id === scenarioId);
	if (!scenario) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const a = wireSkeleton({ kernel_id: "checkout", columns: scenario.columns });
	// re-run to prove the verdict is deterministic (same skeleton → same verdict).
	const b = wireSkeleton({ kernel_id: "checkout", columns: scenario.columns });
	return {
		ok: true,
		kernelId: a.kernel_id,
		verdict: a.verdict,
		columns: a.columns,
		verdictAgain: b.verdict,
		deterministic:
			a.verdict === b.verdict &&
			JSON.stringify(a.columns) === JSON.stringify(b.columns),
	};
}
