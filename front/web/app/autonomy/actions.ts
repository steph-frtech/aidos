"use server";

import {
	demoEnforce,
	demoPromote,
	findActionScenario,
	findHistoryScenario,
	gatewayEnforceArgs,
	gatewayPromoteArgs,
} from "@/lib/autonomy-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { enforceDecoder, promoteDecoder } from "./live";
import {
	type EnforceView,
	emptyEnforceView,
	emptyPromoteView,
	type PromoteView,
} from "./view";

/**
 * Server Actions for the /autonomy Workbench panel (FK10 — l'autonomie A0-A8).
 *
 * THE STEP (ROADMAP-fke FK10, FKE-11/34): the AUTONOMY axis of the governed agent layer — a CLOSED,
 * DECLARED level autonomy_level ∈ {A0..A8}, a FAIL-CLOSED enforcement (an action above the declared
 * level is refused with AGENT_AUTONOMY_EXCEEDED; A8 never governs a critical action, capped at A7),
 * and a PROMOTION that is a PURE FUNCTION of the AgentRun history (N green E4+ no-incident runs),
 * never a level the agent declares for itself.
 *
 * KILL-TWINS CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `enforceAction` /
 * `promoteAction` now read the LIVE verdict / level from the Go autonomy MCP server through the
 * passerelle (`readVia(scope, "enforce"|"promote", …)`, the dispatched below-the-line reads), with
 * the twin compute (`lib/autonomy` via `demoEnforce` / `demoPromote`) preserved ONLY as the
 * deterministic demo fallback (`source:"live"|"demo"`). The `readVia` frontier import keeps the T5
 * cliquet GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoders + the demo fallbacks (the same pure twin compute
 * the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * snapshot. THE WALL (§2): the actions WRITE NOTHING — the verdict and the proposed level are
 * projections; freezing a promotion goes idea → mirror → /goal → human decision. `enforce` / `promote`
 * are below-the-line reads.
 */

export async function enforceAction(
	_prev: EnforceView,
	formData: FormData,
): Promise<EnforceView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = findActionScenario(scenarioId);
	if (!scenario) {
		return {
			...emptyEnforceView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched autonomy `enforce` tool); the twin
	// demoEnforce() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"enforce",
		gatewayEnforceArgs(scenario),
		enforceDecoder,
		demoEnforce(scenario),
	);
	return { ok: true, snapshot: data, source };
}

export async function promoteAction(
	_prev: PromoteView,
	formData: FormData,
): Promise<PromoteView> {
	const scenarioId = String(formData.get("scenarioId") ?? "");
	const scenario = findHistoryScenario(scenarioId);
	if (!scenario) {
		return {
			...emptyPromoteView,
			error: `scénario inconnu : ${scenarioId || "(vide)"}`,
		};
	}
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched autonomy `promote` tool); the twin
	// demoPromote() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data, source } = await readVia(
		scope,
		"promote",
		gatewayPromoteArgs(scenario),
		promoteDecoder,
		demoPromote(scenario),
	);
	return { ok: true, snapshot: data, source };
}
