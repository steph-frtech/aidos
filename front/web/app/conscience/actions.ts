"use server";

import { reconcile } from "@/lib/conscience";
import { type ConscienceView, emptyView, SCENARIOS } from "./fixtures";

/**
 * Server Action for the /conscience Workbench panel (FK09 — la conscience).
 *
 * THE STEP (ROADMAP-fke FK09, FKE-6.3): the CONSCIENCE composes the verdicts of the EXISTING
 * judges (the mirror runner, the completeness/monster law, the FK08 facet skeleton, SemanticDiff,
 * the RealityMirror, the sensors, the ledger) into ONE ConsciousnessReport per kernel + the
 * §FKE-31 decision cards. AUCUN NOUVEAU JUGE — it READS sourced verdicts and ROUTES them. The
 * overall verdict drifts iff any HARD pair is red; the SOFT facet X never flips it (§13.6).
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): the RÉCONCILIER control is bound to this action,
 * which runs the pure twin lib/conscience — pick a scenario, run the aggregator, watch the
 * reconciled pairs + the decision cards + the overall verdict appear, plus the determinism proof
 * (run twice → same report). THE WALL (§2): the action WRITES NOTHING — the report and the cards
 * are projections; acting on a card goes idea → mirror → /goal → human decision.
 */
export async function reconcileAction(
	_prev: ConscienceView,
	formData: FormData,
): Promise<ConscienceView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = SCENARIOS.find((s) => s.id === scenarioId);
	if (!scenario) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const input = {
		kernel_id: "checkout",
		skeleton: scenario.skeleton,
		verdicts: scenario.verdicts,
	};
	const a = reconcile(input);
	// re-run to prove the report is deterministic (same input → same report).
	const b = reconcile(input);
	return {
		ok: true,
		report: a,
		deterministic: JSON.stringify(a) === JSON.stringify(b),
	};
}
