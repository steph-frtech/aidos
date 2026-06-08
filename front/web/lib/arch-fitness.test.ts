import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_STRUCTURAL_REGRESSION,
	type DepGraph,
	measure,
	propose,
	ratchet,
	type StructuralMetric,
} from "./arch-fitness";

// Reproducibility mirror (S102, fast-check) — the structural ratchet twin pins determinism +
// the done-criterion: a new boundary violation or a new inter-cell cycle BREAKS the ratchet
// and blocks the cut, independent of behavioural mirrors.

const honoredFed = (): Array<{ a: string; b: string }> => [
	{ a: "checkout", b: "billing" },
];

const cleanCut = (): DepGraph => ({
	project: "shop",
	cells: { checkout: 5, billing: 3, catalog: 4 },
	honored: honoredFed(),
	edges: [
		{
			from: "checkout.place",
			fromCell: "checkout",
			to: "billing.charge",
			toCell: "billing",
		},
	],
});

describe("measure", () => {
	it("a clean cut has 0 violations, 0 cycles", () => {
		const m = measure(cleanCut());
		expect(m.boundaryViolations).toBe(0);
		expect(m.interCellCycles).toBe(0);
		expect(m.interBcEdges).toBe(1);
		expect(m.maxCellComplexity).toBe(5);
	});

	it("an uncontracted cross-cell edge is a boundary violation", () => {
		const g = cleanCut();
		g.edges.push({
			from: "checkout.price",
			fromCell: "checkout",
			to: "catalog.lookup",
			toCell: "catalog",
		});
		const m = measure(g);
		expect(m.boundaryViolations).toBe(1);
		expect(m.violations[0].toCell).toBe("catalog");
	});

	it("a back-and-forth cross-cell dependency is an inter-cell cycle", () => {
		const g = cleanCut();
		g.edges.push({
			from: "billing.refund",
			fromCell: "billing",
			to: "checkout.cancel",
			toCell: "checkout",
		});
		const m = measure(g);
		expect(m.interCellCycles).toBe(1);
		expect(m.cycles[0]).toEqual(["billing", "checkout"]);
	});
});

describe("ratchet (the done-criterion)", () => {
	const base: StructuralMetric = {
		project: "shop",
		boundaryViolations: 0,
		interCellCycles: 0,
		interBcEdges: 2,
		maxCellComplexity: 5,
		violations: [],
		cycles: [],
	};

	it("HOLDS when nothing climbs", () => {
		expect(ratchet(base, base).state).toBe("HELD");
	});

	it("BREAKS + blocks the cut on a new boundary violation", () => {
		const cand = { ...base, boundaryViolations: 1 };
		const v = ratchet(base, cand);
		expect(v.state).toBe("BROKEN");
		expect(v.block?.code).toBe(CODE_STRUCTURAL_REGRESSION);
		expect(v.climbs.map((c) => c.metric)).toContain("boundary_violations");
	});

	it("BREAKS on a new inter-cell cycle", () => {
		expect(ratchet(base, { ...base, interCellCycles: 1 }).state).toBe("BROKEN");
	});
});

describe("propose (the wall)", () => {
	it("returns a DRAFT envelope carrying the ratchet verdict, writes nothing", () => {
		const base = measure(cleanCut());
		const cs = propose(cleanCut(), base, "baseline", "phase-0");
		expect(cs.status).toBe("DRAFT");
		expect(cs.verdict.state).toBe("HELD");
	});
});

describe("reproducibility (determinism-first)", () => {
	it("measure is a pure function — same graph → same metric", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						from: fc.constantFrom("a.x", "b.y", "c.z"),
						fromCell: fc.constantFrom("a", "b", "c"),
						to: fc.constantFrom("a.x", "b.y", "c.z"),
						toCell: fc.constantFrom("a", "b", "c"),
					}),
					{ maxLength: 6 },
				),
				(edges) => {
					const g: DepGraph = {
						project: "p",
						cells: { a: 2, b: 3, c: 1 },
						honored: [{ a: "a", b: "b" }],
						edges,
					};
					expect(measure(g)).toEqual(measure(g));
				},
			),
		);
	});

	it("ratchet is monotone — HELD iff every metric is non-increasing", () => {
		const gen: fc.Arbitrary<StructuralMetric> = fc.record({
			project: fc.constant("p"),
			boundaryViolations: fc.nat(5),
			interCellCycles: fc.nat(3),
			interBcEdges: fc.nat(8),
			maxCellComplexity: fc.nat(10),
			violations: fc.constant([] as StructuralMetric["violations"]),
			cycles: fc.constant([] as StructuralMetric["cycles"]),
		});
		fc.assert(
			fc.property(gen, gen, (b, c) => {
				const climbed =
					c.boundaryViolations > b.boundaryViolations ||
					c.interCellCycles > b.interCellCycles ||
					c.interBcEdges > b.interBcEdges ||
					c.maxCellComplexity > b.maxCellComplexity;
				const v = ratchet(b, c);
				expect(v.state).toBe(climbed ? "BROKEN" : "HELD");
				expect(v.block != null).toBe(climbed);
			}),
		);
	});
});
