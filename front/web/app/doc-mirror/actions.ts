"use server";

import { deriveDoc } from "@/lib/derivedoc";
import { compare } from "@/lib/docmirror";
import { type DocMirrorView, emptyView, SCENARIOS } from "./fixtures";

/**
 * Server Action for the /doc-mirror Workbench panel (FK07 — la comparaison structurelle s2↔s9).
 *
 * THE STEP (ROADMAP-fke FK07, FKE-1.3 décision (a)): the STRUCTURAL set-comparison of the
 * human-authored doc s2 against the code-derived doc s9 (from FK06). A structural divergence
 * (a concept/behaviour/error present on one side only) is BLOCKING (red); a prose drift is
 * ADVISORY (green + a signal). The judge is a CALCULATION (§8) — no LLM arbitrates.
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): the COMPARER control is bound to this action,
 * which runs the pure twin lib/docmirror — pick a scenario, run the comparator, watch the
 * verdict + the divergences appear, plus the determinism proof (run twice → same verdict).
 * THE WALL (§2): the action WRITES NOTHING — the report is a projection, never a truth.
 */
export async function compareAction(
	_prev: DocMirrorView,
	formData: FormData,
): Promise<DocMirrorView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = SCENARIOS.find((s) => s.id === scenarioId);
	if (!scenario) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const s9a = deriveDoc(scenario.kernel).s9;
	const a = compare(scenario.human, s9a);
	// re-derive + re-compare to prove the verdict is deterministic (same pair → same verdict).
	const b = compare(scenario.human, deriveDoc(scenario.kernel).s9);
	return {
		ok: true,
		kernelId: a.kernel_id,
		verdict: a.verdict,
		pairingMismatch: a.pairing_mismatch,
		structural: a.structural_divergences,
		advisories: a.prose_advisories,
		verdictAgain: b.verdict,
		deterministic:
			a.verdict === b.verdict &&
			JSON.stringify(a.structural_divergences) ===
				JSON.stringify(b.structural_divergences),
	};
}
