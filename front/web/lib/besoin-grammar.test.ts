/**
 * lib/besoin-grammar.test.ts — the front reproducibility mirror of the EL02 grammar twin
 * (vitest + fast-check). Determinism-first (CLAUDE.md §6/§8): the grammar functions are pure and
 * total — same input → same output. These properties mirror back/runtime/besoin/grammar_property_test.go.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	allLevels,
	attachableTo,
	isLevel,
	isOutOfScope,
	isTransversalBand,
	levels,
	nextLevel,
	outgoingRef,
	outOfScopeLevels,
	parseLevel,
	prevLevel,
	SOURCE_ORDER,
	specOf,
	transversalBands,
} from "./besoin-grammar";

describe("besoin grammar — closed total order", () => {
	it("SOURCE order is the 7 §23 rungs, closed and stable across calls", () => {
		const want = [
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
			"entity",
		];
		expect(levels()).toEqual(want);
		// determinism: stable across many calls
		for (let n = 0; n < 50; n++) expect(levels()).toEqual(want);
	});

	it("nextLevel walks the SOURCE order, stops at the entity leaf", () => {
		for (let i = 0; i < SOURCE_ORDER.length - 1; i++) {
			expect(nextLevel(SOURCE_ORDER[i])).toBe(SOURCE_ORDER[i + 1]);
		}
		expect(nextLevel("entity")).toBeNull();
		expect(prevLevel("product")).toBeNull();
	});

	it("transversal bands are never traversed by nextLevel/prevLevel", () => {
		expect(transversalBands()).toEqual(["invariant", "policy"]);
		for (const b of transversalBands()) {
			expect(isTransversalBand(b)).toBe(true);
			expect(nextLevel(b)).toBeNull();
			expect(prevLevel(b)).toBeNull();
		}
	});
});

describe("besoin grammar — hard refusal of out-of-grammar", () => {
	it("any unknown string is refused (no alias)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				if (isLevel(s)) return; // a real level by chance
				expect(parseLevel(s).ok).toBe(false);
			}),
		);
	});

	it("saga/temporal/globalinvariant are out-of-scope, refused, not aliased", () => {
		expect(outOfScopeLevels()).toEqual(["saga", "temporal", "globalinvariant"]);
		for (const l of outOfScopeLevels()) {
			expect(isLevel(l)).toBe(false);
			expect(isOutOfScope(l)).toBe(true);
			const r = parseLevel(l);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toBe("out_of_scope");
		}
	});

	it("parseLevel round-trips every valid level deterministically", () => {
		for (const l of allLevels()) {
			const r = parseLevel(l);
			expect(r.ok).toBe(true);
			if (r.ok) expect(r.level).toBe(l);
		}
		fc.assert(
			fc.property(fc.constantFrom(...allLevels()), (l) => {
				expect(parseLevel(l)).toEqual(parseLevel(l));
			}),
		);
	});
});

describe("besoin grammar — per-level shape", () => {
	it("every SOURCE rung except the entity leaf resolves toward the rung below it", () => {
		for (let i = 0; i < SOURCE_ORDER.length; i++) {
			const ref = outgoingRef(SOURCE_ORDER[i]);
			if (i === SOURCE_ORDER.length - 1) {
				expect(ref).toBeNull();
			} else {
				expect(ref?.refTo).toBe(SOURCE_ORDER[i + 1]);
				expect(ref?.refField).toBeTruthy();
			}
		}
		for (const b of transversalBands()) expect(outgoingRef(b)).toBeNull();
	});

	it("every level has a non-empty required field set; non-levels have no spec", () => {
		for (const l of allLevels()) {
			expect(specOf(l)?.requiredFields.length).toBeGreaterThan(0);
		}
		expect(specOf("saga")).toBeNull();
	});

	it("policy attaches to operation/entity only; invariant to every SOURCE rung", () => {
		for (const rung of levels()) {
			expect(attachableTo("policy", rung)).toBe(
				rung === "operation" || rung === "entity",
			);
			expect(attachableTo("invariant", rung)).toBe(true);
		}
		// a SOURCE rung is not a band → null
		expect(attachableTo("product", "entity")).toBeNull();
	});
});
