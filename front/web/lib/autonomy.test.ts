import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Action,
	CODE_AUTONOMY_EXCEEDED,
	DEFAULT_POLICY,
	enforce,
	isKnownLevel,
	type Level,
	promotionFromHistory,
	type RunOutcome,
} from "./autonomy";

/**
 * FK10 autonomy twin tests (fast-check + Vitest). Five tests pin the FK10 done-criteria:
 *   - an A1 agent attempting a merge (critical, requires A6) is refused with AGENT_AUTONOMY_EXCEEDED;
 *   - enforce is fail-closed & monotone: required ≤ declared admits, else refuses (∀ rung pair);
 *   - A8 never governs a critical action (even a declared-A8 agent is held to A7);
 *   - promotion is a PURE function of history: all-green E4+ no-incident window of ≥N → current+1,
 *     any non-green/below-E4/incident run withholds it (never declared, always computed);
 *   - the ladder is CLOSED: an out-of-ladder level is fail-closed.
 */

describe("FK10 autonomy twin (Go authoritative)", () => {
	it("refuses an A1 agent attempting a merge (the fixture done-criterion)", () => {
		const merge: Action = { name: "merge", required: 6, critical: true };
		const dec = enforce(1, merge);
		expect(dec.allowed).toBe(false);
		expect(dec.blockReason?.code).toBe(CODE_AUTONOMY_EXCEEDED);
		expect((dec.blockReason?.howToFix ?? []).length).toBeGreaterThan(0);
	});

	it("is fail-closed & monotone for every non-critical rung pair", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 8 }),
				fc.integer({ min: 0, max: 8 }),
				(declared, required) => {
					const dec = enforce(declared, {
						name: "op",
						required: required as Level,
						critical: false,
					});
					expect(dec.allowed).toBe(required <= declared);
					if (!dec.allowed) {
						expect(dec.blockReason?.code).toBe(CODE_AUTONOMY_EXCEEDED);
					}
				},
			),
		);
	});

	it("never admits A8 on a critical action (even a declared-A8 agent)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 8 }), (declared) => {
				const dec = enforce(declared, {
					name: "merge",
					required: 8,
					critical: true,
				});
				expect(dec.allowed).toBe(false);
			}),
		);
	});

	it("promotion is a pure function of history (computed, never declared)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 8 }),
				fc.integer({ min: 1, max: 6 }),
				fc.array(
					fc.record({
						green: fc.boolean(),
						evidence: fc.integer({ min: 0, max: 7 }),
						incident: fc.boolean(),
					}),
					{ minLength: 0, maxLength: 10 },
				),
				(current, n, history) => {
					const policy = { minGreenRuns: n, minEvidence: 4 };
					const got = promotionFromHistory(
						current,
						history as RunOutcome[],
						policy,
					);
					let want: number;
					if (current >= 8) {
						want = current;
					} else if (history.length < n) {
						want = current;
					} else {
						const window = history.slice(history.length - n);
						const clean = window.every(
							(o) => o.green && o.evidence >= 4 && !o.incident,
						);
						want = clean ? current + 1 : current;
					}
					expect(got).toBe(want);
					// reproducible
					expect(
						promotionFromHistory(current, history as RunOutcome[], policy),
					).toBe(got);
				},
			),
		);
	});

	it("the ladder is closed (an out-of-ladder level is fail-closed)", () => {
		expect(isKnownLevel(-1)).toBe(false);
		expect(isKnownLevel(9)).toBe(false);
		expect(isKnownLevel(1.5)).toBe(false);
		// 3 clean E4 runs promote A1→A2 under the default policy.
		const clean: RunOutcome[] = [
			{ green: true, evidence: 4, incident: false },
			{ green: true, evidence: 5, incident: false },
			{ green: true, evidence: 4, incident: false },
		];
		expect(promotionFromHistory(1, clean, DEFAULT_POLICY)).toBe(2);
	});
});
