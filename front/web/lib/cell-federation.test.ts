/**
 * Reproducibility mirror for the cell-federation twin (S100) — the TS side of the S100 property
 * mirror (back/kernel/cell/cell_property_test.go), pinned with Vitest + fast-check. Same project
 * ⇒ byte-identical pack (determinism); the pack EXCLUDES neighbor internals (done-criterion 1);
 * a cross-cell access without a honored contract is REFUSED (done-criterion 2); fractal shipping
 * (a cell ships iff its own ratchet is green). The Go output is AUTHORITATIVE — these tests
 * assert the twin reproduces the same federation frontier deterministically.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type CellNode,
	CODE_CROSS_CELL_NO_CONTRACT,
	type Contract,
	cellPack,
	checkCrossCellAccess,
	type Federation,
	type Project,
	packHasNeighborInternal,
	partition,
	shippableCells,
	ships,
} from "./cell-federation";

const CELLS = ["checkout", "billing", "catalog", "shipping"];

const arbNode: fc.Arbitrary<CellNode> = fc
	.record({
		id: fc.integer({ min: 0, max: 99999 }).map((n) => `n${n}`),
		cell: fc.constantFrom(...CELLS),
		kind: fc.constantFrom("layer", "mirror", "contract") as fc.Arbitrary<
			CellNode["kind"]
		>,
		pub: fc.boolean(),
	})
	.map(({ id, cell, kind, pub }) => ({
		id,
		cell,
		kind,
		public: kind === "contract" ? pub : undefined,
	}));

const arbProject: fc.Arbitrary<Project> = fc
	.array(arbNode, { maxLength: 12 })
	.map((nodes) => {
		const seen = new Set<string>();
		const uniq = nodes.filter((n) =>
			seen.has(n.id) ? false : (seen.add(n.id), true),
		);
		return { id: "shop", nodes: uniq };
	});

const arbFed: fc.Arbitrary<Federation> = fc
	.array(
		fc.record({
			a: fc.constantFrom(...CELLS),
			b: fc.constantFrom(...CELLS),
			honored: fc.boolean(),
		}) as fc.Arbitrary<Contract>,
		{ maxLength: 4 },
	)
	.map((contracts) => ({ contracts }));

describe("cell-federation twin (S100)", () => {
	it("the pack EXCLUDES neighbor internals (done-criterion 1)", () => {
		fc.assert(
			fc.property(
				arbProject,
				arbFed,
				fc.constantFrom(...CELLS),
				(p, fed, target) => {
					const pack = cellPack(p, target, fed);
					expect(packHasNeighborInternal(pack, p)).toBe(false);
					const byId = new Map(p.nodes.map((n) => [n.id, n]));
					for (const id of [
						...pack.ownLayers,
						...pack.ownMirrors,
						...pack.ownContracts,
					]) {
						expect(byId.get(id)?.cell).toBe(target);
					}
					for (const id of pack.neighborContracts) {
						const n = byId.get(id);
						expect(n?.cell).not.toBe(target);
						expect(n?.kind).toBe("contract");
						expect(n?.public).toBe(true);
						expect(checkCrossCellAccess(target, n!.cell, fed)).toBeNull();
					}
				},
			),
		);
	});

	it("a cross-cell access without a contract is REFUSED (done-criterion 2)", () => {
		fc.assert(
			fc.property(
				arbFed,
				fc.constantFrom(...CELLS),
				fc.constantFrom(...CELLS),
				(fed, from, to) => {
					const br = checkCrossCellAccess(from, to, fed);
					const honored =
						from === to ||
						fed.contracts.some(
							(c) =>
								c.honored &&
								((c.a === from && c.b === to) || (c.a === to && c.b === from)),
						);
					if (honored) {
						expect(br).toBeNull();
					} else {
						expect(br?.code).toBe(CODE_CROSS_CELL_NO_CONTRACT);
						expect(br?.howToFix.length).toBeGreaterThan(0);
					}
				},
			),
		);
	});

	it("cellPack is reproducible (same input ⇒ identical pack)", () => {
		fc.assert(
			fc.property(
				arbProject,
				arbFed,
				fc.constantFrom(...CELLS),
				(p, fed, target) => {
					expect(cellPack(p, target, fed)).toEqual(cellPack(p, target, fed));
				},
			),
		);
	});

	it("fractal shipping: a cell ships iff its own ratchet is green", () => {
		const p: Project = {
			id: "shop",
			nodes: [
				{ id: "ck", cell: "checkout", kind: "layer" },
				{ id: "bl", cell: "billing", kind: "layer" },
			],
			ratchets: { checkout: "green", billing: "red" },
		};
		const cells = partition(p);
		expect(shippableCells(cells)).toEqual(["checkout"]);
		for (const c of cells) {
			expect(ships(c)).toBe(c.ratchet === "green");
		}
	});

	it("partition refuses an unassigned node", () => {
		expect(() =>
			partition({ id: "x", nodes: [{ id: "loose", cell: "", kind: "layer" }] }),
		).toThrow();
	});

	it("the canonical checkout pack excludes billing internals + catalog (no contract)", () => {
		const p: Project = {
			id: "shop",
			nodes: [
				{ id: "ck-op", cell: "checkout", kind: "layer" },
				{ id: "ck-pact", cell: "checkout", kind: "contract", public: true },
				{ id: "bl-op", cell: "billing", kind: "layer" },
				{ id: "bl-pact", cell: "billing", kind: "contract", public: true },
				{ id: "cat-pact", cell: "catalog", kind: "contract", public: true },
			],
		};
		const fed: Federation = {
			contracts: [{ a: "checkout", b: "billing", honored: true }],
		};
		const pack = cellPack(p, "checkout", fed);
		expect(pack.neighborContracts).toContain("bl-pact");
		expect(pack.neighborContracts).not.toContain("cat-pact");
		expect([
			...pack.ownLayers,
			...pack.ownMirrors,
			...pack.ownContracts,
		]).not.toContain("bl-op");
		expect(checkCrossCellAccess("checkout", "catalog", fed)?.code).toBe(
			CODE_CROSS_CELL_NO_CONTRACT,
		);
		expect(checkCrossCellAccess("checkout", "billing", fed)).toBeNull();
	});
});
