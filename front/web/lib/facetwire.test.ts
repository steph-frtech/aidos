import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	type RungState,
	wireColumn,
	wireSkeleton,
} from "./facetwire";

function fullColumn(facet: Facet): Column {
	return {
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	};
}

function breakEvidence(col: Column): Column {
	return {
		...col,
		rungs: col.rungs.map((r) =>
			r.rung === "6-evidence" ? { ...r, proven: false } : r,
		),
	};
}

const HARD: Facet[] = ["S", "R", "V", "M"];

describe("facetwire (FK08 twin)", () => {
	it("aligned column is green and names its reused sensor", () => {
		for (const f of NON_FUNCTIONAL_COLUMNS) {
			const cr = wireColumn(fullColumn(f));
			expect(cr.verdict).toBe("green");
			expect(cr.sensor).not.toBe("");
		}
	});

	it("breaking a pair reddens THAT hard column (fault-injection)", () => {
		for (const f of HARD) {
			const cr = wireColumn(breakEvidence(fullColumn(f)));
			expect(cr.verdict).toBe("red");
			expect(
				cr.divergences.some(
					(d) => d.rung === "6-evidence" && d.kind === "pair_broken",
				),
			).toBe(true);
		}
	});

	it("the soft X column stays green and surfaces an advisory (never blocks)", () => {
		const cr = wireColumn(breakEvidence(fullColumn("X")));
		expect(cr.verdict).toBe("green");
		expect(cr.advisories.length).toBeGreaterThan(0);
		expect(cr.advisories.every((d) => d.advisory)).toBe(true);
	});

	it("a skeleton whose only broken column is X stays green; a broken hard column reddens it", () => {
		const onlyX = wireSkeleton({
			kernel_id: "checkout",
			columns: [...HARD.map(fullColumn), breakEvidence(fullColumn("X"))],
		});
		expect(onlyX.verdict).toBe("green");

		const brokenS = wireSkeleton({
			kernel_id: "checkout",
			columns: [
				breakEvidence(fullColumn("S")),
				...["R", "V", "M", "X"].map((f) => fullColumn(f as Facet)),
			],
		});
		expect(brokenS.verdict).toBe("red");
		// orthogonality: R/V/M stay green.
		for (const cr of brokenS.columns) {
			if (cr.facet !== "S" && cr.facet !== "X")
				expect(cr.verdict).toBe("green");
		}
	});

	it("property: same input → same verdict, invariant under rung reordering; X never blocks", () => {
		const facetArb = fc.constantFrom<Facet>(...NON_FUNCTIONAL_COLUMNS);
		const rungArb = (): fc.Arbitrary<RungState[]> =>
			fc
				.tuple(...RUNGS.map(() => fc.tuple(fc.boolean(), fc.boolean())))
				.map((flags) =>
					RUNGS.map((rung, i) => ({
						rung,
						declared: flags[i][0],
						proven: flags[i][1],
					})),
				);
		fc.assert(
			fc.property(facetArb, rungArb(), (facet, rungs) => {
				const col: Column = { facet, rungs };
				const a = wireColumn(col);
				const b = wireColumn({ ...col, rungs: [...rungs].reverse() });
				expect(a.verdict).toBe(b.verdict);
				expect(a.divergences).toEqual(b.divergences);
				if (facet === "X") {
					expect(a.verdict).toBe("green");
					expect(a.divergences.length).toBe(0);
				}
			}),
		);
	});
});
