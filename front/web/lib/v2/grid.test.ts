/**
 * WB2-05 — le MIROIR DE REPRODUCTIBILITÉ du twin de la grille niveau × facette (lib/v2/grid).
 * mirror record: reflects=WB2-05-grid, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) épinglent les critères de done :
 *   - DÉTERMINISME : même entrée → même grille (même sérialisation) ;
 *   - CONSERVATION (l'invariant cardinal) : Σ rowTotals = Σ colTotals = total = nb de kernels ;
 *   - COUVERTURE : chaque kernel tombe dans EXACTEMENT une cellule (aucune spec perdue/dupliquée) ;
 *   - la cellule (niveau, facette) a count = kernelIds.length, ids ORDONNÉS, stables ;
 *   - cellKernels résout la cellule cliquée (jamais un lien mort : une cellule vide rend []) ;
 *   - le rejet d'une coordonnée hors des jeux clos (niveau/facette inconnu, id vide) ;
 *   - la grille a toujours 7 lignes × 8 colonnes (les deux axes, FKE-1.4).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SOURCE_ORDER } from "../besoin-grammar";
import {
	buildGrid,
	cellKernels,
	GRID_FACETS,
	GRID_LEVELS,
	type Grid,
	validateGrid,
} from "./grid";
import { FACET_LETTERS } from "./idea";
import { type KernelNode, syntheticComposes } from "./kernel-tree";

/** Un générateur de kernels VALIDES (coordonnées dans les jeux clos, ids uniques). */
function validKernels(): fc.Arbitrary<KernelNode[]> {
	return fc
		.array(
			fc.record({
				level: fc.constantFrom(...SOURCE_ORDER),
				facet: fc.constantFrom(...FACET_LETTERS),
			}),
			{ minLength: 0, maxLength: 60 },
		)
		.map((rows) =>
			rows.map((r, i) => ({
				id: `k${i}`,
				level: r.level,
				facet: r.facet,
				label: `${r.level} ${i}`,
				parentId: i === 0 ? null : `k${i - 1}`,
			})),
		);
}

function serialize(grid: Grid): string {
	return JSON.stringify(grid);
}

describe("WB2-05 grid twin — les deux axes (niveau × facette), sommes Σ", () => {
	it("la grille a 7 lignes (verticale §23) × 8 colonnes (facettes F·I·S·B·R·V·M·X)", () => {
		expect(GRID_LEVELS).toHaveLength(7);
		expect(GRID_FACETS).toHaveLength(8);
		expect([...GRID_FACETS]).toEqual(["F", "I", "S", "B", "R", "V", "M", "X"]);
		const r = buildGrid([]);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.grid.cells).toHaveLength(7);
			for (const row of r.grid.cells) expect(row).toHaveLength(8);
			expect(r.grid.total).toBe(0);
		}
	});

	it("DÉTERMINISME — même entrée → même grille (sérialisation identique)", () => {
		fc.assert(
			fc.property(validKernels(), (nodes) => {
				const a = buildGrid(nodes);
				const b = buildGrid(nodes);
				expect(a.ok && b.ok).toBe(true);
				if (a.ok && b.ok) expect(serialize(a.grid)).toBe(serialize(b.grid));
			}),
		);
	});

	it("CONSERVATION (l'invariant cardinal) — Σ lignes = Σ colonnes = total = nb de kernels", () => {
		fc.assert(
			fc.property(validKernels(), (nodes) => {
				const r = buildGrid(nodes);
				expect(r.ok).toBe(true);
				if (!r.ok) return;
				const { rowTotals, colTotals, total } = r.grid;
				const sumRows = rowTotals.reduce((s, n) => s + n, 0);
				const sumCols = colTotals.reduce((s, n) => s + n, 0);
				expect(sumRows).toBe(total);
				expect(sumCols).toBe(total);
				expect(total).toBe(nodes.length);
			}),
		);
	});

	it("COUVERTURE — chaque kernel tombe dans exactement une cellule (aucune spec perdue/dupliquée)", () => {
		fc.assert(
			fc.property(validKernels(), (nodes) => {
				const r = buildGrid(nodes);
				expect(r.ok).toBe(true);
				if (!r.ok) return;
				const seen: string[] = [];
				for (const row of r.grid.cells)
					for (const cell of row) {
						expect(cell.count).toBe(cell.kernelIds.length);
						seen.push(...cell.kernelIds);
					}
				// Chaque id apparaît exactement une fois sur toute la grille.
				expect(seen.slice().sort()).toEqual(
					nodes
						.map((n) => n.id)
						.slice()
						.sort(),
				);
				expect(new Set(seen).size).toBe(seen.length);
			}),
		);
	});

	it("les ids d'une cellule sont ORDONNÉS et stables ; cellKernels résout la cellule cliquée", () => {
		fc.assert(
			fc.property(validKernels(), (nodes) => {
				const r = buildGrid(nodes);
				if (!r.ok) return;
				for (const row of r.grid.cells)
					for (const cell of row) {
						const sorted = [...cell.kernelIds].sort((a, b) =>
							a < b ? -1 : a > b ? 1 : 0,
						);
						expect([...cell.kernelIds]).toEqual(sorted);
						// cellKernels(level, facet) === la cellule de la grille.
						expect([...cellKernels(r.grid, cell.level, cell.facet)]).toEqual([
							...cell.kernelIds,
						]);
					}
			}),
		);
	});

	it("cellKernels d'une cellule vide rend [] (jamais un lien mort)", () => {
		const r = buildGrid([]);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(cellKernels(r.grid, "product", "F")).toEqual([]);
			// Une coordonnée hors grille rend aussi [] (pas d'exception).
			expect(cellKernels(r.grid, "product", "Z")).toEqual([]);
		}
	});

	it("REJET — une coordonnée hors des jeux clos est refusée (niveau/facette inconnu, id vide)", () => {
		const badLevel = buildGrid([
			{
				id: "k0",
				level: "wat" as never,
				facet: "F",
				label: "x",
				parentId: null,
			},
		]);
		expect(badLevel.ok).toBe(false);
		if (!badLevel.ok) expect(badLevel.errors).toContain("level_unknown");

		const badFacet = buildGrid([
			{ id: "k0", level: "product", facet: "Z", label: "x", parentId: null },
		]);
		expect(badFacet.ok).toBe(false);
		if (!badFacet.ok) expect(badFacet.errors).toContain("facet_unknown");

		const emptyId = buildGrid([
			{ id: "  ", level: "product", facet: "F", label: "x", parentId: null },
		]);
		expect(emptyId.ok).toBe(false);
		if (!emptyId.ok) expect(emptyId.errors).toContain("empty_id");

		// La transversale `invariant` n'a PAS de ligne dans cette grille des 7 rungs.
		expect(
			validateGrid([
				{
					id: "k0",
					level: "invariant",
					facet: "F",
					label: "x",
					parentId: null,
				},
			]),
		).toContain("level_unknown");
	});

	it("200+ kernels (syntheticComposes(240)) — la grille se compose, Σ conservée", () => {
		const nodes = syntheticComposes(240);
		const r = buildGrid(nodes);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.grid.total).toBe(240);
			const sumRows = r.grid.rowTotals.reduce((s, n) => s + n, 0);
			expect(sumRows).toBe(240);
		}
	});
});
