import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { FacetLetter } from "./grid";
import {
	contractFor,
	type ELevel,
	mapNToE,
	N_LEVELS,
	type NLevel,
	tag,
} from "./prooftype";

/**
 * Reproducibility mirror (∀) for FK05 — the E0-E7 proof-typing twin lib/prooftype.ts (KRD FKE-16).
 * Mirrors the Go rapid property (back/kernel/mirror/prooftype). test_kind=property,
 * cert_language=fast-check, liveness=live, authority=below (a means-test — CLAUDE.md §8).
 *
 * The five invariants are the human red of FKE-16 / the FK05 done-criteria, NOT invented to be
 * satisfied:
 *   1. mapNToE is TOTAL & DETERMINISTIC — same N → byte-identical, sorted, ascending E set.
 *   2. contractFor is DETERMINISTIC & ORDER-INDEPENDENT — same proof (any facet order) → same contract.
 *   3. the double-label is ADDITIVE — tag.n === in.nLevel verbatim (zéro miroir N modifié), always.
 *   4. the added types are GATED — E4 ⇔ S, E6 ⇔ (R∨V), E7 ⇔ requiresFormal.
 *   5. the soft facet X never adds a hard E (§13.6).
 */

const ALL_FACETS: FacetLetter[] = ["F", "I", "S", "B", "R", "V", "M", "X"];

const arbN: fc.Arbitrary<NLevel | string> = fc.oneof(
	fc.constantFrom<NLevel>(...N_LEVELS),
	fc.constantFrom("N6", "N9", "" as string),
);

const arbFacets: fc.Arbitrary<FacetLetter[]> = fc.subarray(ALL_FACETS);

function isSortedAsc(es: ELevel[]): boolean {
	for (let i = 1; i < es.length; i++) if (es[i] < es[i - 1]) return false;
	return true;
}

describe("FK05 prooftype — reproducibility mirror", () => {
	it("1. mapNToE is total & deterministic (sorted ascending)", () => {
		fc.assert(
			fc.property(arbN, (n) => {
				const a = mapNToE(n);
				const b = mapNToE(n);
				expect(a).toEqual(b);
				expect(isSortedAsc(a)).toBe(true);
				const real = (N_LEVELS as string[]).includes(n);
				expect(a.length > 0).toBe(real);
			}),
		);
	});

	it("2. contractFor is deterministic & order-independent", () => {
		fc.assert(
			fc.property(
				arbN,
				arbFacets,
				fc.boolean(),
				(n, facets, requiresFormal) => {
					const base = contractFor({ nLevel: n, facets, requiresFormal });
					const rev = contractFor({
						nLevel: n,
						facets: [...facets].reverse(),
						requiresFormal,
					});
					expect(base).toEqual(rev);
					expect(isSortedAsc(base.required)).toBe(true);
					// deduplicated
					expect(new Set(base.required).size).toBe(base.required.length);
				},
			),
		);
	});

	it("3. the double-label is additive — tag preserves N verbatim", () => {
		fc.assert(
			fc.property(
				arbN,
				arbFacets,
				fc.boolean(),
				(n, facets, requiresFormal) => {
					const t = tag({ nLevel: n, facets, requiresFormal });
					expect(t.n).toBe(n);
					expect(t.e.nLevel).toBe(n);
					expect(t.e).toEqual(
						contractFor({ nLevel: n, facets, requiresFormal }),
					);
				},
			),
		);
	});

	it("4. the added types are gated — E4⇔S, E6⇔(R∨V), E7⇔formal", () => {
		fc.assert(
			fc.property(arbFacets, fc.boolean(), (facets, requiresFormal) => {
				// base N0 → {E3} contains none of E4/E6/E7, so the iff is exact.
				const c = contractFor({ nLevel: "N0", facets, requiresFormal });
				const hasS = facets.includes("S");
				const hasRorV = facets.includes("R") || facets.includes("V");
				expect(c.required.includes(4)).toBe(hasS);
				expect(c.required.includes(6)).toBe(hasRorV);
				expect(c.required.includes(7)).toBe(requiresFormal);
			}),
		);
	});

	it("5. the soft facet X adds no hard E (§13.6)", () => {
		const withX = contractFor({
			nLevel: "N0",
			facets: ["X"],
			requiresFormal: false,
		});
		const base = contractFor({
			nLevel: "N0",
			facets: [],
			requiresFormal: false,
		});
		expect(withX.required).toEqual(base.required);
		expect(withX.fromFacets).toEqual([]);
	});
});
