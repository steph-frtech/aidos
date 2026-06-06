import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { allLevels, nextLevel, specOf } from "./besoin-grammar";
import {
	defaultThresholds,
	enumerableOptionSpacePairs,
	openQuestionOptionSpacePairs,
	optionSpaceFor,
	optionSpacePairs,
	optionSpaceSize,
	requiredFieldsFor,
	thresholdsHash,
} from "./besoin-thresholds";

// besoin-thresholds.test.ts — the EL06 TS mirror, byte-equivalent to thresholds_property_test.go.
// BesoinThresholds: single declared source, no second copy, content-addressed, reproducible.
// OptionSpace: enumerable pairs count positive; non-enumerable pairs are declared OpenQuestions
// (size -1), never fabricated to 0; pairs are adjacent SOURCE rungs; reproducible.

describe("BesoinThresholds", () => {
	it("defaults are reproducible (same record + same hash)", async () => {
		const first = defaultThresholds();
		const firstHash = await thresholdsHash(first);
		for (let n = 0; n < 10; n++) {
			const again = defaultThresholds();
			expect(again.maxScenarios).toBe(first.maxScenarios);
			expect(await thresholdsHash(again)).toBe(firstHash);
		}
	});

	it("declares the product ≤5 scenarios bound (single source, not a magic number)", () => {
		const th = defaultThresholds();
		expect(th.maxScenarios).toBeGreaterThan(0);
		expect(th.maxScenarios).toBe(5);
	});

	it("required fields have NO second copy — equal to the grammar spec for every level", () => {
		for (const l of allLevels()) {
			const fromThresholds = requiredFieldsFor(l);
			expect(fromThresholds).not.toBeNull();
			// specOf is the single source; requiredFieldsFor must equal it exactly (no second,
			// drifting copy). Compare the two DISTINCT accessors, not the function against itself.
			const fromSpec = specOf(l)?.requiredFields ?? null;
			expect(fromThresholds).toEqual(fromSpec);
		}
	});

	it("required fields are total over the grammar, null for out-of-grammar", () => {
		for (const l of allLevels()) {
			expect(requiredFieldsFor(l)).not.toBeNull();
		}
		expect(requiredFieldsFor("saga")).toBeNull();
	});

	it("is content-addressed and immutable (mutating a returned slice does not change the hash)", async () => {
		const th = defaultThresholds();
		const h = await thresholdsHash(th);
		const got = requiredFieldsFor("product");
		if (got && got.length > 0) got[0] = "tampered";
		expect(await thresholdsHash(th)).toBe(h);
	});
});

describe("OptionSpace", () => {
	it("enumerable pairs count a positive integer deterministically", () => {
		for (const p of optionSpacePairs()) {
			const os = optionSpaceFor(p.from, p.to);
			expect(os).not.toBeNull();
			if (!os) continue;
			if (!os.enumerable) continue;
			const n = optionSpaceSize(os);
			expect(n).toBeGreaterThan(0);
			expect(n).toBe(os.choices.length);
		}
	});

	it("non-enumerable pair is a declared OpenQuestion, never counted as 0 (size -1)", () => {
		for (const p of optionSpacePairs()) {
			const os = optionSpaceFor(p.from, p.to);
			if (!os) continue;
			if (os.enumerable) {
				expect(os.openQuestion).toBe("");
				continue;
			}
			expect(os.openQuestion).not.toBe("");
			expect(optionSpaceSize(os)).not.toBe(0);
			expect(optionSpaceSize(os)).toBe(-1);
		}
	});

	it("pairs are exactly the adjacent SOURCE-rung pairs", () => {
		for (const p of optionSpacePairs()) {
			expect(nextLevel(p.from)).toBe(p.to);
		}
		const enumerablePlusOpen =
			enumerableOptionSpacePairs().length +
			openQuestionOptionSpacePairs().length;
		expect(enumerablePlusOpen).toBe(optionSpacePairs().length);
	});

	it("reproducible — same pair → same OptionSpace", () => {
		const pairs = optionSpacePairs();
		fc.assert(
			fc.property(fc.integer({ min: 0, max: pairs.length - 1 }), (i) => {
				const p = pairs[i];
				const first = optionSpaceFor(p.from, p.to);
				const again = optionSpaceFor(p.from, p.to);
				expect(again).toEqual(first);
			}),
		);
	});

	it("unknown / non-adjacent pair is not found", () => {
		expect(optionSpaceFor("entity", "product")).toBeNull();
		expect(optionSpaceFor("saga", "temporal")).toBeNull();
	});
});
