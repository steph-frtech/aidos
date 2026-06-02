/**
 * Reproducibility mirror for lib/goal.ts (the front twin of back/runtime/goal) — fast-check (S29).
 *
 * It pins that the front deciders compute the SAME non-gameable stop as the Go engine: isClosed iff
 * all four conditions hold; any fault ⇒ not closed; determinism; no agent-confidence input. One
 * semantics, no drift.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type BlockReason,
	closeBlockReason,
	GOAL_STILL_RED,
	isClosed,
	type PriorGreenState,
	type SensorState,
	type StopInput,
	stopConditions,
} from "./goal";

const redSetArb = fc.uniqueArray(fc.stringMatching(/^m\.[a-z]{1,4}$/), {
	minLength: 1,
	maxLength: 4,
});

function stopInputArb(redSet: string[]): fc.Arbitrary<StopInput> {
	return fc.record({
		sensors: fc.constant(redSet).chain((rs) =>
			fc
				.tuple(...rs.map(() => fc.constantFrom<SensorState>("green", "red")))
				.map((states) => {
					const m: Record<string, SensorState> = {};
					rs.forEach((ref, i) => {
						m[ref] = states[i];
					});
					return m;
				}),
		),
		priorGreen: fc.constantFrom<PriorGreenState>("intact", "broken"),
		mutation: fc.float({ min: 0, max: 1, noNaN: true }),
		mutationFloor: fc.constant(0.8),
		monsters: fc.array(fc.constant("orphan-X"), { maxLength: 2 }),
	});
}

describe("goal.ts — the non-gameable stop twin", () => {
	it("isClosed iff all four conditions hold", () => {
		fc.assert(
			fc.property(redSetArb, (redSet) =>
				fc.assert(
					fc.property(stopInputArb(redSet), (input) => {
						const c = stopConditions(redSet, input);
						const allFour =
							c.redSetGreen &&
							c.priorGreenIntact &&
							c.mutationOk &&
							c.noMonster;
						expect(isClosed(redSet, input)).toBe(allFour);
					}),
				),
			),
		);
	});

	it("any fault ⇒ not closed", () => {
		fc.assert(
			fc.property(redSetArb, (redSet) =>
				fc.assert(
					fc.property(stopInputArb(redSet), (input) => {
						const faulty =
							!redSet.every((m) => input.sensors[m] === "green") ||
							input.priorGreen !== "intact" ||
							input.mutation < input.mutationFloor ||
							input.monsters.length > 0;
						if (faulty) expect(isClosed(redSet, input)).toBe(false);
					}),
				),
			),
		);
	});

	it("is deterministic — same input ⇒ same verdict (no confidence input)", () => {
		fc.assert(
			fc.property(redSetArb, (redSet) =>
				fc.assert(
					fc.property(stopInputArb(redSet), (input) => {
						expect(isClosed(redSet, input)).toBe(isClosed(redSet, input));
					}),
				),
			),
		);
	});

	it("closeBlockReason is GOAL_STILL_RED iff not closed, null otherwise", () => {
		fc.assert(
			fc.property(redSetArb, (redSet) =>
				fc.assert(
					fc.property(stopInputArb(redSet), (input) => {
						const br: BlockReason | null = closeBlockReason(redSet, input);
						if (isClosed(redSet, input)) {
							expect(br).toBeNull();
						} else {
							expect(br).toEqual(GOAL_STILL_RED);
							expect(br?.howToFix.length).toBeGreaterThan(0);
						}
					}),
				),
			),
		);
	});

	it("a missing sensor verdict counts as red (anti-passthrough)", () => {
		// Two mirrors, only one has a green verdict ⇒ cannot close.
		expect(
			isClosed(["m.a", "m.b"], {
				sensors: { "m.a": "green" },
				priorGreen: "intact",
				mutation: 0.9,
				mutationFloor: 0.8,
				monsters: [],
			}),
		).toBe(false);
	});
});
