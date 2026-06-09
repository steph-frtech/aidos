import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	canonicalize,
	DEMO_KERNELS,
	ERR_MISSING_PROOF_PAIR,
	ERR_NO_FUNCTIONAL,
	FACETS,
	type FacetSet,
	hash,
	type Instance,
	validate,
} from "./facets";

/**
 * Reproducibility mirror (∀) for FK02 — the facets twin lib/facets.ts (FKE-1.3).
 * test_kind=property, cert_language=fast-check, liveness=live, authority=below.
 *
 * The invariants are the human red of KRD FKE-1.3 (mirrors the Go rapid property), NOT
 * invented to be satisfied:
 *   1. TOTAL & DETERMINISTIC: same FacetSet → same verdict, same hash (never throws).
 *   2. NO FUNCTIONAL ⇒ INVALID (F incompressible).
 *   3. F PRESENT ∧ EVERY HARD FACET PROVEN ⇒ VALID.
 *   4. CONTENT-ADDRESSED ROUND-TRIP: hash is order- and kernelId-independent.
 *   5. SOFT X NEVER BLOCKS: X missing its proof pair is advisory.
 */

const LETTERS = FACETS.map((f) => f.letter);

const arbInstance = fc.record({
	facet: fc.constantFrom(...LETTERS),
	hasIntent: fc.boolean(),
	hasProofPair: fc.boolean(),
});

const arbFacetSet: fc.Arbitrary<FacetSet> = fc.record({
	kernelId: fc.string(),
	instances: fc.array(arbInstance, { maxLength: 8 }),
});

describe("FK02 — facets twin (reproducibility mirror)", () => {
	it("the closed set is exactly the eight lenses F/I/S/B/R/V/M/X (X soft)", () => {
		expect(LETTERS).toEqual(["F", "I", "S", "B", "R", "V", "M", "X"]);
		for (const f of FACETS) {
			expect(f.soft).toBe(f.letter === "X");
		}
	});

	it("validate + hash are total & deterministic over arbitrary sets", () => {
		fc.assert(
			fc.property(arbFacetSet, (fs) => {
				const a = validate(fs);
				const b = validate(fs);
				expect(a).toEqual(b);
				expect(hash(fs)).toBe(hash(fs));
			}),
		);
	});

	it("a set without a functional facet is always invalid", () => {
		fc.assert(
			fc.property(arbFacetSet, (fs) => {
				const stripped: FacetSet = {
					...fs,
					instances: fs.instances.filter((i) => i.facet !== "F"),
				};
				const res = validate(stripped);
				expect(res.hasFunctional).toBe(false);
				expect(res.valid).toBe(false);
				expect(res.issues.some((x) => x.code === ERR_NO_FUNCTIONAL)).toBe(true);
			}),
		);
	});

	it("F present ∧ all distinct facets proven ⇒ valid", () => {
		fc.assert(
			fc.property(
				fc.subarray([...LETTERS].filter((l) => l !== "F")),
				(extra) => {
					const insts: Instance[] = [
						{ facet: "F", hasIntent: true, hasProofPair: true },
						...extra.map((l) => ({
							facet: l,
							hasIntent: true,
							hasProofPair: true,
						})),
					];
					const res = validate({ instances: insts });
					expect(res.valid).toBe(true);
					expect(res.hasFunctional).toBe(true);
				},
			),
		);
	});

	it("hash is order- and kernelId-independent (content-addressed round-trip)", () => {
		fc.assert(
			fc.property(arbFacetSet, fc.array(fc.nat()), (fs, perm) => {
				const shuffled = [...fs.instances];
				// deterministic permutation from the drawn naturals.
				for (let i = shuffled.length - 1; i > 0; i--) {
					const j = (perm[i] ?? 0) % (i + 1);
					[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
				}
				const other: FacetSet = {
					kernelId: `${fs.kernelId}-x`,
					instances: shuffled,
				};
				expect(hash(other)).toBe(hash(fs));
				expect(canonicalize(other)).toEqual(canonicalize(fs));
			}),
		);
	});

	it("hash changes when a facet declaration changes", () => {
		const base: FacetSet = {
			instances: [
				{ facet: "F", hasIntent: true, hasProofPair: true },
				{ facet: "S", hasIntent: true, hasProofPair: true },
			],
		};
		const flipped: FacetSet = {
			instances: [
				{ facet: "F", hasIntent: true, hasProofPair: true },
				{ facet: "S", hasIntent: true, hasProofPair: false },
			],
		};
		expect(hash(base)).not.toBe(hash(flipped));
	});

	it("soft X missing its proof pair is advisory, never blocks", () => {
		const res = validate({
			instances: [
				{ facet: "F", hasIntent: true, hasProofPair: true },
				{ facet: "X", hasIntent: true, hasProofPair: false },
			],
		});
		expect(res.valid).toBe(true);
		expect(
			res.issues.some(
				(x) =>
					x.facet === "X" && x.code === ERR_MISSING_PROOF_PAIR && x.advisory,
			),
		).toBe(true);
	});

	it("the demo catalogue carries the legal shapes + two monsters", () => {
		const byId = Object.fromEntries(
			DEMO_KERNELS.map((k) => [k.id, validate(k.facetSet)]),
		);
		expect(byId["k-sort"].valid).toBe(true); // F+I+M
		expect(byId["k-pii"].valid).toBe(true); // all eight
		expect(byId["k-view"].valid).toBe(true); // F+X
		expect(byId["k-nof"].valid).toBe(false); // no F
		expect(byId["k-nopair"].valid).toBe(false); // S without proof pair
	});
});
