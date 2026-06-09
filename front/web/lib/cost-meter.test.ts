import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	aggregate,
	aggregateMeter,
	disjoncteurSignal,
	meterCell,
	overBudget,
	type RunCost,
	type RunMeter,
} from "./cost-meter";
import type { HarnessCostBudget, Risk, ValueCase } from "./economics";

/**
 * Reproducibility mirror (fast-check) for the per-cell cost meter — the front twin of
 * back/runtime/costmeter's rapid property mirror (S111). reflects=lib/cost-meter,
 * test_kind=property, cert_language=fast-check, authority=above (the §66.3 human red).
 * It pins the same laws as the Go mirror: the metered cost is the exact COUNTED sum (never
 * an estimate); order-independent; an over-budget cell with no justified value_case is
 * ALWAYS flagged (advisory, never silent); a justified value_case clears the flag; and the
 * disjoncteur signal trips iff the verdict is over_budget_flagged (the S83 wire).
 */

const RISKS: Risk[] = ["low", "medium", "high", "critical"];

const meterArb = fc.record({
	tokens: fc.nat({ max: 30000 }),
	turns: fc.nat({ max: 50 }),
	ciMinutes: fc.nat({ max: 20 }),
	wallClockSecs: fc.nat({ max: 3600 }),
}) as fc.Arbitrary<RunMeter>;

const runCostArb: fc.Arbitrary<RunCost> = fc.record({
	runId: fc.string({ minLength: 4, maxLength: 8 }),
	meter: meterArb,
});

const runsArb = fc.array(runCostArb, { maxLength: 6 });

const budgetArb = fc.record({
	cellRef: fc.constant("cell"),
	maxCiMinutes: fc.nat({ max: 100 }),
	maxLlmTokensPerGoal: fc.nat({ max: 100000 }),
	maxMutationRuntimeSeconds: fc.nat({ max: 600 }),
	maxHumanReviewMinutes: fc.nat({ max: 120 }),
	expectedRiskReduction: fc.constantFrom(...RISKS),
}) as fc.Arbitrary<HarnessCostBudget>;

