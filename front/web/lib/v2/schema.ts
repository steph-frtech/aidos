/**
 * WB2-02 — le SCHÉMA KRD complet, projeté DÉTERMINISTIQUEMENT depuis le glossaire.
 *
 * La page d'accueil /v2 rend LE schéma : idée (étage d'entrée) → MUR (/goal) → la verticale
 * (les niveaux) × la facette × l'anatomie (paires-miroir) → les liens §17 → les arbres → les
 * cellules. Chaque bloc est un concept canonique KRD (un slug du glossaire) ; cliquer un bloc
 * navigue vers son écran /v2/<slug>.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : un layout est une FONCTION PURE, jamais un LLM. Les
 * nœuds, leurs positions, les arêtes et l'empreinte sont des projections pures & totales du
 * glossaire — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Même glossaire → même schéma.
 * Le miroir de reproductibilité lib/v2/schema.test.ts (fast-check) épingle :
 *   1. chaque libellé de nœud VIENT du glossaire (aucune chaîne en dur) ;
 *   2. chaque nœud cible un slug canonique (totalité, pas de lien mort) ;
 *   3. chaque arête relie deux nœuds existants ;
 *   4. l'empreinte est déterministe (même schéma → même hash).
 *
 * LE MUR (CLAUDE.md §2) : ce module DÉCRIT le schéma ; il n'écrit aucune vérité. C'est une
 * projection de lecture (read-only), jamais un kernel.
 */

import { GLOSSARY, type Locale, term } from "./glossary";

/**
 * Les étages du schéma, de haut en bas, dans l'ORDRE du parcours KRD. Chaque étage groupe les
 * concepts d'un même niveau d'altitude (au-dessus / sur / sous le mur). Le rang sert au layout
 * vertical déterministe (pas de positions magiques codées une à une).
 */
export type SchemaTier =
	/** au-dessus du mur : le candidat-vérité. */
	| "entree"
	/** LE MUR : la frontière franchie par /goal. */
	| "mur"
	/** sous le mur : la vérité gelée et ses axes. */
	| "verticale"
	/** les axes orthogonaux : facette + anatomie (paires-miroir). */
	| "axes"
	/** la structure : liens §17 + arbres + cellules. */
	| "structure";

/** L'ordre canonique des étages (le rang vertical). */
export const TIER_ORDER: readonly SchemaTier[] = [
	"entree",
	"mur",
	"verticale",
	"axes",
	"structure",
] as const;

/** Un nœud du schéma : un concept canonique (slug du glossaire) placé sur un étage. */
export interface SchemaNode {
	/** le slug canonique (clé du glossaire + cible de route /v2/<slug>). */
	readonly slug: string;
	/** l'étage (l'altitude par rapport au mur). */
	readonly tier: SchemaTier;
}

/** Une arête du schéma : relie deux slugs (source → cible), avec son sens KRD. */
export interface SchemaEdge {
	/** slug source. */
	readonly from: string;
	/** slug cible. */
	readonly to: string;
}

/**
 * LE SCHÉMA — les neuf concepts canoniques répartis sur leurs étages, dans l'ordre du parcours.
 * idée (entrée) → mur → kernel + verticale (verticale) → facette + paires-miroir (axes) →
 * liens + arbres + cellules (structure). Les slugs DOIVENT exister dans le glossaire (prouvé
 * par le miroir).
 */
export const SCHEMA_NODES: readonly SchemaNode[] = [
	{ slug: "idee", tier: "entree" },
	{ slug: "mur", tier: "mur" },
	{ slug: "kernel", tier: "verticale" },
	{ slug: "verticale", tier: "verticale" },
	{ slug: "facette", tier: "axes" },
	{ slug: "paires-miroir", tier: "axes" },
	{ slug: "liens", tier: "structure" },
	{ slug: "arbres", tier: "structure" },
	{ slug: "cellules", tier: "structure" },
] as const;

