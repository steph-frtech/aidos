import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	BASELINE,
	blockReasonFor,
	candidateFor,
	computeRatchet,
	type MirrorVerdict,
	RED_REGRESSION,
	regressed,
	type Status,
} from "./mirrors";

/**
 * Reproducibility + soundness mirror for the front cliquet core (S05).
 * mirror: reflects=S05-ci-ratchet-core, test_kind=invariant,
 *         cert_language=fast-check, liveness=live
 *
 * This is the front twin of the Go rapid property (regression_property_test.go):
 * computeRatchet is a pure total function, so it carries a reproducibility mirror
 * (same input → same output) and a soundness invariant (regressed IFF green→red).
 */

const ids = ["m0", "m1", "m2", "m3", "m4"];
const verdictArb: fc.Arbitrary<MirrorVerdict> = fc.record({
	mirrorId: fc.constantFrom(...ids),
	version: fc.constant("v1"),
	contentHash: fc.constant("hhhh"),
	status: fc.constantFrom<Status>("green", "red"),
});
// Dedupe by mirrorId so a "set" has one verdict per mirror.
const setArb = fc.array(verdictArb, { maxLength: 6 }).map((vs) => {
	const seen = new Set<string>();
	return vs.filter((v) => {
		if (seen.has(v.mirrorId)) return false;
		seen.add(v.mirrorId);
		return true;
	});
});

describe("cliquet core (front port of Go regression.go)", () => {
	it("is deterministic — same input, same output", () => {
		fc.assert(
			fc.property(setArb, setArb, (base, cand) => {
				expect(regressed(base, cand)).toEqual(regressed(base, cand));
			}),
		);
	});

	it("regressed IFF green at baseline AND red on candidate (and present in both)", () => {
		fc.assert(
			fc.property(setArb, setArb, (base, cand) => {
				const candById = new Map(cand.map((c) => [c.mirrorId, c]));
				const got = new Set(regressed(base, cand).map((r) => r.mirrorId));
				for (const b of base) {
					const c = candById.get(b.mirrorId);
					const want = b.status === "green" && !!c && c.status === "red";
					expect(got.has(b.mirrorId)).toBe(want);
				}
			}),
		);
	});

	it("regressed set is sorted by mirror id", () => {
		fc.assert(
			fc.property(setArb, setArb, (base, cand) => {
				const r = regressed(base, cand);
				for (let i = 1; i < r.length; i++) {
					expect(r[i - 1].mirrorId < r[i].mirrorId).toBe(true);
				}
			}),
		);
	});

	it("verdict is ALLOWED iff regressed set is empty, REJECTED otherwise", () => {
		fc.assert(
			fc.property(setArb, setArb, (base, cand) => {
				const res = computeRatchet(base, cand);
				expect(res.verdict).toBe(
					res.regressed.length === 0 ? "ALLOWED" : "REJECTED",
				);
				expect(blockReasonFor(res) === null).toBe(res.verdict === "ALLOWED");
			}),
		);
	});
});

describe("the two declared /goal scenarios", () => {
	it("all-green candidate ⇒ ALLOWED, no regression", () => {
		const res = computeRatchet([...BASELINE], candidateFor("all-green"));
		expect(res.verdict).toBe("ALLOWED");
		expect(res.regressed).toHaveLength(0);
		expect(blockReasonFor(res)).toBeNull();
	});

	it("regressed candidate (S04 wall reddened) ⇒ REJECTED, RED_REGRESSION", () => {
		const res = computeRatchet([...BASELINE], candidateFor("regressed"));
		expect(res.verdict).toBe("REJECTED");
		expect(res.regressedIds).toEqual(["S04-the-wall"]);
		const br = blockReasonFor(res);
		expect(br?.code).toBe(RED_REGRESSION);
	});
});
