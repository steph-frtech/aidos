import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_HARNESS_COST_EXCEEDS_BUDGET,
	type Decision,
	evaluate,
	type HarnessCostBudget,
	type MeasuredCost,
	type Risk,
	type ValueCase,
	VERDICTS,
} from "./economics";
import { CHECKOUT_BUDGET, ECONOMICS_ROWS } from "./economics-data";

/**
 * Reproducibility mirror (fast-check) for the harness-economics evaluator projection — the front
 * twin of back/runtime/economics's rapid property mirror. reflects=lib/economics, test_kind=property,
 * cert_language=fast-check, authority=above (the human red of KRD §66.3). It pins that the TS
 * projection decides EXACTLY as the Go evaluator: within every cap ⇒ within_budget regardless of the
 * ValueCase; over any cap with no justified ValueCase ⇒ over_budget_flagged with
 * HARNESS_COST_EXCEEDS_BUDGET; the same over-budget cost with justified ⇒ over_budget_justified;
 * too_expensive/revisit does NOT clear the flag; deterministic + total (no Date.now()).
 */

const RISKS: Risk[] = ["low", "medium", "high", "critical"];
const DECS: Decision[] = ["justified", "too_expensive", "revisit"];

const budgetArb = fc.record({
	cellRef: fc.constantFrom("checkout", "billing", "cell-x"),
	maxCiMinutes: fc.nat({ max: 1000 }),
	maxLlmTokensPerGoal: fc.nat({ max: 1_000_000 }),
	maxMutationRuntimeSeconds: fc.nat({ max: 100000 }),
	maxHumanReviewMinutes: fc.nat({ max: 10000 }),
	expectedRiskReduction: fc.constantFrom(...RISKS),
}) as fc.Arbitrary<HarnessCostBudget>;

const costArb = fc.record({
	ciMinutes: fc.nat({ max: 2000 }),
	llmTokens: fc.nat({ max: 2_000_000 }),
	mutationRuntimeSeconds: fc.nat({ max: 200000 }),
	humanReviewMinutes: fc.nat({ max: 20000 }),
}) as fc.Arbitrary<MeasuredCost>;

function within(b: HarnessCostBudget, c: MeasuredCost): boolean {
	return (
		c.ciMinutes <= b.maxCiMinutes &&
		c.llmTokens <= b.maxLlmTokensPerGoal &&
		c.mutationRuntimeSeconds <= b.maxMutationRuntimeSeconds &&
		c.humanReviewMinutes <= b.maxHumanReviewMinutes
	);
}

describe("economics.evaluate — reproducibility mirror (KRD §66.3)", () => {
	it("is deterministic and total", () => {
		fc.assert(
			fc.property(
				budgetArb,
				costArb,
				fc.option(fc.constantFrom(...DECS), { nil: null }),
				(b, c, d) => {
					const vc: ValueCase | null =
						d === null
							? null
							: {
									truth: "t",
									riskIfBroken: "high",
									expectedImpact: "",
									harnessCost: {},
									decision: d,
								};
					const a = evaluate(b, c, vc);
					const again = evaluate(b, c, vc);
					expect(a.verdict).toBe(again.verdict);
					expect(VERDICTS).toContain(a.verdict);
				},
			),
		);
	});

	it("within every cap ⇒ within_budget regardless of the ValueCase", () => {
		// Build a cost AT OR BELOW each cap (fractions in [0,1]) so the within-budget
		// branch is exercised densely (no rare fc.pre discards).
		const fracArb = fc.record({
			ci: fc.float({ min: 0, max: 1, noNaN: true }),
			tk: fc.float({ min: 0, max: 1, noNaN: true }),
			mu: fc.float({ min: 0, max: 1, noNaN: true }),
			hr: fc.float({ min: 0, max: 1, noNaN: true }),
		});
		fc.assert(
			fc.property(budgetArb, fracArb, (b, f) => {
				const c: MeasuredCost = {
					ciMinutes: Math.floor(b.maxCiMinutes * f.ci),
					llmTokens: Math.floor(b.maxLlmTokensPerGoal * f.tk),
					mutationRuntimeSeconds: Math.floor(
						b.maxMutationRuntimeSeconds * f.mu,
					),
					humanReviewMinutes: Math.floor(b.maxHumanReviewMinutes * f.hr),
				};
				expect(within(b, c)).toBe(true);
				for (const vc of [
					null,
					{
						truth: "t",
						riskIfBroken: "high" as Risk,
						expectedImpact: "",
						harnessCost: {},
						decision: "justified" as Decision,
					},
					{
						truth: "t",
						riskIfBroken: "low" as Risk,
						expectedImpact: "",
						harnessCost: {},
						decision: "too_expensive" as Decision,
					},
				]) {
					const got = evaluate(b, c, vc);
					expect(got.verdict).toBe("within_budget");
					expect(got.blockReason).toBeNull();
				}
			}),
		);
	});

	it("over any cap with no justified ValueCase ⇒ over_budget_flagged with HARNESS_COST_EXCEEDS_BUDGET", () => {
		// Push ci_minutes strictly above its cap so the over-budget branch is always hit.
		fc.assert(
			fc.property(
				budgetArb,
				costArb,
				fc.integer({ min: 1, max: 500 }),
				(b, c0, over) => {
					const c: MeasuredCost = { ...c0, ciMinutes: b.maxCiMinutes + over };
					expect(within(b, c)).toBe(false);
					for (const vc of [
						null,
						{
							truth: "t",
							riskIfBroken: "high" as Risk,
							expectedImpact: "",
							harnessCost: {},
							decision: "too_expensive" as Decision,
						},
						{
							truth: "t",
							riskIfBroken: "medium" as Risk,
							expectedImpact: "",
							harnessCost: {},
							decision: "revisit" as Decision,
						},
					]) {
						const got = evaluate(b, c, vc);
						expect(got.verdict).toBe("over_budget_flagged");
						expect(got.blockReason?.code).toBe(
							CODE_HARNESS_COST_EXCEEDS_BUDGET,
						);
						expect(got.blockReason?.howToFix.length).toBeGreaterThan(0);
					}
				},
			),
		);
	});

	it("the same over-budget cost with justified ⇒ over_budget_justified (earned its keep)", () => {
		fc.assert(
			fc.property(
				budgetArb,
				costArb,
				fc.integer({ min: 1, max: 500 }),
				(b, c0, over) => {
					const c: MeasuredCost = { ...c0, ciMinutes: b.maxCiMinutes + over };
					const vc: ValueCase = {
						truth: "t",
						riskIfBroken: "high",
						expectedImpact: "",
						harnessCost: {},
						decision: "justified",
					};
					const got = evaluate(b, c, vc);
					expect(got.verdict).toBe("over_budget_justified");
					expect(got.blockReason).toBeNull();
				},
			),
		);
	});
});

describe("economics-data fixture rows compute the expected verdicts", () => {
	it("matches the canonical four rows of the fixture", () => {
		const verdicts = ECONOMICS_ROWS.map(
			(r) => evaluate(CHECKOUT_BUDGET, r.cost, r.valueCase).verdict,
		);
		expect(verdicts).toEqual([
			"within_budget",
			"over_budget_flagged",
			"over_budget_justified",
			"over_budget_flagged",
		]);
	});
});
