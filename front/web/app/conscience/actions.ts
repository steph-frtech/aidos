"use server";

import {
	demoReport,
	findScenario,
	gatewayReconcileArgs,
} from "@/lib/conscience-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { type ConscienceView, emptyView } from "./fixtures";
import { reportDecoder } from "./live";

/**
 * Server Action for the /conscience Workbench panel (FK09 — la conscience).
 *
 * THE STEP (ROADMAP-fke FK09, FKE-6.3): the CONSCIENCE composes the verdicts of the EXISTING judges
 * (the mirror runner, the completeness/monster law, the FK08 facet skeleton, SemanticDiff, the
 * RealityMirror, the sensors, the ledger) into ONE ConsciousnessReport per kernel + the §FKE-31
 * decision cards. AUCUN NOUVEAU JUGE — it READS sourced verdicts and ROUTES them. The overall
 * verdict drifts iff any HARD pair is red; the SOFT facet X never flips it (§13.6).
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `reconcileAction` now
 * reads the LIVE report from the Go conscience MCP server through the passerelle
 * (`readVia(scope, "reconcile", …)`, the dispatched below-the-line read), with the twin
 * `lib/conscience.reconcile()` preserved ONLY as the deterministic demo fallback
 * (`source:"live"|"demo"`, via `demoReport`). The `readVia` frontier import keeps the T5 cliquet
 * GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback (the same pure twin compute
 * the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * report. THE WALL (§2): the action WRITES NOTHING — the report and the cards are projections; a
 * card is a SIGNAL, acting on it goes idea → mirror → /goal → human decision — `reconcile` is a
 * below-the-line read.
 */
export async function reconcileAction(
	_prev: ConscienceView,
	formData: FormData,
): Promise<ConscienceView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = findScenario(scenarioId);
	if (!scenario) {
		return {
			...emptyView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched conscience `reconcile` tool); the twin
	// demoReport() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"reconcile",
		gatewayReconcileArgs(scenario),
		reportDecoder,
		demoReport(scenario),
	);
	// re-run the SAME read to prove the report is deterministic (same input → same report). Both the
	// live decoder and the demo twin are pure, so the verdict is byte-stable.
	const { data: again } = await readVia(
		scope,
		"reconcile",
		gatewayReconcileArgs(scenario),
		reportDecoder,
		demoReport(scenario),
	);
	return {
		ok: true,
		report: data,
		source,
		deterministic: JSON.stringify(data) === JSON.stringify(again),
	};
}
