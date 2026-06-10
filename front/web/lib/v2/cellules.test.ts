/**
 * WB2-09 — le MIROIR DE REPRODUCTIBILITÉ du twin des CELLULES (bounded contexts, lib/v2/cellules).
 * mirror record: reflects=WB2-09-cellules, test_kind=property, cert_language=vitest+fast-check,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Le twin est PUR & DÉTERMINISTE : ces propriétés (fast-check) + ces assertions canoniques épinglent
 * les critères de done WB2-09 :
 *   - DÉTERMINISME : même entrée → même fédération (même sérialisation) ;
 *   - PARTITION : chaque kernel tombe dans EXACTEMENT une cellule (aucune spec perdue ni dupliquée) ;
 *   - CONSERVATION (Σ cohérente, le critère de done) : total = Σ des Cell.count = nb de kernels, et
 *     pour chaque cellule, la grille rollup conserve aussi son propre Σ (Σ lignes = Σ colonnes = count) ;
 *   - CONTRAT (§49) : un contrat va d'une cellule à une AUTRE (jamais intra-cellule) ; un lien
 *     `composes` interne (même cellule) n'est JAMAIS un contrat ; une cible non pinnée est refusée ;
 *   - INTERNE : internalComposes ne rend que des `composes` dont les deux bouts sont dans la cellule ;
 *   - le rejet d'un id de kernel/cellule vide ;
 *   - la fédération canonique : 3 cellules, 2 contrats inter-cellules, drill-down cellule → cases → specs.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SOURCE_ORDER } from "../besoin-grammar";
import {
	buildFederation,
	type CellKernel,
	cellContracts,
	findCell,
	internalComposes,
	syntheticFederation,
	withContracts,
} from "./cellules";
import { FACET_LETTERS } from "./idea";
import { isPinned, type Link } from "./links";

/** Un générateur de CellKernel VALIDES : coordonnées dans les jeux clos, ids uniques, cellId non vide. */
function validCellKernels(): fc.Arbitrary<CellKernel[]> {
	return fc
		.array(
			fc.record({
				level: fc.constantFrom(...SOURCE_ORDER),
				facet: fc.constantFrom(...FACET_LETTERS),
				cellId: fc.constantFrom("cellA", "cellB", "cellC"),
			}),
			{ minLength: 0, maxLength: 60 },
		)
		.map((rows) =>
			rows.map((r, i) => ({
				id: `k${i}`,
				cellId: r.cellId,
				level: r.level,
				facet: r.facet,
				label: `${r.level} ${i}`,
				parentId: null,
			})),
		);
}

