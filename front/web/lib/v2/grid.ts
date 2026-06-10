/**
 * WB2-05 — le TWIN PUR de la GRILLE niveau × facette (FKE-1.4 « les deux axes »).
 *
 * Toute vérité porte ses DEUX coordonnées : son NIVEAU (la verticale couplante §23, produit →
 * parcours → … → entité) et sa FACETTE (l'axe orthogonal de la nature, F·I·S·B·R·V·M·X, FKE-1.3).
 * L'écran /v2/grille rend la matrice 7×8 de ces deux axes : chaque CELLULE (niveau, facette) tient
 * les kernels qui y résolvent ; chaque LIGNE et chaque COLONNE porte sa somme Σ ; le coin porte le
 * total. Cliquer une cellule descend vers SES specs/kernels.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer la grille est une FONCTION PURE & TOTALE — pas
 * d'horloge, pas d'aléa, pas d'E/S, pas de LLM. La somme Σ n'est pas « estimée » : elle est COMPTÉE.
 * L'invariant cardinal (le critère de done) : Σ des lignes = Σ des colonnes = total = nombre de
 * kernels — AUCUNE spec n'est perdue ni comptée deux fois. Le miroir de reproductibilité
 * lib/v2/grid.test.ts (fast-check) épingle : même entrée → même grille, la conservation des sommes,
 * la couverture (chaque kernel tombe dans exactement une cellule), l'ordre stable des ids, le rejet
 * d'une coordonnée hors des jeux clos.
 *
 * RÉUTILISATION (pas de fork) : les NIVEAUX et leur ORDRE viennent de la grammaire besoin
 * (SOURCE_ORDER — les 7 rungs de la verticale, réutilisés de lib/besoin-grammar) ; les FACETTES et
 * leur ordre canonique de lib/facets (FKE-1.3, réutilisés via lib/v2/idea). Le KernelNode plat est
 * celui de l'arbre WB2-04 (lib/v2/kernel-tree) — la grille est une AUTRE lecture des mêmes kernels.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture ; il n'écrit aucune vérité. La grille est
 * une projection de lecture, jamais un kernel.
 */

import { type Level, SOURCE_ORDER } from "../besoin-grammar";
import { FACET_LETTERS, isFacetLetter } from "./idea";
import type { KernelNode } from "./kernel-tree";

/** Les 7 niveaux de la verticale (§23) qui forment les LIGNES de la grille (ordre déclaré). */
export const GRID_LEVELS: readonly Level[] = SOURCE_ORDER;

/** Les 8 facettes (FKE-1.3) qui forment les COLONNES de la grille (ordre canonique F→X). */
export const GRID_FACETS: readonly string[] = FACET_LETTERS;

/** Une CELLULE de la grille : sa coordonnée (niveau, facette), son compte Σ et les ids qu'elle tient. */
export interface GridCell {
	readonly level: Level;
	readonly facet: string;
	/** Le nombre de kernels dans la cellule (= kernelIds.length, le Σ de la cellule). */
	readonly count: number;
	/** Les ids des kernels de la cellule, ORDONNÉS (stable, tri lexicographique). */
	readonly kernelIds: readonly string[];
}

/** La grille projetée : la matrice de cellules + les sommes Σ marginales + le total. */
export interface Grid {
	/** Les niveaux des lignes, dans l'ordre de la verticale (§23). */
	readonly levels: readonly Level[];
	/** Les facettes des colonnes, dans l'ordre canonique (F→X). */
	readonly facets: readonly string[];
	/** Les cellules indexées par [niveau][facette] (lignes × colonnes). */
	readonly cells: ReadonlyArray<ReadonlyArray<GridCell>>;
	/** Σ par ligne (un total par niveau), aligné sur `levels`. */
	readonly rowTotals: readonly number[];
	/** Σ par colonne (un total par facette), aligné sur `facets`. */
	readonly colTotals: readonly number[];
	/** Le total général (= Σ des lignes = Σ des colonnes = nombre de kernels placés). */
	readonly total: number;
}

/** Le diagnostic d'une entrée invalide pour la grille (une coordonnée hors des jeux clos). */
export type GridError = "level_unknown" | "facet_unknown" | "empty_id";

export type GridResult =
	| { ok: true; grid: Grid }
	| { ok: false; errors: GridError[] };

