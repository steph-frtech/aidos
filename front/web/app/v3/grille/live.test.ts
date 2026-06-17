import { describe, expect, it } from "vitest";
import { buildGrid } from "../../../lib/v2/grid";
import { demoGrid, gridBuildArgs } from "../../../lib/v2/grid-data";
import { FACET_LETTERS } from "../../../lib/v2/idea";
import {
	type KernelNode,
	syntheticComposes,
} from "../../../lib/v2/kernel-tree";
import { gridDecoder } from "./live";

/**
 * /v3/grille live read — le MIROIR DE PARITÉ (Vitest, le slot front N1 figé).
 *
 * Il prouve que le décodeur TS reconstruit, depuis un échantillon COLONNE-MAJEUR du Go
 * `grid_build` (gridsrv.buildOutput : { ok, columns:[{ facet, cells, truths }], hash }), EXACTEMENT
 * la matrice Niveau × Facette que le twin lib/v2/grid.buildGrid produit pour les MÊMES vérités
 * placées — c'est le contrat du tool, PAS une seconde implémentation du calcul (grid.Build est
 * autoritatif). Le test épingle la PARITÉ live==demo + l'invariant cardinal (Σ = total) + le repli
 * sur payload mal formé.
 *
 * DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict, zéro LLM.
 */

/**
 * goSampleFromTruths fabrique l'échantillon Go `grid_build` (colonne-majeur, ordre canonique F→X)
 * à partir d'un jeu de KernelNode — l'image EXACTE que grid.Build renverrait : une colonne par
 * facette, chaque colonne portant ses cellules top-down par rung puis par id (le tri du Go Project).
 * On le fabrique ICI dans le test (pas dans le code de prod) pour pouvoir l'opposer au twin.
 */
function goSampleFromTruths(nodes: readonly KernelNode[]): {
	ok: boolean;
	columns: {
		facet: string;
		cells: { rung: string; facet: string; cell: string }[];
		truths: string[];
	}[];
	hash: string;
} {
	// SOURCE_ORDER profondeur : product=0 … entity=6 (le même ordre que le Go rungOrder).
	const RUNG_DEPTH = new Map(
		[
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
			"entity",
		].map((r, i) => [r, i] as const),
	);
	const columns = FACET_LETTERS.map((facet) => {
		const placed = nodes
			.filter((n) => n.facet === facet && RUNG_DEPTH.has(n.level))
			.sort((a, b) => {
				const da = RUNG_DEPTH.get(a.level) ?? 99;
				const db = RUNG_DEPTH.get(b.level) ?? 99;
				if (da !== db) return da - db; // top-down
				return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
			});
		return {
			facet,
			cells: placed.map((n) => ({
				rung: n.level,
				facet,
				cell: `${n.level}:${facet}`,
			})),
			truths: placed.map((n) => n.id),
		};
	});
	return { ok: true, columns, hash: "go-sample-hash" };
}

describe("grille live — grid_build decoder parity (Go == twin)", () => {
	it("reconstructs the EXACT twin matrix from a Go-sample (small set)", () => {
		const nodes = syntheticComposes(40);
		const sample = goSampleFromTruths(nodes);
		const twin = buildGrid(nodes);
		expect(twin.ok).toBe(true);
		if (!twin.ok) return;
		expect(gridDecoder(sample)).toEqual(twin.grid);
	});

	it("reconstructs the EXACT twin matrix from a Go-sample (240 kernels, the demo size)", () => {
		const nodes = syntheticComposes(240);
		const sample = goSampleFromTruths(nodes);
		const live = gridDecoder(sample);
		expect(live).not.toBeNull();
		// PARITÉ live==demo : la grille décodée == la grille-démo du twil (même comptes, Σ, ordre).
		expect(live).toEqual(demoGrid(240));
	});

	it("honours the cardinal invariant Σ rows = Σ cols = total = placed truths", () => {
		const nodes = syntheticComposes(240);
		const decoded = gridDecoder(goSampleFromTruths(nodes));
		expect(decoded).not.toBeNull();
		if (decoded === null) return;
		const rowSum = decoded.rowTotals.reduce((s, n) => s + n, 0);
		const colSum = decoded.colTotals.reduce((s, n) => s + n, 0);
		expect(rowSum).toBe(decoded.total);
		expect(colSum).toBe(decoded.total);
		expect(decoded.total).toBe(nodes.length); // every truth placed exactly once
	});

	it("emits exactly 7 levels × 8 facets with stable order", () => {
		const decoded = gridDecoder(goSampleFromTruths(syntheticComposes(40)));
		expect(decoded).not.toBeNull();
		if (decoded === null) return;
		expect(decoded.levels.length).toBe(7);
		expect(decoded.facets).toEqual([...FACET_LETTERS]);
		expect(decoded.cells.length).toBe(7);
		for (const row of decoded.cells) expect(row.length).toBe(8);
	});

	it("decodes an empty payload to a legal all-empty matrix (Σ = 0, never a dead read)", () => {
		// An absent/empty `columns` is the Go's zero-truth grid — a LEGAL empty matrix, not
		// malformed (mirrors grid.Build([]) returning eight empty columns). total = 0.
		const empty = gridDecoder({});
		expect(empty).not.toBeNull();
		if (empty === null) return;
		expect(empty.total).toBe(0);
		expect(empty.levels.length).toBe(7);
		expect(empty.facets.length).toBe(8);
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(gridDecoder(null)).toBeNull();
		expect(gridDecoder({ columns: "nope" })).toBeNull();
		// a column whose cells/truths lengths disagree is malformed.
		expect(
			gridDecoder({
				columns: [
					{ facet: "F", cells: [{ rung: "product", facet: "F" }], truths: [] },
				],
			}),
		).toBeNull();
		// a cell missing its rung is malformed.
		expect(
			gridDecoder({
				columns: [{ facet: "F", cells: [{ facet: "F" }], truths: ["k0"] }],
			}),
		).toBeNull();
	});

	it("gridBuildArgs is the placed-truths payload (id/rung/facet scalars)", () => {
		const args = gridBuildArgs(3);
		expect(args.truths.length).toBe(3);
		for (const t of args.truths) {
			expect(typeof t.id).toBe("string");
			expect(typeof t.rung).toBe("string");
			expect(typeof t.facet).toBe("string");
		}
	});
});