describe("cost-meter — the per-cell harness cost meter (S111)", () => {
	it("is deterministic — same runs ⇒ identical CellMeter + decision", () => {
		fc.assert(
			fc.property(budgetArb, runsArb, (b, runs) => {
				const a = meterCell(b, runs, null);
				const c = meterCell(b, runs, null);
				expect(a).toEqual(c);
			}),
		);
	});

	it("counts, never estimates — metered cost is the exact sum on the two §66.3 axes", () => {
		fc.assert(
			fc.property(runsArb, (runs) => {
				const wantTok = runs.reduce((s, r) => s + r.meter.tokens, 0);
				const wantCI = runs.reduce((s, r) => s + r.meter.ciMinutes, 0);
				const cm = aggregate("cell", runs);
				expect(cm.cost.llmTokens).toBe(wantTok);
				expect(cm.cost.ciMinutes).toBe(wantCI);
				expect(cm.cost.mutationRuntimeSeconds).toBe(0);
				expect(cm.cost.humanReviewMinutes).toBe(0);
				expect(cm.runCount).toBe(runs.length);
			}),
		);
	});

	it("is order-independent — permuting the runs yields the identical meter", () => {
		fc.assert(
			fc.property(runsArb, (runs) => {
				const rev = [...runs].reverse();
				expect(aggregateMeter(runs)).toEqual(aggregateMeter(rev));
			}),
		);
	});

	it("the empty cell meters to zero (no fabricated cost)", () => {
		const cm = aggregate("cell", []);
		expect(cm.cost.llmTokens).toBe(0);
		expect(cm.cost.ciMinutes).toBe(0);
		expect(cm.runCount).toBe(0);
	});

	it("verdict is always closed", () => {
		fc.assert(
			fc.property(budgetArb, runsArb, (b, runs) => {
				const { decision } = meterCell(b, runs, null);
				expect([
					"within_budget",
					"over_budget_justified",
					"over_budget_flagged",
				]).toContain(decision.verdict);
			}),
		);
	});

	it("over-budget without a justified value_case is ALWAYS flagged (advisory, never silent)", () => {
		fc.assert(
			fc.property(budgetArb, runsArb, (b, runs) => {
				const { cellMeter, decision } = meterCell(b, runs, null);
				const over =
					cellMeter.cost.llmTokens > b.maxLlmTokensPerGoal ||
					cellMeter.cost.ciMinutes > b.maxCiMinutes;
				if (over) {
					expect(decision.verdict).toBe("over_budget_flagged");
					expect(decision.blockReason).not.toBeNull();
					expect(disjoncteurSignal(decision).trip).toBe(true);
				} else {
					expect(decision.verdict).toBe("within_budget");
				}
			}),
		);
	});

	it("a justified value_case clears the flag (earned its keep, no trip)", () => {
		fc.assert(
			fc.property(budgetArb, runsArb, (b, runs) => {
				const cm = aggregate(b.cellRef, runs);
				const over =
					cm.cost.llmTokens > b.maxLlmTokensPerGoal ||
					cm.cost.ciMinutes > b.maxCiMinutes;
				fc.pre(over);
				const vc: ValueCase = {
					truth: "t",
					riskIfBroken: "high",
					expectedImpact: "",
					harnessCost: {},
					decision: "justified",
				};
				const { decision } = meterCell(b, runs, vc);
				expect(decision.verdict).toBe("over_budget_justified");
				expect(decision.blockReason).toBeNull();
				expect(disjoncteurSignal(decision).trip).toBe(false);
			}),
		);
	});

	it("too_expensive / revisit do NOT clear the flag", () => {
		fc.assert(
			fc.property(
				budgetArb,
				runsArb,
				fc.constantFrom<ValueCase["decision"]>("too_expensive", "revisit"),
				(b, runs, dec) => {
					const cm = aggregate(b.cellRef, runs);
					const over =
						cm.cost.llmTokens > b.maxLlmTokensPerGoal ||
						cm.cost.ciMinutes > b.maxCiMinutes;
					fc.pre(over);
					const vc: ValueCase = {
						truth: "t",
						riskIfBroken: "high",
						expectedImpact: "",
						harnessCost: {},
						decision: dec,
					};
					const { decision } = meterCell(b, runs, vc);
					expect(decision.verdict).toBe("over_budget_flagged");
				},
			),
		);
	});

	it("the disjoncteur wire: trip == overBudget == (verdict === over_budget_flagged)", () => {
		fc.assert(
			fc.property(budgetArb, runsArb, (b, runs) => {
				const { decision } = meterCell(b, runs, null);
				const sig = disjoncteurSignal(decision);
				expect(sig.trip).toBe(overBudget(decision));
				expect(sig.trip).toBe(decision.verdict === "over_budget_flagged");
				if (sig.trip) expect(sig.blockReason).not.toBeNull();
				else expect(sig.blockReason).toBeNull();
			}),
		);
	});

	// ── worked example (the fixture twin) ──

	const checkoutBudget: HarnessCostBudget = {
		cellRef: "checkout",
		maxCiMinutes: 10,
		maxLlmTokensPerGoal: 50000,
		maxMutationRuntimeSeconds: 300,
		maxHumanReviewMinutes: 30,
		expectedRiskReduction: "high",
	};
	const within: RunCost[] = [
		{
			runId: "r1",
			meter: { tokens: 12000, turns: 1, ciMinutes: 2, wallClockSecs: 300 },
		},
		{
			runId: "r2",
			meter: { tokens: 18000, turns: 1, ciMinutes: 3, wallClockSecs: 300 },
		},
		{
			runId: "r3",
			meter: { tokens: 8000, turns: 1, ciMinutes: 1, wallClockSecs: 300 },
		},
	];
	const heavy: RunCost = {
		runId: "r4",
		meter: { tokens: 40000, turns: 1, ciMinutes: 2, wallClockSecs: 300 },
	};

	it("checkout within budget — counted sum 38000 / 6, within_budget", () => {
		const { cellMeter, decision } = meterCell(checkoutBudget, within, null);
		expect(cellMeter.cost.llmTokens).toBe(38000);
		expect(cellMeter.cost.ciMinutes).toBe(6);
		expect(decision.verdict).toBe("within_budget");
	});

	it("checkout over budget — heavy run flags it (advisory, trips disjoncteur)", () => {
		const { cellMeter, decision } = meterCell(
			checkoutBudget,
			[...within, heavy],
			null,
		);
		expect(cellMeter.cost.llmTokens).toBe(78000);
		expect(decision.verdict).toBe("over_budget_flagged");
		expect(decision.overAxes).toContain("llm_tokens");
		expect(disjoncteurSignal(decision).trip).toBe(true);
	});

	it("checkout over budget but justified — earned its keep, no trip", () => {
		const vc: ValueCase = {
			truth: "checkout.inv",
			riskIfBroken: "critical",
			expectedImpact: "le checkout protège chaque commande",
			harnessCost: {},
			decision: "justified",
		};
		const { decision } = meterCell(checkoutBudget, [...within, heavy], vc);
		expect(decision.verdict).toBe("over_budget_justified");
		expect(disjoncteurSignal(decision).trip).toBe(false);
	});
});