function isGridLevel(level: string): level is Level {
	return (SOURCE_ORDER as readonly string[]).includes(level);
}

/**
 * VALIDE l'entrée de la grille : chaque kernel doit avoir un id non vide et des coordonnées dans les
 * jeux clos (un niveau de la verticale §23 — la transversale `invariant`/`policy` n'a PAS de ligne
 * dans cette grille des 7 rungs — et une facette FKE-1.3). PURE & TOTALE : même entrée → mêmes
 * erreurs. Renvoie la liste (déterministe, dédupliquée, ordonnée) des erreurs.
 */
export function validateGrid(nodes: readonly KernelNode[]): GridError[] {
	let hasEmpty = false;
	let hasUnknownLevel = false;
	let hasUnknownFacet = false;
	for (const n of nodes) {
		if (n.id.trim() === "") hasEmpty = true;
		if (!isGridLevel(n.level)) hasUnknownLevel = true;
		if (!isFacetLetter(n.facet)) hasUnknownFacet = true;
	}
	const errors: GridError[] = [];
	if (hasEmpty) errors.push("empty_id");
	if (hasUnknownLevel) errors.push("level_unknown");
	if (hasUnknownFacet) errors.push("facet_unknown");
	return errors;
}

/**
 * COMPOSE la grille niveau × facette depuis la liste plate des kernels — le cœur du twin. PURE &
 * TOTALE & DÉTERMINISTE :
 *   1. valide l'entrée ; toute coordonnée hors jeu → { ok:false, errors } ;
 *   2. place chaque kernel dans SA cellule (niveau, facette) — exactement une, par construction ;
 *   3. ordonne les ids de chaque cellule (lexicographique, stable) ;
 *   4. COMPTE les sommes Σ par ligne, par colonne, et le total.
 * Aucune écriture, aucun LLM, aucune horloge. Même entrée → même grille (mêmes comptes, même ordre).
 * Invariant cardinal : Σ rowTotals = Σ colTotals = total = nombre de kernels placés.
 */
export function buildGrid(nodes: readonly KernelNode[]): GridResult {
	const errors = validateGrid(nodes);
	if (errors.length > 0) return { ok: false, errors };

	const levels = GRID_LEVELS;
	const facets = GRID_FACETS;

	// Buckets[levelIndex][facetIndex] = ids accumulés.
	const buckets: string[][][] = levels.map(() => facets.map(() => []));
	const levelIndex = new Map(levels.map((l, i) => [l, i] as const));
	const facetIndex = new Map(facets.map((f, i) => [f, i] as const));

	for (const n of nodes) {
		const li = levelIndex.get(n.level as Level);
		const fi = facetIndex.get(n.facet);
		// li/fi sont définis : validateGrid a déjà rejeté toute coordonnée hors jeu.
		if (li === undefined || fi === undefined) continue;
		buckets[li][fi].push(n.id);
	}

	const cells: GridCell[][] = levels.map((level, li) =>
		facets.map((facet, fi) => {
			const ids = [...buckets[li][fi]].sort((a, b) =>
				a < b ? -1 : a > b ? 1 : 0,
			);
			return { level, facet, count: ids.length, kernelIds: ids };
		}),
	);

	const rowTotals = cells.map((row) => row.reduce((s, c) => s + c.count, 0));
	const colTotals = facets.map((_, fi) =>
		cells.reduce((s, row) => s + row[fi].count, 0),
	);
	const total = rowTotals.reduce((s, n) => s + n, 0);

	return {
		ok: true,
		grid: { levels, facets, cells, rowTotals, colTotals, total },
	};
}

/**
 * Résout les kernels d'UNE cellule (niveau, facette) — ce que le clic d'une cellule consomme pour
 * descendre vers ses specs. PURE & TOTALE. Renvoie les ids ordonnés, ou [] si la coordonnée n'a
 * aucun kernel (jamais un lien mort : une cellule vide est légale, elle rend simplement zéro spec).
 */
export function cellKernels(
	grid: Grid,
	level: Level,
	facet: string,
): readonly string[] {
	const li = grid.levels.indexOf(level);
	const fi = grid.facets.indexOf(facet);
	if (li < 0 || fi < 0) return [];
	return grid.cells[li][fi].kernelIds;
}
