import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	ALLOWED_MODE,
	badgeVariant,
	classify,
	TRUTH_KINDS,
	type Truth,
	VERIFIABILITY_LEVELS,
} from "./truth-typing";

/**
 * Reproducibility mirror (front projection) for the truth-typing classifier
 * (AIDOS step S14). reflects=kernel.truthtyping, test_kind=property/reproducibility,
 * cert_language=fast-check/vitest, liveness=live.
 *
 * It pins that the TS projection mirrors the Go classifier (back/kernel/truthtyping):
 * the exact enum cardinalities (§13.4 seven, §13.5 five), the admission-gate invariant
 * (only a deterministic level is admitted to the kernel), the §13.4 rejection cases,
 * and determinism (same Truth ⇒ same Routing).
 */

describe("truth-typing — enum fidelity", () => {
	it("has exactly the seven KRD §13.4 TruthKinds", () => {
		expect(TRUTH_KINDS).toHaveLength(7);
		expect(TRUTH_KINDS).toEqual([
			"behavioral",
			"structural",
			"experiential",
			"economic",
			"regulatory",
			"statistical",
			"exploratory",
		]);
	});

	it("has exactly the five KRD §13.5 VerifiabilityLevels", () => {
		expect(VERIFIABILITY_LEVELS).toHaveLength(5);
		expect(VERIFIABILITY_LEVELS).toEqual([
			"deterministic",
			"statistical",
			"delayed",
			"human_judged",
			"unverifiable",
		]);
	});

	it("maps only `deterministic` to the kernel admission gate", () => {
		for (const level of VERIFIABILITY_LEVELS) {
			const mode = ALLOWED_MODE[level];
			expect(mode === "kernel").toBe(level === "deterministic");
		}
	});
});

describe("truth-typing — the S14 done criteria", () => {
	it("rejects a truth with no truth_kind (missing-truth-kind)", () => {
		const r = classify({ truthKind: "", verifiabilityLevel: "deterministic" });
		expect(r.zone).toBe("rejected");
		expect(r.admitted).toBe(false);
		expect(r.code).toBe("missing-truth-kind");
		expect(badgeVariant(r)).toBe("rejected");
	});

	it("routes an experiential + unverifiable truth to /spike (not admitted)", () => {
		const r = classify({
			truthKind: "experiential",
			verifiabilityLevel: "unverifiable",
		});
		expect(r.zone).toBe("/spike");
		expect(r.admitted).toBe(false);
		expect(badgeVariant(r)).toBe("spike");
	});

	it("admits a behavioral + deterministic truth to the kernel", () => {
		const r = classify({
			truthKind: "behavioral",
			verifiabilityLevel: "deterministic",
		});
		expect(r.zone).toBe("kernel");
		expect(r.admitted).toBe(true);
		expect(badgeVariant(r)).toBe("kernel");
	});

	it("rejects an out-of-enum truth_kind (unknown-truth-kind)", () => {
		const r = classify({
			truthKind: "vibes",
			verifiabilityLevel: "deterministic",
		});
		expect(r.zone).toBe("rejected");
		expect(r.code).toBe("unknown-truth-kind");
	});
});

describe("truth-typing — invariants (∀, fast-check)", () => {
	const arbTruth: fc.Arbitrary<Truth> = fc.record({
		truthKind: fc.oneof(
			fc.constantFrom<string>(...TRUTH_KINDS),
			fc.constant(""),
			fc.string(),
		),
		verifiabilityLevel: fc.oneof(
			fc.constantFrom<string>(...VERIFIABILITY_LEVELS),
			fc.constant(""),
			fc.string(),
		),
	});

	it("admission-gate: a truth is admitted IFF its level's allowed_mode is kernel", () => {
		fc.assert(
			fc.property(arbTruth, (t) => {
				const r = classify(t);
				if (r.admitted) {
					expect(r.zone).toBe("kernel");
					expect(r.allowedMode).toBe("kernel");
					expect(TRUTH_KINDS).toContain(t.truthKind);
					expect(t.verifiabilityLevel).toBe("deterministic");
				}
			}),
		);
	});

	it("is deterministic: same Truth ⇒ same Routing", () => {
		fc.assert(
			fc.property(arbTruth, (t) => {
				expect(classify(t)).toEqual(classify(t));
			}),
		);
	});

	it("a rejected truth is never admitted and always names a code (no prison)", () => {
		fc.assert(
			fc.property(arbTruth, (t) => {
				const r = classify(t);
				if (r.zone === "rejected") {
					expect(r.admitted).toBe(false);
					expect(r.code).toBeTruthy();
				}
			}),
		);
	});
});