describe("WB2-09 cellules — le twin pur des bounded contexts (§49)", () => {
	it("DÉTERMINISME : même entrée → même fédération (même sérialisation)", () => {
		fc.assert(
			fc.property(validCellKernels(), (kernels) => {
				const a = buildFederation(kernels);
				const b = buildFederation(kernels);
				expect(JSON.stringify(a)).toBe(JSON.stringify(b));
			}),
		);
	});

	it("CONSERVATION : total = Σ des Cell.count = nb de kernels (aucune spec perdue)", () => {
		fc.assert(
			fc.property(validCellKernels(), (kernels) => {
				const res = buildFederation(kernels);
				expect(res.ok).toBe(true);
				if (!res.ok) return;
				const fed = res.federation;
				const sumCells = fed.cells.reduce((s, c) => s + c.count, 0);
				expect(fed.total).toBe(kernels.length);
				expect(sumCells).toBe(kernels.length);
				// Chaque cellule : sa grille rollup conserve aussi son propre Σ.
				for (const c of fed.cells) {
					const rows = c.grid.rowTotals.reduce((s, n) => s + n, 0);
					const cols = c.grid.colTotals.reduce((s, n) => s + n, 0);
					expect(rows).toBe(c.count);
					expect(cols).toBe(c.count);
					expect(c.grid.total).toBe(c.count);
				}
			}),
		);
	});

	it("PARTITION : chaque kernel appartient à EXACTEMENT une cellule (aucune duplication)", () => {
		fc.assert(
			fc.property(validCellKernels(), (kernels) => {
				const res = buildFederation(kernels);
				if (!res.ok) return;
				const seen = new Set<string>();
				for (const c of res.federation.cells) {
					for (const id of c.kernelIds) {
						expect(seen.has(id)).toBe(false); // jamais deux fois.
						seen.add(id);
					}
				}
				expect(seen.size).toBe(kernels.length); // tous placés.
				// Les cellules sont ordonnées par id (stable).
				const ids = res.federation.cells.map((c) => c.id);
				expect([...ids].sort()).toEqual(ids);
			}),
		);
	});

	it("rejet : un id de kernel vide OU un id de cellule vide → { ok:false }", () => {
		const r1 = buildFederation([
			{
				id: "",
				cellId: "a",
				level: "product",
				facet: "F",
				label: "x",
				parentId: null,
			},
		]);
		expect(r1.ok).toBe(false);
		const r2 = buildFederation([
			{
				id: "k0",
				cellId: " ",
				level: "product",
				facet: "F",
				label: "x",
				parentId: null,
			},
		]);
		expect(r2.ok).toBe(false);
	});

	it("CONTRAT (§49) : un contrat va d'une cellule à une AUTRE ; un composes interne n'est jamais un contrat", () => {
		const { kernels, links } = syntheticFederation();
		const res = buildFederation(kernels);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const fed = withContracts(res.federation, links);
		// Tout contrat est inter-cellules (fromCell ≠ toCell) et pinné.
		for (const c of fed.contracts) {
			expect(c.fromCell).not.toBe(c.toCell);
			expect(isPinned(c.from)).toBe(true);
			expect(isPinned(c.to)).toBe(true);
		}
		// Les 7 composes du graphe canonique sont INTERNES → 0 contrat tiré d'eux ; seuls les 2
		// depends_on inter-cellules sont des contrats.
		expect(fed.contracts.length).toBe(2);
	});

	it("CONTRAT : une cible non pinnée (id@version) est REFUSÉE (un to nu est un monstre §41)", () => {
		const { kernels } = syntheticFederation();
		const res = buildFederation(kernels);
		if (!res.ok) return;
		const naked: Link[] = [
			{
				kind: "depends_on",
				from: { id: "checkout-pay", version: "v1" },
				to: { id: "order-create", version: "" }, // identité nue.
			},
		];
		const fed = withContracts(res.federation, naked);
		expect(fed.contracts.length).toBe(0);
	});

	it("INTERNE : internalComposes ne rend que des composes dont les deux bouts sont dans la cellule", () => {
		const { kernels, links } = syntheticFederation();
		const res = buildFederation(kernels);
		if (!res.ok) return;
		const checkout = findCell(res.federation, "checkout");
		expect(checkout).not.toBeNull();
		if (!checkout) return;
		const internal = internalComposes("checkout", checkout.kernelIds, links);
		// checkout a 3 composes internes (product→view→submit→pay).
		expect(internal.length).toBe(3);
		for (const l of internal) {
			expect(l.kind).toBe("composes");
			expect(checkout.kernelIds).toContain(l.from.id);
			expect(checkout.kernelIds).toContain(l.to.id);
		}
	});

	it("CANONIQUE : la fédération synthétique = 3 cellules + 2 contrats ; drill-down cellule → cases → specs", () => {
		const { kernels, links } = syntheticFederation();
		const res = buildFederation(kernels);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const fed = withContracts(res.federation, links);
		expect(fed.cells.map((c) => c.id)).toEqual([
			"checkout",
			"inventory",
			"order",
		]);
		expect(fed.total).toBe(10);
		expect(fed.contracts.length).toBe(2);
		// Drill-down : la cellule order a ses contrats (entrant de checkout, sortant vers inventory).
		const orderContracts = cellContracts(fed, "order");
		expect(orderContracts.length).toBe(2);
		// Clic case → specs : une cellule rend sa grille ; une case non vide tient ses kernelIds.
		const order = findCell(fed, "order");
		if (!order) return;
		const allIds = order.grid.cells.flatMap((row) =>
			row.flatMap((cell) => cell.kernelIds),
		);
		expect([...allIds].sort()).toEqual([...order.kernelIds].sort());
	});
});
