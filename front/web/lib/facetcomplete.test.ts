import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	computeFacetCompleteness,
	FACETS,
	type FacetLayer,
	type FacetLetter,
	type FacetMirror,
	SOFT_FACETS,
} from "./facetcomplete";

/**
 * Reproducibility mirror (∀) for FK04 — the facet-aware completeness twin lib/facetcomplete.ts
 * (FKE-1.3 conséquence 5). Mirrors the Go rapid property. test_kind=property,
 * cert_language=fast-check, liveness=live, authority=below.
 *
 * The invariants are the human red of FKE-1.3 conséquence 5, NOT invented to be satisfied:
 *   1. TOTAL & DETERMINISTIC: same cut → byte-identical Result (the reproducibility mirror).
 *   2. FAULT-INJECTION: removing a pair of an instantiated non-soft facet → a monster.
 *   3. COLLAPSED legal kernel (F alone, pair living) → COMPLETE.
 *   4. ANTI OVER-CONSTRAINT: an undeclared facet never produces a monster.
 *   5. SOFT X: a missing X pair is advisory, never a hard monster.
 */

const arbFacet = (): fc.Arbitrary<FacetLetter> => fc.constantFrom(...FACETS);

const arbLayer = (): fc.Arbitrary<FacetLayer> =>
	fc.record({
		layerId: fc.constantFrom("a", "b", "c"),
		version: fc.constant("v1"),
		kind: fc.constant("operation"),
		facets: fc.uniqueArray(arbFacet(), { minLength: 1, maxLength: 4 }),
	});

const arbMirror = (): fc.Arbitrary<FacetMirror> =>
	fc
		.record({
			mirrorId: fc.constantFrom("m1", "m2", "m3"),
			reflectsId: fc.constantFrom("a", "b", "c"),
			reflectsVersion: fc.constant("v1"),
			facet: arbFacet(),
			testKind: fc.constant("fixture"),
			alive: fc.boolean(),
		})
		.map((r) => ({
			mirrorId: r.mirrorId,
			reflectsId: r.reflectsId,
			reflectsVersion: r.reflectsVersion,
			facet: r.facet,
			testKind: r.testKind,
			certLanguage: r.alive ? "rapid" : "prose",
			liveness: (r.alive ? "alive" : "dead") as "alive" | "dead",
		}));

describe("FK04 — facet-aware completeness twin (reproducibility mirror)", () => {
	it("INV1 — total & deterministic: same cut → identical Result", () => {
		fc.assert(
			fc.property(
				fc.array(arbLayer(), { maxLength: 3 }),
				fc.array(arbMirror(), { maxLength: 4 }),
				(layers, mirrors) => {
					const r1 = computeFacetCompleteness(layers, mirrors);
					const r2 = computeFacetCompleteness(layers, mirrors);
					expect(r1).toEqual(r2);
				},
			),
		);
	});

	it("INV2 — fault-injection: removing a non-soft facet pair yields a monster", () => {
		const layer: FacetLayer = {
			layerId: "op1",
			version: "v1",
			kind: "operation",
			facets: ["F", "S"],
		};
		const full: FacetMirror[] = [
			{
				mirrorId: "m-f",
				reflectsId: "op1",
				reflectsVersion: "v1",
				facet: "F",
				testKind: "fixture",
				certLanguage: "fixture",
				liveness: "alive",
			},
			{
				mirrorId: "m-s",
				reflectsId: "op1",
				reflectsVersion: "v1",
				facet: "S",
				testKind: "property",
				certLanguage: "rapid",
				liveness: "alive",
			},
		];
		expect(computeFacetCompleteness([layer], full).verdict).toBe("COMPLETE");
		// Remove the S pair.
		const injured = computeFacetCompleteness([layer], [full[0]]);
		expect(injured.verdict).toBe("RED_MONSTER");
		expect(injured.facetMonsters).toHaveLength(1);
		expect(injured.facetMonsters[0].facet).toBe("S");
		expect(injured.facetMonsters[0].advisory).toBe(false);
	});

	it("INV3 — collapsed legal kernel (F alone, pair living) → COMPLETE", () => {
		const layer: FacetLayer = {
			layerId: "sort",
			version: "v1",
			kind: "operation",
			facets: ["F"],
		};
		const r = computeFacetCompleteness(
			[layer],
			[
				{
					mirrorId: "m-f",
					reflectsId: "sort",
					reflectsVersion: "v1",
					facet: "F",
					testKind: "fixture",
					certLanguage: "fixture",
					liveness: "alive",
				},
			],
		);
		expect(r.verdict).toBe("COMPLETE");
		expect(r.facetMonsters).toHaveLength(0);
	});

	it("INV4 — anti over-constraint: an undeclared facet never produces a monster", () => {
		fc.assert(
			fc.property(
				fc.array(arbLayer(), { maxLength: 3 }),
				fc.array(arbMirror(), { maxLength: 4 }),
				(layers, mirrors) => {
					const r = computeFacetCompleteness(layers, mirrors);
					const declared = new Set<string>();
					for (const l of layers)
						for (const f of l.facets) declared.add(`${l.layerId} ${f}`);
					for (const m of [...r.facetMonsters, ...r.advisory]) {
						expect(declared.has(`${m.layerId} ${m.facet}`)).toBe(true);
					}
				},
			),
		);
	});

	it("INV5 — soft X: a missing X pair is advisory, never a hard monster", () => {
		const layer: FacetLayer = {
			layerId: "view1",
			version: "v1",
			kind: "view",
			facets: ["F", "X"],
		};
		const r = computeFacetCompleteness(
			[layer],
			[
				{
					mirrorId: "m-f",
					reflectsId: "view1",
					reflectsVersion: "v1",
					facet: "F",
					testKind: "e2e",
					certLanguage: "gherkin",
					liveness: "alive",
				},
			],
		);
		expect(r.verdict).toBe("COMPLETE");
		expect(r.facetMonsters).toHaveLength(0);
		expect(r.advisory).toHaveLength(1);
		expect(r.advisory[0].facet).toBe("X");
		// And X is the only soft facet.
		expect([...SOFT_FACETS]).toEqual(["X"]);
	});
});
