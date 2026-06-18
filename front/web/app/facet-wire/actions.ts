"use server";

import { demoSkeleton, gatewaySkeletonArgs } from "@/lib/facetwire-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { emptyView, type FacetWireView, SCENARIOS } from "./fixtures";
import { skeletonDecoder } from "./live";

/**
 * Server Action for the /facet-wire Workbench panel (FK08 — câbler les facettes S/R/V/M/X).
 *
 * THE STEP (ROADMAP-fke FK08, FKE-1.3 — les 6 tables de facettes): the five non-functional
 * facet columns are wired as parallel six-pair skeletons, each reusing an existing sensor. The
 * judge is the docmirror-style STRUCTURAL set-comparison (§8): a declared-not-proven pair reddens
 * its column. The HARD columns (S/R/V/M) flip the overall verdict; the SOFT X column is ADVISORY —
 * it informs, never clicks the ratchet hard (§13.6).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The FK08 verdict is now read
 * LIVE from the Go facet-wire MCP server (facetwiresrv) through the passerelle: `readVia(scope,
 * "facet_skeleton", …)` judges the kernel's five non-functional columns in parallel. The pure TS
 * twin (lib/facetwire) is NO LONGER the live path — it survives only as the deterministic demo
 * fixture (lib/facetwire-data) the read falls back to when the gateway is unreachable / undispatched
 * / refused (`source:"live"|"demo"`). The `readVia` frontier import keeps the T5 cliquet GREEN.
 *
 * Action-capable (CLAUDE.md §7 ui-completeness): the CÂBLER control is bound to this action — pick a
 * scenario, run the live judge, watch the per-column verdicts + the overall verdict appear, plus the
 * determinism proof (run twice → same verdict). THE WALL (§2): the action WRITES NOTHING — the
 * report is a projection below the waterline, never a truth.
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

	const scope = await panelScope();
	const args = gatewaySkeletonArgs("checkout", scenario.columns);

	// LIVE read — judge the skeleton via the Go engine; the twin demoSkeleton() is the
	// deterministic fallback (source:"live"|"demo").
	const a = await readVia(
		scope,
		"facet_skeleton",
		args,
		skeletonDecoder,
		demoSkeleton("checkout", scenario.columns),
	);
	// re-run to prove the verdict is deterministic (same skeleton → same verdict, same columns).
	const b = await readVia(
		scope,
		"facet_skeleton",
		args,
		skeletonDecoder,
		demoSkeleton("checkout", scenario.columns),
	);

	return {
		ok: true,
		kernelId: a.data.kernelId,
		verdict: a.data.verdict,
		columns: a.data.columns,
		verdictAgain: b.data.verdict,
		deterministic:
			a.data.verdict === b.data.verdict &&
			JSON.stringify(a.data.columns) === JSON.stringify(b.data.columns),
		source: a.source,
	};
}