/**
 * LES ARÊTES — le flux du schéma : l'idée franchit le mur (idée → mur → kernel), le kernel
 * porte la verticale et ses axes (facette, paires-miroir), reliés par les liens, organisés en
 * arbres puis en cellules. Toutes les extrémités DOIVENT être des nœuds du schéma (prouvé).
 */
export const SCHEMA_EDGES: readonly SchemaEdge[] = [
	{ from: "idee", to: "mur" },
	{ from: "mur", to: "kernel" },
	{ from: "kernel", to: "verticale" },
	{ from: "kernel", to: "facette" },
	{ from: "kernel", to: "paires-miroir" },
	{ from: "verticale", to: "liens" },
	{ from: "facette", to: "liens" },
	{ from: "paires-miroir", to: "liens" },
	{ from: "liens", to: "arbres" },
	{ from: "arbres", to: "cellules" },
] as const;

/** Largeur de pas horizontale et verticale du layout (px). */
const COL_STEP = 220;
const ROW_STEP = 130;

/** Le rang vertical d'un étage (0 en haut). Total : -1 si étage inconnu. */
function tierRank(tier: SchemaTier): number {
	return TIER_ORDER.indexOf(tier);
}

/**
 * La POSITION (x, y) déterministe d'un nœud : y vient du rang de l'étage ; x centre les nœuds
 * du même étage. Fonction PURE & TOTALE — même schéma → mêmes positions, aucune dépendance
 * à l'ordre de rendu, à l'horloge ou à l'aléa.
 */
export function nodePosition(slug: string): { x: number; y: number } {
	const node = SCHEMA_NODES.find((n) => n.slug === slug);
	if (node === undefined) return { x: 0, y: 0 };
	const y = tierRank(node.tier) * ROW_STEP;
	const sameTier = SCHEMA_NODES.filter((n) => n.tier === node.tier);
	const indexInTier = sameTier.findIndex((n) => n.slug === slug);
	// centre la rangée : décale de la moitié de la largeur totale de l'étage.
	const x = (indexInTier - (sameTier.length - 1) / 2) * COL_STEP;
	return { x, y };
}

/**
 * Le libellé d'un nœud dans la locale — VIENT DU GLOSSAIRE (jamais en dur). Total : "" si le
 * slug n'est pas un concept canonique (interdit par le schéma, prouvé par le miroir).
 */
export function nodeLabel(slug: string, locale: Locale): string {
	return term(slug, locale) ?? "";
}

/**
 * La totalité du schéma : chaque nœud cible un slug canonique du glossaire, chaque arête relie
 * deux nœuds du schéma, et aucun slug n'est dupliqué. PURE & TOTALE.
 */
export function isSchemaTotal(): boolean {
	const glossarySlugs = new Set(GLOSSARY.map((e) => e.slug));
	const nodeSlugs = new Set<string>();
	for (const n of SCHEMA_NODES) {
		if (!glossarySlugs.has(n.slug)) return false;
		if (nodeSlugs.has(n.slug)) return false;
		if (tierRank(n.tier) < 0) return false;
		nodeSlugs.add(n.slug);
	}
	for (const e of SCHEMA_EDGES) {
		if (!nodeSlugs.has(e.from)) return false;
		if (!nodeSlugs.has(e.to)) return false;
	}
	return SCHEMA_NODES.length > 0;
}

/**
 * L'empreinte content-adressée du schéma (FNV-1a 32 bits, hex) — déterministe. Même schéma
 * (nœuds + étages + arêtes) → même empreinte ; toute mutation la change.
 */
export function schemaHash(): string {
	const canonNodes = SCHEMA_NODES.map((n) => `${n.slug}@${n.tier}`).join(",");
	const canonEdges = SCHEMA_EDGES.map((e) => `${e.from}->${e.to}`).join(",");
	const canon = `${canonNodes}|${canonEdges}`;
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
