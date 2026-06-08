import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type ConsoleInput,
	project,
	recordStablePhase,
	type StablePhaseRequest,
	stateEqualsRun,
	type WriteAction,
} from "./build-console";

/**
 * Reproducibility mirror (Vitest + fast-check) for the S86 build-console twin.
 *
 * Pins the twin to the Go authority (back/runtime/buildconsole):
 *   - project is DETERMINISTIC (same input → byte-identical state);
 *   - the projected state ALWAYS equals the recorded run (faithful projection — the console
 *     can never fabricate a turn, a goal, a result or an authorisation);
 *   - recordStablePhase records a node IFF the §43 cut is stable; an inconsistent cut is
 *     ALWAYS refused with STABLE_PHASE_INCONSISTENT_CUT and yields NO node.
 * Determinism-first, CLAUDE.md §6/§8.
 */

const arbWrite: fc.Arbitrary<WriteAction> = fc.record({
	diffHash: fc.constantFrom("d1", "d2", ""),
	authorised: fc.boolean(),
});

const arbInput: fc.Arbitrary<ConsoleInput> = fc.record({
	runId: fc.constantFrom("run-a", "run-b"),
	goal: fc.constantFrom("goal-x", "goal-y"),
	result: fc.constantFrom("green", "still_red", "blocked", "abandoned"),
	writes: fc.array(arbWrite, { maxLength: 4 }),
	diffHashes: fc.array(fc.constantFrom("d1", "d2", ""), { maxLength: 4 }),
	greenMirrors: fc.subarray(["m1", "m2", "m3"]),
	verdict: fc.constantFrom("continue", "green", "no_progress"),
	ciMinutesSpent: fc.integer({ min: 0, max: 50 }),
	ciMinutesCap: fc.integer({ min: 0, max: 50 }),
	llmTokensSpent: fc.integer({ min: 0, max: 99999 }),
	llmTokensCap: fc.integer({ min: 0, max: 99999 }),
	overBudgetAxes: fc.subarray(["ci_minutes", "llm_tokens"]),
	pending: fc.subarray(["prop-a", "prop-b", "prop-c"]),
});

describe("build-console twin — project", () => {
	it("is deterministic and a faithful projection of the run", () => {
		fc.assert(
			fc.property(arbInput, (input) => {
				const a = project(input);
				const b = project(input);
				expect(a).toEqual(b);

				const run = {
					id: input.runId,
					goal: input.goal,
					result: input.result,
					writes: input.writes,
				};
				expect(stateEqualsRun(a, run)).toBe(true);
				// one attempt per recorded turn, 1-based contiguous.
				for (let i = 0; i < a.attempts.length; i++) {
					expect(a.attempts[i].index).toBe(i + 1);
				}
			}),
		);
	});

	it("a tampered state that fabricates an authorisation fails the faithfulness check", () => {
		const run = {
			id: "run-1",
			goal: "g",
			result: "blocked" as const,
			writes: [{ diffHash: "x", authorised: false }],
		};
		const tampered = project({
			runId: "run-1",
			goal: "g",
			result: "blocked",
			writes: run.writes,
			diffHashes: ["x"],
			greenMirrors: [],
			verdict: "no_progress",
			ciMinutesSpent: 0,
			ciMinutesCap: 0,
			llmTokensSpent: 0,
			llmTokensCap: 0,
			overBudgetAxes: [],
			pending: [],
		});
		// force a fabricated authorisation.
		tampered.attempts[0].authorised = true;
		expect(stateEqualsRun(tampered, run)).toBe(false);
	});
});

const arbStableReq: fc.Arbitrary<StablePhaseRequest> = fc.record({
	projectId: fc.constantFrom("shop", "blog"),
	cut: fc.constant({ createOrder: "v3" }),
	heads: fc.constant({ createOrder: "v3" }),
	links: fc.constantFrom("v3", "v2").map((toV) => [
		{
			fromId: "checkout",
			fromVersion: "v1",
			toId: "createOrder",
			toVersion: toV,
		},
	]),
	sensors: fc.boolean().map((pass) => [{ id: "createOrder.fixture", pass }]),
	label: fc.constant("checkout-stable"),
});

describe("build-console twin — recordStablePhase", () => {
	it("records a node IFF the §43 cut is stable", () => {
		fc.assert(
			fc.property(arbStableReq, (req) => {
				const a = recordStablePhase(req);
				const b = recordStablePhase(req);
				expect(a).toEqual(b);
				// recording ⇔ stable ⇔ ¬refusal.
				expect(a.recorded).toBe(a.stable);
				if (a.recorded) {
					expect(a.blockCode).toBe("");
				} else {
					expect(a.blockCode).toBe("STABLE_PHASE_INCONSISTENT_CUT");
					expect(a.howToFix.length).toBeGreaterThan(0);
				}
			}),
		);
	});
});
