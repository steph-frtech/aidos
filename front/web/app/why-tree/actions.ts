"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { build, serializeBody } from "@/lib/why-tree";
import { WHY_TREE_CASES } from "@/lib/why-tree-data";
import { buildDecoder, gatewayBuildArgs } from "./live";
import { type BuildView, EMPTY_BUILD_VIEW } from "./view";

/**
 * Server Action for the /why-tree Workbench panel (FK13 — the `/why` gesture, the 5-whys
 * REDRESSED).
 *
 * THE STEP: from a RED symptom, /why walks `caused_by` UPWARD (FK12), admits ONLY reproduced
 * causes (anti-confabulation), and terminates OBLIGATORILY in an anti-recurrence mirror
 * (root → /learn → mirror). The human PICKS one of the canonical scenarios (the incident → tree →
 * terminal mirror journey, or one of the three refusals) and RUNS /why; the panel renders the
 * ordered reproduced causes, the ROOT cause, and the terminal mirror — OR the closed refusal
 * (WHYTREE_NO_MIRROR / WHYTREE_CAUSE_NOT_REPRODUCED / CAUSED_BY_CYCLE / …).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `buildAction` now reads the
 * LIVE WhyTree from the Go why-tree MCP server through the passerelle
 * (`readVia(scope, "build", …)`, the dispatched below-the-line read of the FK13 graph-walk), with
 * the twin `lib/why-tree.build()` preserved ONLY as the deterministic demo fallback
 * (`source:"live"|"demo"`). A malformed / undispatched / refused answer yields the demo build —
 * NEVER a partial value (ADR 0074: an honest source:"demo", never a silent broken-live).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback (the same pure twin compute
 * the Go whytree.Build reproduces) are pure; same input → same verdict, zero LLM. THE WALL
 * (§2/§9): /why-tree BUILDS the tree and writes NOTHING — `build` is a below-the-line read;
 * freezing the terminal anti-recurrence mirror goes via propose → /learn → /goal → approval, never
 * from this screen.
 */

export async function buildAction(
	_prev: BuildView,
	formData: FormData,
): Promise<BuildView> {
	const caseId = String(formData.get("caseId") ?? "");
	const chosen = WHY_TREE_CASES.find((c) => c.id === caseId);
	if (chosen === undefined) {
		return { ...EMPTY_BUILD_VIEW, caseId };
	}
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched why-tree `build` tool); the twin
	// build() of the same input is the deterministic demo fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"build",
		gatewayBuildArgs(chosen.input),
		buildDecoder,
		build(chosen.input),
	);
	// serializeBody is a pure RENDER of whatever tree we display (live or demo) — not a re-build.
	const body = data?.ok ? serializeBody(data.tree) : "";
	return {
		ok: true,
		caseId,
		symptom: chosen.input.symptom,
		provenance: chosen.input.provenance,
		result: data,
		body,
		source,
	};
}
