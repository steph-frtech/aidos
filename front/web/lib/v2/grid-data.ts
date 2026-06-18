import type { Level } from "../besoin-grammar";
import { buildGrid, type Grid } from "./grid";
import { type KernelNode, syntheticComposes } from "./kernel-tree";

/**
 * grid-data.ts — le REPLI-DÉMO DÉTERMINISTE de la lentille /v3/grille (le cutover ADR 0092 :
 * le moteur Go est l'UNIQUE source vivante de la GRILLE niveau × facette).
 *
 * POURQUOI CE FICHIER. La lentille V3 « grille » lit désormais le moteur Go LIVE par la
 * passerelle (`grid_build` sur le serveur `grid`, dispatché — back/kernel/grid est la source
 * unique). `grid_build` projette un jeu de vérités PLACÉES sur la matrice Niveau × Facette
 * (une colonne par facette canonique F→X, chaque colonne portant ses cellules top-down par
 * rung), adressée par contenu (grid.Build + Grid.Hash). Quand la passerelle est injoignable
 * ou qu'aucun store n'est dispatché, l'écran retombe sur ce corps-démo (source:"demo").
 *
 * LE TWIN DEVIENT LE REPLI (jamais le chemin vivant). lib/v2/grid reste un calcul PUR & TOTAL
 * (buildGrid, sommes Σ COMPTÉES), épinglé par lib/v2/grid.test.ts ; mais ce calcul ne sert PLUS
 * de source d'affichage live — il ne fait que produire le repli-démo honnête. Ce fichier-data
 * EST le témoin du cliquet (twin-as-live-fitness) : `lib/v2/grid.ts` + `lib/v2/grid-data.ts`
 * font de `v2/grid` un twin reconnu, donc tout import-valeur du twin DOIT être derrière la
 * frontière readVia (sinon le cliquet rougit).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : même nombre → même grille-démo (syntheticComposes est
 * une fonction pure, zéro horloge/aléa/LLM ; buildGrid COMPTE les Σ, jamais d'estimation). Le
 * MUR (§2) : ceci ne DÉCLARE qu'un repli de lecture sous la ligne — aucune écriture-vérité ;
 * geler une vérité passe par idée → miroir → /goal → approbation.
 */

/** Le nombre de kernels synthétiques de la démo (les mêmes 240 que l'arbre /v2/kernels). */
export const DEMO_GRID_KERNELS = 240;

/**
 * gridBuildArgs — l'argument de `grid_build` : la liste plate des vérités PLACÉES (id, rung,
 * facet) que le moteur Go projette sur la matrice. Pure : même n → mêmes vérités. Le shape
 * (rung + facet scalaires) survit au round-trip HTTP (aucun json.RawMessage côté Go).
 */
export function gridBuildArgs(n: number = DEMO_GRID_KERNELS): {
	truths: { id: string; rung: string; facet: string }[];
} {
	const nodes: KernelNode[] = syntheticComposes(n);
	return {
		truths: nodes.map((node) => ({
			id: node.id,
			rung: node.level,
			facet: node.facet,
		})),
	};
}

/**
 * demoGrid compose la grille-démo via le twin pur (l'image exacte que le Go `grid_build`
 * renverrait pour ces mêmes vérités placées). PURE & TOTALE : même n → même grille (mêmes
 * comptes, mêmes Σ, même ordre). C'est le repli honnête quand le live est injoignable.
 */
export function demoGrid(n: number = DEMO_GRID_KERNELS): Grid | null {
	const nodes: KernelNode[] = syntheticComposes(n);
	const r = buildGrid(nodes);
	return r.ok ? r.grid : null;
}

/**
 * Une vérité PLACÉE du PROJET RÉEL — la forme que `grid_build` consomme (id, rung, facet).
 * C'est la projection d'une spec (lib/v3/specs SpecRow : level → rung, facet → facet) que la
 * lentille grille passe au moteur Go pour qu'il place les VRAIES vérités du projet (et non plus
 * les 240 synthétiques de démo) : la grille devient à la fois LIVE et RÉELLE (cohérente avec /v3/specs).
 */
export interface GridTruth {
	readonly id: string;
	readonly rung: string;
	readonly facet: string;
}

/**
 * gridBuildArgsFromTruths — l'argument de `grid_build` à partir des VRAIES vérités du projet
 * (et non du jeu synthétique). Pure : mêmes vérités → même payload. Le shape (rung + facet
 * scalaires) survit au round-trip HTTP (aucun json.RawMessage côté Go), exactement comme gridBuildArgs.
 */
export function gridBuildArgsFromTruths(truths: readonly GridTruth[]): {
	truths: { id: string; rung: string; facet: string }[];
} {
	return {
		truths: truths.map((t) => ({ id: t.id, rung: t.rung, facet: t.facet })),
	};
}

/**
 * demoGridFromTruths compose la grille-démo via le twin pur À PARTIR DES VRAIES VÉRITÉS du projet
 * (l'image exacte que le Go `grid_build` renverrait pour ces mêmes vérités). PURE & TOTALE : mêmes
 * vérités → même grille (mêmes comptes, mêmes Σ, même ordre). C'est le repli honnête — déjà PEUPLÉ
 * de la donnée réelle — quand le live est injoignable. Un rung hors verticale / une facette hors
 * octuor est ignoré par buildGrid (comme le filtre IsSourceRung du Go).
 */
export function demoGridFromTruths(truths: readonly GridTruth[]): Grid | null {
	const nodes: KernelNode[] = truths.map((t) => ({
		id: t.id,
		level: t.rung as Level,
		facet: t.facet,
		label: t.id,
		parentId: null,
	}));
	const r = buildGrid(nodes);
	return r.ok ? r.grid : null;
}
