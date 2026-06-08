import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Iteration,
	isClosed,
	noProgress,
	type Policy,
	type StopInput,
	type TerminationInput,
	terminate,
	VERDICTS,
} from "./build-loop";

/**
 * Reproducibility mirror (Vitest + fast-check) for the S83 build-loop twin.
 *
 * Pins the twin to the Go authority (back/runtime/buildloop): the SAME no-progress
 * signals, the SAME termination precedence (green-first via the non-gameable Stop),
 * the SAME closed verdict enum. The three NON-NEGOTIABLE laws:
 *   - termination is a PURE FUNCTION OF THE HISTORY (same input → same verdict);
 *   - GREEN ⇒ the non-gameable Stop passes (it cannot fabricate a pass);
 *   - the breaker stops a build that spends without advancing (BUILD_LOOP_NO_PROGRESS).
 * Determinism-first, CLAUDE.md §6/§8.
 */

const mirrorPool = ["m1", "m2", "m3"];

const arbIteration: fc.Arbitrary<Iteration> = fc.record({
	diffHash: fc.constantFrom("a", "b", "c"),
	greenMirrors: fc.subarray(mirrorPool),
});

const arbHistory: fc.Arbitrary<Iteration[]> = fc.array(arbIteration, {
	maxLength: 6,
});

const arbPolicy: fc.Arbitrary<Policy> = fc.record({
	maxIterations: fc.integer({ min: 0, max: 8 }),
	stagnationWindow: fc.integer({ min: 0, max: 4 }),
});

const arbStop = (redSet: string[]): fc.Arbitrary<StopInput> =>
	fc.record({
		sensors: fc
			.constant(Object.fromEntries(redSet.map((m) => [m, "green" as const])))
			.chain(() =>
				fc
					.tuple(
						...redSet.map(() =>
							fc.constantFrom("green" as const, "red" as const),
						),
					)
					.map((vals) =>
						Object.fromEntries(redSet.map((m, i) => [m, vals[i]])),
					),
			),
		priorGreen: fc.constantFrom("intact" as const, "broken" as const),
		mutation: fc.float({ min: 0, max: 1, noNaN: true }),
		mutationFloor: fc.float({ min: 0, max: 1, noNaN: true }),
		monsters: fc.subarray(["x"]),
	});

const arbInput: fc.Arbitrary<TerminationInput> = fc
	.subarray(mirrorPool, { minLength: 1 })
	.chain((redSet) =>
		fc.record({
			redSet: fc.constant(redSet),
			stop: arbStop(redSet),
			history: arbHistory,
			policy: arbPolicy,
			budget: fc.record({
				maxLlmTokensPerGoal: fc.integer({ min: 0, max: 5000 }),
				maxCiMinutes: fc.integer({ min: 0, max: 100 }),
			}),
			cost: fc.record({
				llmTokens: fc.integer({ min: 0, max: 10000 }),
				ciMinutes: fc.integer({ min: 0, max: 200 }),
			}),
			valueCaseJustified: fc.boolean(),
		}),
	);

describe("S83 build-loop twin — determinism & the three laws", () => {
	it("terminate is a pure function of its input (same input → same decision)", () => {
		fc.assert(
			fc.property(arbInput, (input) => {
				const d1 = terminate(input);
				const d2 = terminate(input);
				expect(d1).toEqual(d2);
				expect(VERDICTS).toContain(d1.verdict);
			}),
		);
	});

	it("noProgress is a pure function of the history", () => {
		fc.assert(
			fc.property(arbHistory, arbPolicy, (h, p) => {
				expect(noProgress(h, p)).toBe(noProgress(h, p));
			}),
		);
	});

	it("GREEN ⇒ the non-gameable Stop passes (it cannot fabricate a pass)", () => {
		fc.assert(
			fc.property(arbInput, (input) => {
				const d = terminate(input);
				if (d.verdict === "green") {
					expect(isClosed(input.redSet, input.stop)).toBe(true);
				}
				if (isClosed(input.redSet, input.stop)) {
					expect(d.verdict).toBe("green");
				}
			}),
		);
	});

	it("a build that spends without advancing stops with BUILD_LOOP_NO_PROGRESS", () => {
		const redSet = ["m1", "m2"];
		const notGreen: StopInput = {
			sensors: { m1: "green", m2: "red" },
			priorGreen: "intact",
			mutation: 0,
			mutationFloor: 0,
			monsters: [],
		};
		// Two byte-identical diffs = churn → stuck.
		const stagnant: Iteration[] = [
			{ diffHash: "same", greenMirrors: ["m1"] },
			{ diffHash: "same", greenMirrors: ["m1"] },
		];
		const d = terminate({
			redSet,
			stop: notGreen,
			history: stagnant,
			policy: { maxIterations: 50, stagnationWindow: 2 },
			budget: { maxLlmTokensPerGoal: 0, maxCiMinutes: 0 },
			cost: { llmTokens: 0, ciMinutes: 0 },
			valueCaseJustified: false,
		});
		expect(d.verdict).toBe("no_progress");
		expect(d.blockCode).toBe("BUILD_LOOP_NO_PROGRESS");
	});

	it("an over-budget loop stops, wired to the HarnessCostBudget (and a justified ValueCase clears it)", () => {
		const redSet = ["m1", "m2"];
		const notGreen: StopInput = {
			sensors: { m1: "red", m2: "red" },
			priorGreen: "intact",
			mutation: 0,
			mutationFloor: 0,
			monsters: [],
		};
		// An advancing history so the structural breaker stays silent — the halt is the budget.
		const advancing: Iteration[] = [
			{ diffHash: "d1", greenMirrors: [] },
			{ diffHash: "d2", greenMirrors: ["m1"] },
		];
		const base = {
			redSet,
			stop: notGreen,
			history: advancing,
			policy: { maxIterations: 50, stagnationWindow: 2 },
			budget: { maxLlmTokensPerGoal: 1000, maxCiMinutes: 0 },
			cost: { llmTokens: 5000, ciMinutes: 0 },
		};
		const halted = terminate({ ...base, valueCaseJustified: false });
		expect(halted.verdict).toBe("no_progress");
		expect(halted.overBudgetAxes).toContain("llm_tokens");

		const cleared = terminate({ ...base, valueCaseJustified: true });
		expect(cleared.verdict).toBe("continue");
	});
});
