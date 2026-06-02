/**
 * Reproducibility mirror for the ContextGraphDecision twin (lib/contextgraph.ts), AIDOS step S32.
 * fast-check (∀) — the SAME invariants the Go rapid property pins: decide is deterministic (now
 * passed, never read from the clock); expired ⇒ mayReuse=false; out-of-scope ⇒ mayReuse=false
 * (no_reuse_outside_scope); mayReuse=true ⇒ all four dimensions checked; the verdict references
 * ONLY the given candidate (no invention). Determinism-first: the screen computes the verdict
 * from this pure twin, never an LLM and never re-implementing the gate.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Candidate,
	DIMENSIONS,
	decide,
	type RequestContext,
} from "./contextgraph";

const REGIONS = ["FR", "EU", "US", "*", ""] as const;
const arbRegion = fc.constantFrom(...REGIONS);

const arbCandidate: fc.Arbitrary<Candidate> = fc.record({
	id: fc.string(),
	scope: fc.record({ region: arbRegion }),
	expiresAt: fc.option(
		fc
			.date({
				min: new Date("2000-01-01"),
				max: new Date("2050-01-01"),
				noInvalidDate: true,
			})
			.map((d) => d.toISOString()),
		{
			nil: undefined,
		},
	),
});

const arbRequest: fc.Arbitrary<RequestContext> = fc.record({
	scope: fc.record({ region: arbRegion }),
});

const arbNow = fc.date({
	min: new Date("2000-01-01"),
	max: new Date("2050-01-01"),
	noInvalidDate: true,
});

describe("ContextGraphDecision twin — the deterministic, LLM-free reuse gate", () => {
	it("decide is deterministic — same (candidate, request, now) ⇒ same verdict", () => {
		fc.assert(
			fc.property(arbCandidate, arbRequest, arbNow, (c, r, now) => {
				const d1 = decide(c, r, now);
				const d2 = decide(c, r, now);
				expect(d1).toEqual(d2);
			}),
		);
	});

	it("an expired candidate is never reusable", () => {
		fc.assert(
			fc.property(
				fc.date({
					min: new Date("2000-01-01"),
					max: new Date("2040-01-01"),
					noInvalidDate: true,
				}),
				fc.integer({ min: 1, max: 100_000_000 }),
				(exp, deltaSec) => {
					const now = new Date(exp.getTime() + deltaSec * 1000);
					const c: Candidate = {
						id: "c",
						scope: { region: "EU" },
						expiresAt: exp.toISOString(),
					};
					const r: RequestContext = { scope: { region: "EU" } };
					expect(decide(c, r, now).mayReuse).toBe(false);
				},
			),
		);
	});

	it("an out-of-scope candidate is never reusable (no_reuse_outside_scope)", () => {
		const concrete = ["FR", "EU", "US"] as const;
		fc.assert(
			fc.property(
				fc.constantFrom(...concrete),
				fc.constantFrom(...concrete),
				(cr, rr) => {
					fc.pre(cr !== rr);
					const c: Candidate = {
						id: "c",
						scope: { region: cr },
						expiresAt: "2099-01-01T00:00:00Z",
					};
					const r: RequestContext = { scope: { region: rr } };
					expect(decide(c, r, new Date("2026-01-01T00:00:00Z")).mayReuse).toBe(
						false,
					);
				},
			),
		);
	});

	it("mayReuse=true ⇒ all four dimensions are checked, in order", () => {
		fc.assert(
			fc.property(arbCandidate, arbRequest, arbNow, (c, r, now) => {
				const d = decide(c, r, now);
				if (d.mayReuse) {
					expect(d.checked).toEqual(DIMENSIONS);
					expect(d.requiredHumanReview).toBe(false);
				}
			}),
		);
	});

	it("the verdict references ONLY the given candidate (never invents an id)", () => {
		fc.assert(
			fc.property(arbCandidate, arbRequest, arbNow, (c, r, now) => {
				expect(decide(c, r, now).candidateId).toBe(c.id);
			}),
		);
	});
});
