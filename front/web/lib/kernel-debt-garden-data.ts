// Determinism-first DEMO fixtures for the /kernel-debt LIVE garden section (ADR 0092
// batch-2 kernel-garden flip). The LIVE source of the /kernel-debt garden section is the Go
// kernel-garden MCP server, read through the passerelle (garden_tend_project /
// garden_suggest_trim); when the gateway is unreachable / unwired / refuses, the section
// falls back to THIS deterministic demo — its shape computed ONCE by the pure
// lib/kernel-garden helpers (tend / suggestGardenTrim, imported RELATIVELY so this file is
// the section's demo sibling, NOT a twin-promoting `*-data.ts` of `kernel-garden` — that
// would red the separate /kernel-garden cockpit) over a fixed project snapshot carrying all
// FIVE rots. No clock, no rng, no I/O.
//
// THE LIVE PATH FOR /kernel-debt IS THE GATEWAY (ADR 0092): the section's source is the
// dispatched garden read; these helpers shape the demo fallback only, never the live source.
//
// THE WALL (CLAUDE.md §2/§8): the demo garden DETECTS + SUGGESTS — deletesAnything is false,
// every suggestion requires the door idea → mirror → /goal → human approval.

import type {
	GardenData,
	GardenItemView,
	GardenPlanData,
	GardenSuggestionView,
} from "../app/kernel-debt/liveGarden";
import { type ProjectSnapshot, suggestGardenTrim, tend } from "./kernel-garden";

// A fixed demo project carrying all FIVE rots at once (the worked example): an orphan
// mirror, a stale fixture, a surviving mutant, a dead-liveness mirror, and a low-value
// over-budget cell. Mirrors the Go kernelgardensrv test snapshots' spirit.
export const GARDEN_SCENARIO_SNAPSHOT: ProjectSnapshot = {
	projectRef: "demoshop",
	kernelHead: "head-demo",
	truths: [
		{ id: "policy.checkout", version: "v2", live: true },
		{ id: "op.refund", version: "v1", live: true },
		{ id: "entity.cart", version: "v3", live: true },
	],
	mirrors: [
		// orphan: reflects a layer that is not live at all.
		{
			id: "mir-orphan",
			reflects: { layerId: "op.gone", version: "v1" },
			testKind: "acceptance",
			liveness: "alive",
		},
		// stale fixture: pinned on entity.cart@v1 while the live head is @v3.
		{
			id: "mir-stale",
			reflects: { layerId: "entity.cart", version: "v1" },
			testKind: "fixture",
			liveness: "alive",
		},
		// dead liveness: a dead proof still pinning a LIVE truth.
		{
			id: "mir-dead",
			reflects: { layerId: "policy.checkout", version: "v2" },
			testKind: "property",
			liveness: "dead",
		},
		// a live, covering mirror over op.refund (so the surviving mutant on op.refund is real).
		{
			id: "mir-refund",
			reflects: { layerId: "op.refund", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
	],
	mutation: [{ target: "op.refund", status: "survived" }],
	budgets: [
		{
			cellRef: "cell.pricing",
			maxLlmTokensPerGoal: 1000,
			expectedRiskReduction: "low",
			cost: { llmTokens: 5000 },
			valueCase: null,
		},
	],
};

// The demo garden + plan, computed ONCE by the pure twin over the fixed snapshot. Shaped to
// the LIVE decoders' types so the demo and the live read are byte-shape-identical.
const demoGarden = tend(GARDEN_SCENARIO_SNAPSHOT);
const demoPlan = suggestGardenTrim(demoGarden);

export const DEMO_GARDEN: GardenData = {
	projectRef: demoGarden.projectRef,
	kernelHead: demoGarden.kernelHead,
	items: demoGarden.items.map(
		(it): GardenItemView => ({
			id: it.id,
			projectRef: it.projectRef,
			kind: it.kind,
			targetRef: it.targetRef,
			reason: it.reason,
			severity: it.severity,
		}),
	),
	count: demoGarden.items.length,
};

export const DEMO_GARDEN_PLAN: GardenPlanData = {
	projectRef: demoPlan.projectRef,
	suggestions: demoPlan.suggestions.map(
		(s): GardenSuggestionView => ({
			debtItemRef: s.debtItemRef,
			projectRef: s.projectRef,
			proposedAction: s.proposedAction,
			rationale: s.rationale,
			requires: s.requires,
		}),
	),
	deletesAnything: false,
};

// The gateway args for garden_tend_project / garden_suggest_trim — the project snapshot the
// Go server gardens. Mirrors the kernelgardensrv.projectIn shape (snake_case wire keys).
export function gardenProjectArgs(s: ProjectSnapshot): Record<string, unknown> {
	return {
		project_ref: s.projectRef,
		kernel_head: s.kernelHead,
		truths: s.truths.map((t) => ({
			id: t.id,
			version: t.version,
			live: t.live,
		})),
		mirrors: s.mirrors.map((m) => ({
			id: m.id,
			reflects_layer_id: m.reflects.layerId,
			reflects_version: m.reflects.version,
			test_kind: m.testKind,
			liveness: m.liveness,
		})),
		mutation: s.mutation.map((mu) => ({
			target: mu.target,
			status: mu.status,
		})),
		budgets: s.budgets.map((b) => ({
			budget: {
				cell_ref: b.cellRef,
				max_ci_minutes: b.maxCiMinutes ?? 0,
				max_llm_tokens_per_goal: b.maxLlmTokensPerGoal,
				max_mutation_runtime_seconds: 0,
				max_human_review_minutes: 0,
				expected_risk_reduction: b.expectedRiskReduction ?? "low",
			},
			cost: {
				ci_minutes: b.cost.ciMinutes ?? 0,
				llm_tokens: b.cost.llmTokens,
				mutation_runtime_seconds: 0,
				human_review_minutes: 0,
			},
		})),
	};
}
