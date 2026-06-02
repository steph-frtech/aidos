/**
 * The checkout HarnessCostBudget + its economics rows for the /harness-economics
 * panel (AIDOS step S51).
 *
 * The budget is the KRD §66.3 declared cap (read here, never authored — the wall). The
 * four rows are the fixture rows of
 * tests/runtime/checkout-harness-economics.fixture.md: the page runs the PURE
 * evaluator (lib/economics.ts, the projection of back/runtime/economics) over each, so
 * each verdict badge is COMPUTED, never declared. The measured cost is CONSUMED
 * (telemetry / changesets / the S40 mutation run / the goal's spend) — never produced.
 */

import type { HarnessCostBudget, MeasuredCost, ValueCase } from "./economics";

/** The DECLARED checkout budget (KRD §66.3): max_ci 10, tokens 50k, mutation 5m, review 30, risk high. */
export const CHECKOUT_BUDGET: HarnessCostBudget = {
	cellRef: "checkout",
	maxCiMinutes: 10,
	maxLlmTokensPerGoal: 50000,
	maxMutationRuntimeSeconds: 5 * 60,
	maxHumanReviewMinutes: 30,
	expectedRiskReduction: "high",
};

const WITHIN_COST: MeasuredCost = {
	ciMinutes: 8,
	llmTokens: 40000,
	mutationRuntimeSeconds: 3 * 60,
	humanReviewMinutes: 15,
};

/** The over-budget cost: ci_minutes 18 > 10 (the only axis over). */
const OVER_COST: MeasuredCost = {
	ciMinutes: 18,
	llmTokens: 40000,
	mutationRuntimeSeconds: 3 * 60,
	humanReviewMinutes: 15,
};

const JUSTIFIED_VC: ValueCase = {
	truth: "checkout.payment.idempotent",
	riskIfBroken: "high",
	expectedImpact: "avoid duplicate capture",
	harnessCost: { ciMinutes: 18, humanReviewMinutes: 15 },
	decision: "justified",
};

const TOO_EXPENSIVE_VC: ValueCase = {
	truth: "checkout.payment.idempotent",
	riskIfBroken: "low",
	expectedImpact: "",
	harnessCost: { ciMinutes: 18 },
	decision: "too_expensive",
};

/** One economics row: a human label, the consumed cost, and an optional ValueCase. */
export interface EconomicsRow {
	key: string;
	label: string;
	cost: MeasuredCost;
	valueCase: ValueCase | null;
}

/** The four fixture rows, in display order (within → flagged → justified → too_expensive). */
export const ECONOMICS_ROWS: EconomicsRow[] = [
	{
		key: "within",
		label: "coût dans le budget — aucune ValueCase",
		cost: WITHIN_COST,
		valueCase: null,
	},
	{
		key: "flagged",
		label: "ci_minutes 18 > 10 — aucune ValueCase (signalé)",
		cost: OVER_COST,
		valueCase: null,
	},
	{
		key: "justified",
		label: "même coût hors budget + ValueCase justified (gardée)",
		cost: OVER_COST,
		valueCase: JUSTIFIED_VC,
	},
	{
		key: "too_expensive",
		label: "même coût hors budget + ValueCase too_expensive (toujours signalé)",
		cost: OVER_COST,
		valueCase: TOO_EXPENSIVE_VC,
	},
];

/** The costly truth's ValueCase for the dedicated card (the justified, kept case). */
export const COSTLY_VALUE_CASE: ValueCase = JUSTIFIED_VC;
