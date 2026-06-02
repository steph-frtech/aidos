/**
 * Reproducibility mirror (fast-check) for the RealityMirror twin (AIDOS step S43) — the
 * front twin of back/runtime/reality. Invariants (KRD §53/§67/§117/§1099):
 *
 *   (1) learn carries the incident ref VERBATIM as the idea provenance, and never invents a
 *       proposes kind when the signal doesn't pin it (unset ⇒ OpenQuestion);
 *   (2) the produced idea never carries a mirror (hasMirror is the literal false) and never
 *       writes the kernel (wroteKernel false);
 *   (3) toKernel ALWAYS returns REALITY_CANNOT_DECLARE_TRUTH for EVERY incident.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Incident,
	inferProposes,
	learn,
	REALITY_CANNOT_DECLARE_TRUTH,
	type Taint,
	toKernel,
} from "./reality";

const TAINTS: Taint[] = [
	"unverified",
	"stale",
	"user_claim",
	"incident_derived",
	"external_source",
];

const arbIncident = (): fc.Arbitrary<Incident> =>
	fc.record({
		id: fc.string(),
		ref: fc.integer({ min: 0, max: 999999 }).map((n) => `#${n}`),
		signal: fc.record({
			operation: fc.constantFrom("", "createOrder", "pay", "ship"),
			error: fc.string(),
			recurrence: fc.integer({ min: 1, max: 100000 }),
		}),
		causeSketch: fc.string(),
		taint: fc.uniqueArray(fc.constantFrom(...TAINTS)),
		linkedBranches: fc.array(fc.string(), { maxLength: 3 }),
	});

describe("RealityMirror twin", () => {
	it("learn carries the ref verbatim and never invents proposes", () => {
		fc.assert(
			fc.property(arbIncident(), (inc) => {
				const cand = learn(inc);
				expect(cand.provenanceSource).toBe("incident");
				expect(cand.provenanceDetail).toBe(inc.ref);
				expect(cand.status).toBe("draft");
				expect(cand.intent).toBe(inc.causeSketch);

				const [, pinned] = inferProposes(inc.signal);
				expect(cand.proposesPinned).toBe(pinned);
				if (pinned) {
					expect(cand.proposes).not.toBe("");
					expect(cand.openQuestion).toBeUndefined();
				} else {
					expect(cand.proposes).toBe("");
					expect(cand.openQuestion).toBeTruthy();
				}
				// the idea carries no mirror and writes no kernel.
				expect(cand.hasMirror).toBe(false);
				expect(cand.wroteKernel).toBe(false);
			}),
		);
	});

	it("learn is deterministic (same incident ⇒ same candidate)", () => {
		fc.assert(
			fc.property(arbIncident(), (inc) => {
				expect(learn(inc)).toEqual(learn(inc));
			}),
		);
	});

	it("toKernel ALWAYS blocks with REALITY_CANNOT_DECLARE_TRUTH", () => {
		fc.assert(
			fc.property(arbIncident(), (inc) => {
				const br = toKernel(inc);
				expect(br.code).toBe("REALITY_CANNOT_DECLARE_TRUTH");
				expect(br).toBe(REALITY_CANNOT_DECLARE_TRUTH);
				expect(br.howToFix.length).toBeGreaterThan(0);
			}),
		);
	});
});
