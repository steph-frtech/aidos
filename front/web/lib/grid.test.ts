import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	affectedCells,
	buildGrid,
	cellHash,
	depth,
	FACETS,
	type FacetLetter,
	gridHash,
	markStale,
	project,
	RUNGS,
	type Rung,
	resolve,
	type Truth,
} from "./grid";

/**
 * Reproducibility mirror (∀) for FK03 — the grille twin lib/grid.ts (FKE-1.4). Mirrors the Go
 * rapid property. test_kind=property, cert_language=fast-check, liveness=live, authority=below.
 *
 * The invariants are the human red of KRD FKE-1.4, NOT invented to be satisfied:
 *   1. TOTAL & DETERMINISTIC: same input → same output (never throws on a valid coordinate).
 *   2. LAW 1 — resolve round-trips its coordinate; distinct coordinates ⇒ distinct hashes.
 *   3. LAW 2 — markStale returns EXACTLY the source rungs strictly above, top-down.
 *   4. LAW 3 — affectedCells holds the facet constant + leaves the other facets untouched;
 *      project on facet A is invariant under any change confined to facet B.
 */

const arbRung = () => fc.constantFrom<Rung>(...RUNGS);
const arbFacet = () => fc.constantFrom<FacetLetter>(...FACETS);

describe("FK03 grille — the two axes", () => {
	// INV 1 + 2
	it("LAW 1 — resolve is deterministic, round-trips, injective", () => {
		fc.assert(
			fc.property(
				arbRung(),
				arbFacet(),
				arbRung(),
				arbFacet(),
				(r1, f1, r2, f2) => {
					const c1 = resolve(r1, f1);
					expect(c1.rung).toBe(r1);
					expect(c1.facet).toBe(f1);
					expect(cellHash(resolve(r1, f1))).toBe(cellHash(c1));
					const c2 = resolve(r2, f2);
					if (r1 !== r2 || f1 !== f2) {
						expect(cellHash(c1)).not.toBe(cellHash(c2));
					}
				},
			),
		);
	});

	it("LAW 1 — resolve refuses out-of-set coordinates (no default cell)", () => {
		expect(() => resolve("invariant", "F")).toThrow();
		expect(() => resolve("entity", "Z")).toThrow();
	});

	// INV 3 — lateral coupling
	it("LAW 2 — markStale is exactly the source rungs strictly above, top-down", () => {
		fc.assert(
			fc.property(arbRung(), (r) => {
				const stale = markStale(r);
				expect(stale.length).toBe(depth(r));
				let prev = -1;
				for (const s of stale) {
					expect(depth(s)).toBeLessThan(depth(r)); // strictly above
					expect(s).not.toBe(r); // never the changed rung
					expect(depth(s)).toBeGreaterThan(prev); // top-down
					prev = depth(s);
				}
			}),
		);
	});

	it("LAW 2 — a low change marks the source rungs above; the summit marks nothing", () => {
		expect(markStale("entity")).toEqual([
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
		]);
		expect(markStale("product")).toEqual([]);
	});

	// INV 4a — facet held constant; others untouched
	it("LAW 3 — affectedCells holds the facet constant; the other 7 are untouched", () => {
		fc.assert(
			fc.property(arbRung(), arbFacet(), (r, f) => {
				const aff = affectedCells({ rung: r, facet: f });
				for (const c of aff.staleCells) {
					expect(c.facet).toBe(f); // the mark never crosses a facet
					expect(depth(c.rung)).toBeLessThan(depth(r));
				}
				expect(aff.staleCells.length).toBe(aff.staleRungs.length);
				expect(aff.untouchedFacets.length).toBe(FACETS.length - 1);
				expect(aff.untouchedFacets).not.toContain(f);
			}),
		);
	});

	// INV 4b — project invariant under a foreign-facet change
	it("LAW 3 — project(A) is invariant under any change confined to facet B", () => {
		fc.assert(
			fc.property(
				arbFacet(),
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 4 }),
						rung: arbRung(),
					}),
					{ maxLength: 5 },
				),
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 4 }),
						rung: arbRung(),
						facet: arbFacet(),
					}),
					{ maxLength: 5 },
				),
				(a, baseSpecs, foreignSpecs) => {
					const base: Truth[] = baseSpecs.map((s) => ({
						id: `A${s.id}`,
						rung: s.rung,
						facet: a,
					}));
					const before = project(base, a);
					// add truths on facets OTHER than A only.
					const changed: Truth[] = [...base];
					for (const s of foreignSpecs) {
						if (s.facet === a) continue;
						changed.push({ id: `B${s.id}`, rung: s.rung, facet: s.facet });
					}
					const after = project(changed, a);
					expect(after.truths).toEqual(before.truths);
				},
			),
		);
	});

	// INV 1 — buildGrid deterministic
	it("buildGrid is deterministic + one column per canonical facet", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 5 }),
						rung: arbRung(),
						facet: arbFacet(),
					}),
					{ maxLength: 8 },
				),
				(specs) => {
					const truths: Truth[] = specs;
					const g1 = buildGrid(truths);
					const g2 = buildGrid(truths);
					expect(g1.columns.length).toBe(FACETS.length);
					expect(gridHash(g1)).toBe(gridHash(g2));
				},
			),
		);
	});
});
