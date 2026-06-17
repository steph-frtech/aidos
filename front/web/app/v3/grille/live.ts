import { type Level, SOURCE_ORDER } from "../../../lib/besoin-grammar";
import { arr, type Decoder, isObject, str } from "../../../lib/gateway-sdk";
import type { Grid, GridCell } from "../../../lib/v2/grid";
import { FACET_LETTERS } from "../../../lib/v2/idea";

/**
 * /v3/grille live read — le DÉCODEUR PUR sur la sortie de l'outil Go `grid_build` (cutover S59,
 * ADR 0092 : le moteur Go est l'UNIQUE source vivante de la grille). Gardé HORS de actions.ts (un
 * module Next "use server" n'exporte que des fonctions async) pour que le miroir de parité
 * live.test.ts importe le décodeur PUR directement.
 *
 * LE SHAPE GO (back/mcp/grid/gridsrv — grid_build) est COLONNE-MAJEUR : { ok, columns:[{ facet,
 * cells:[{ rung, facet, cell }], truths:[id] }], hash }. La cellule k de la colonne i porte la
 * vérité columns[i].truths[k] au rung columns[i].cells[k].rung. Ce décodeur RECONSTRUIT la matrice
 * Niveau × Facette + les sommes Σ EXACTEMENT comme le twin lib/v2/grid.buildGrid — même comptes,
 * même ordre, mêmes Σ — pour que live et demo soient byte-identiques (l'invariant cardinal :
 * Σ lignes = Σ colonnes = total = nombre de vérités placées).
 *
 * NEVER DOUBLE-TYPED (le done-criterion S59) : `gridDecoder` est l'UNIQUE déclaration runtime du
 * shape live ; le type statique Grid est celui que le twin déclare (les types, pas la logique :
 * un import type ne tire aucune logique). Le miroir épingle le décodeur == le contrat Go
 * gridsrv.buildOutput, PAS une seconde implémentation du calcul (grid.Build est autoritatif).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict ; un payload mal formé renvoie null et
 * readVia retombe sur la grille-démo. Le MUR (§2) : lecture sous la ligne — aucune écriture.
 */

/** Les 7 niveaux (lignes) dans l'ordre de la verticale §23 — réutilisés, jamais réinventés. */
const LEVELS: readonly Level[] = SOURCE_ORDER;
/** Les 8 facettes (colonnes) dans l'ordre canonique F→X (FKE-1.3). */
const FACETS: readonly string[] = FACET_LETTERS;

/** Une cellule Go décodée : son rung + sa facette (le `cell` adressé est avancé, non requis ici). */
interface DecodedCell {
	rung: string;
	facet: string;
}

function decodeCell(raw: unknown): DecodedCell | null {
	if (!isObject(raw)) return null;
	const rung = str(raw.rung);
	const facet = str(raw.facet);
	if (rung === null || facet === null) return null;
	return { rung, facet };
}

/** Une colonne Go décodée : sa facette + ses cellules (parallèles à `truths`) + ses truths. */
interface DecodedColumn {
	facet: string;
	cells: DecodedCell[];
	truths: string[];
}

function decodeColumn(raw: unknown): DecodedColumn | null {
	if (!isObject(raw)) return null;
	const facet = str(raw.facet);
	if (facet === null) return null;
	const cells = arr(decodeCell)(raw.cells ?? []);
	const truths = arr(str)(raw.truths ?? []);
	if (cells === null || truths === null) return null;
	// La cellule k porte la vérité k : les deux listes doivent être alignées.
	if (cells.length !== truths.length) return null;
	return { facet, cells, truths };
}

/**
 * gridDecoder décode la sortie de `grid_build` ({ ok, columns, hash }) et RECONSTRUIT la matrice
 * Niveau × Facette du twin (Grid) : place chaque vérité dans SA cellule (rung × facette), trie les
 * ids (lexicographique stable), COMPTE les Σ par ligne / colonne / total. Une coordonnée hors des
 * jeux clos (un rung/facette inconnu) est ignorée — le Go n'en place jamais (le filtre IsSourceRung
 * + la facette canonique). Un payload mal formé → null (→ repli démo).
 */
export const gridDecoder: Decoder<Grid> = (raw) => {
	if (!isObject(raw)) return null;
	const columns = arr(decodeColumn)(raw.columns ?? []);
	if (columns === null) return null;

	const levelIndex = new Map(LEVELS.map((l, i) => [l as string, i] as const));
	const facetIndex = new Map(FACETS.map((f, i) => [f, i] as const));

	// Buckets[levelIndex][facetIndex] = ids accumulés (la même structure que buildGrid).
	const buckets: string[][][] = LEVELS.map(() => FACETS.map(() => []));

	for (const col of columns) {
		const fi = facetIndex.get(col.facet);
		if (fi === undefined) continue; // facette hors octuor — jamais émise par le Go.
		for (let k = 0; k < col.cells.length; k++) {
			const li = levelIndex.get(col.cells[k].rung);
			if (li === undefined) continue; // rung hors verticale — jamais émis par le Go.
			buckets[li][fi].push(col.truths[k]);
		}
	}

	const cells: GridCell[][] = LEVELS.map((level, li) =>
		FACETS.map((facet, fi) => {
			const ids = [...buckets[li][fi]].sort((a, b) =>
				a < b ? -1 : a > b ? 1 : 0,
			);
			return { level, facet, count: ids.length, kernelIds: ids };
		}),
	);

	const rowTotals = cells.map((row) => row.reduce((s, c) => s + c.count, 0));
	const colTotals = FACETS.map((_, fi) =>
		cells.reduce((s, row) => s + row[fi].count, 0),
	);
	const total = rowTotals.reduce((s, n) => s + n, 0);

	return { levels: LEVELS, facets: FACETS, cells, rowTotals, colTotals, total };
};
