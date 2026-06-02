// fast-check + Vitest mirror of the evolution-sandbox twin (KRD §66.1, S42), anchored
// on the Go fixtures/property (back/runtime/evolve). The invariants: every can_write
// path ⇒ allowed; every cannot_write path ⇒ refused(SANDBOX_WRITE_ESCAPES_ZONE); a
// red-mirror variant is never promotable whatever its score; a passed gate is always a
// PROPOSAL that writes no truth; the worked example shows the three done criteria.

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	BLOCK_CODE_ESCAPE,
	CAN_WRITE,
	CANNOT_WRITE,
	confine,
	type Evidence,
	gateLit,
	promote,
} from "./evolution-sandbox";
import { CANDIDATES, WRITE_LEDGER } from "./evolution-sandbox-data";

describe("confine", () => {
	it("allows any path under a can_write prefix", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...CAN_WRITE),
				fc.stringMatching(/^[a-z0-9./-]{0,20}$/),
				(prefix, suffix) => {
					const path = suffix === "" ? prefix : `${prefix}/${suffix}`;
					expect(confine(path).verdict).toBe("allowed");
				},
			),
		);
	});

	it("refuses any path under a cannot_write prefix with SANDBOX_WRITE_ESCAPES_ZONE", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...CANNOT_WRITE),
				fc.stringMatching(/^[a-z0-9./-]{0,20}$/),
				(prefix, suffix) => {
					const path = suffix === "" ? prefix : `${prefix}/${suffix}`;
					const r = confine(path);
					expect(r.verdict).toBe("refused");
					expect(r.blockCode).toBe(BLOCK_CODE_ESCAPE);
					expect(r.howToFix).toContain("open_a_/goal_to_promote_a_candidate");
				},
			),
		);
	});

	it("fails closed: a path outside can_write is refused", () => {
		expect(confine("/src/main.go").verdict).toBe("refused");
	});
});

describe("promote", () => {
	it("promotes only when all three gate conditions hold, always as a proposal", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<Evidence["mirror"]>("green", "red"),
				fc.constantFrom<Evidence["outOfSample"]>("green", "red"),
				fc.boolean(),
				fc.double({ min: 0, max: 1, noNaN: true }),
				(mirror, outOfSample, authorityApproved, fitness) => {
					const e: Evidence = {
						mirror,
						outOfSample,
						authorityApproved,
						fitness,
					};
					const r = promote("v", "n", e);
					const expectProposed =
						mirror === "green" && outOfSample === "green" && authorityApproved;
					if (expectProposed) {
						expect(r.verdict).toBe("proposed");
						expect(r.proposal?.proposal).toBe(true);
						expect(r.proposal?.writesTruth).toBe(false);
					} else {
						expect(r.verdict).toBe("refused");
					}
				},
			),
		);
	});

	it("never promotes a red-mirror variant, whatever its fitness", () => {
		fc.assert(
			fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (fitness) => {
				const r = promote("v", "n", {
					mirror: "red",
					outOfSample: "green",
					authorityApproved: true,
					fitness,
				});
				expect(r.verdict).toBe("refused");
			}),
		);
	});
});

describe("worked example (the three done criteria)", () => {
	it("the ledger shows allowed branch/report/idea writes and refused governing writes", () => {
		for (const entry of WRITE_LEDGER) {
			const r = confine(entry.path);
			if (entry.kind === "governing") {
				expect(r.verdict).toBe("refused");
				expect(r.blockCode).toBe(BLOCK_CODE_ESCAPE);
			} else {
				expect(r.verdict).toBe("allowed");
			}
		}
	});

	it("var-7 is promotable; var-9 (red mirror, higher score) and var-3 (oos red) are not", () => {
		const byId = (id: string) => {
			const c = CANDIDATES.find((x) => x.id === id);
			if (!c) throw new Error(`no candidate ${id}`);
			return c;
		};
		expect(gateLit(byId("var-7").evidence).promotable).toBe(true);
		expect(gateLit(byId("var-9").evidence).promotable).toBe(false);
		expect(gateLit(byId("var-3").evidence).promotable).toBe(false);
		// the anti-Goodhart anchor: var-9 has the highest score but is not promotable.
		expect(byId("var-9").score).toBeGreaterThan(byId("var-7").score);
	});
});
