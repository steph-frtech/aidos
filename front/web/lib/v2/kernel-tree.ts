/**
 * WB2-04 — le TWIN PUR de l'ARBRE DE COMPOSITION des kernels (§17 `composes`, §49 fractale).
 *
 * L'écran /v2/kernels rend l'ARBRE FRACTAL des kernels : produit → parcours → … → entité, chaque
 * nœud = un kernel à son niveau, dépliable, virtualisé (React Arborist, ADR 0053). La donnée de
 * l'arbre est une PROJECTION PURE : on part de la relation `composes` (la liste plate des kernels,
 * chacun pointant son parent), et on FIGE l'arbre ordonné que la lib ne fait que rendre.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer l'arbre est une FONCTION PURE & TOTALE — pas
 * d'horloge, pas d'aléa, pas d'E/S, pas de LLM. L'ordre est DÉCLARÉ (l'ordre de la verticale §23,
 * puis l'id en tie-break stable), jamais appris. Le miroir de reproductibilité lib/v2/kernel-tree
 * .test.ts (fast-check) épingle : aucun nœud orphelin, le compte préservé (flatten ↔ entrée),
 * l'ordre déterministe (même entrée → même arbre), la détection de cycle, la profondeur correcte.
 *
 * RÉUTILISATION (pas de fork) : les NIVEAUX et leur ORDRE viennent de la grammaire besoin
 * (SOURCE_ORDER + bands, réutilisés de lib/besoin-grammar) ; les FACETTES de lib/facets
 * (réutilisées via lib/v2/idea). Le glossaire V2 reste la source des libellés d'écran ; ce module
 * ne tient que la LOGIQUE de l'arbre.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture ; il n'écrit aucune vérité. L'arbre est
 * une projection de lecture, jamais un kernel.
 */

import { isLevel, type Level, SOURCE_ORDER } from "../besoin-grammar";
import { isFacetLetter } from "./idea";

/**
 * Un KERNEL plat tel que stocké dans la relation `composes` (§17) : son id content-adressé, son
 * niveau (verticale §23), sa facette (FKE-1.3), son libellé, et l'id du kernel qui le COMPOSE
 * (son parent). `parentId === null` ⇒ une racine (le produit, au sommet de la verticale).
 */
export interface KernelNode {
	/** L'identité content-adressée du kernel (stable). */
	readonly id: string;
	/** Le niveau de la verticale (§23) ou une band. */
	readonly level: Level;
	/** La lettre de facette (FKE-1.3). */
	readonly facet: string;
	/** Le libellé court (verbatim, jamais reformulé). */
	readonly label: string;
	/** L'id du parent (le kernel qui le `composes`), ou null pour une racine. */
	readonly parentId: string | null;
}

/**
 * Un nœud de l'ARBRE projeté — ce que React Arborist consomme (id + children) augmenté des
 * métadonnées du kernel et de sa PROFONDEUR (la position fractale, racine = 0).
 */
export interface TreeNode {
	readonly id: string;
	readonly level: Level;
	readonly facet: string;
	readonly label: string;
	/** La profondeur (0 = racine), calculée, jamais déclarée. */
	readonly depth: number;
	/** Les enfants composés, ORDONNÉS (verticale puis id). */
	readonly children: TreeNode[];
}

/** Le diagnostic d'une relation `composes` invalide (pourquoi l'arbre ne peut pas se composer). */
export type TreeError =
	| "duplicate_id"
	| "orphan_node"
	| "cycle"
	| "level_unknown"
	| "facet_unknown"
	| "empty_id";

export type BuildResult =
	| { ok: true; roots: TreeNode[] }
	| { ok: false; errors: TreeError[] };

/** Le rang d'un niveau dans la verticale (§23) — la clé d'ordre primaire. Bands en queue, stable. */
function levelRank(level: Level): number {
	const i = SOURCE_ORDER.indexOf(level);
	return i < 0 ? SOURCE_ORDER.length : i;
}

/**
 * VALIDE une relation `composes` plate et renvoie la liste (ordonnée, stable) de ses erreurs.
 * PURE & TOTALE : même entrée → mêmes erreurs. Aucun effet de bord.
 *   - empty_id    : un id vide (un kernel n'a pas d'identité) ;
 *   - duplicate_id: deux kernels au même id (l'identité n'est plus content-adressée) ;
 *   - level_unknown / facet_unknown : une coordonnée hors des jeux clos ;
 *   - orphan_node : un parentId qui ne résout vers AUCUN kernel (le critère « aucun orphelin ») ;
 *   - cycle       : un cycle dans `composes` (l'arbre ne pourrait pas se composer).
 */
export function validateComposes(nodes: readonly KernelNode[]): TreeError[] {
	const errors: TreeError[] = [];
	const ids = new Set<string>();
	let hasDuplicate = false;
	let hasEmpty = false;
	for (const n of nodes) {
		if (n.id.trim() === "") hasEmpty = true;
		else if (ids.has(n.id)) hasDuplicate = true;
		else ids.add(n.id);
	}
	if (hasEmpty) errors.push("empty_id");
	if (hasDuplicate) errors.push("duplicate_id");

	let hasUnknownLevel = false;
	let hasUnknownFacet = false;
	for (const n of nodes) {
		if (!isLevel(n.level)) hasUnknownLevel = true;
		if (!isFacetLetter(n.facet)) hasUnknownFacet = true;
	}
	if (hasUnknownLevel) errors.push("level_unknown");
	if (hasUnknownFacet) errors.push("facet_unknown");

	// Orphelin : un parentId non vide qui ne pointe vers aucun id connu.
	let hasOrphan = false;
	for (const n of nodes) {
		if (n.parentId !== null && !ids.has(n.parentId)) hasOrphan = true;
	}
	if (hasOrphan) errors.push("orphan_node");

	// Cycle : en suivant parentId on doit toujours atteindre une racine (parentId === null),
	// sans repasser deux fois par le même id. Détection par remontée bornée.
	if (!hasOrphan && !hasDuplicate && !hasEmpty) {
		const parentOf = new Map<string, string | null>(
			nodes.map((n) => [n.id, n.parentId] as const),
		);
		let hasCycle = false;
		for (const n of nodes) {
			const seen = new Set<string>();
			let cur: string | null = n.id;
			while (cur !== null) {
				if (seen.has(cur)) {
					hasCycle = true;
					break;
				}
				seen.add(cur);
				cur = parentOf.get(cur) ?? null;
			}
			if (hasCycle) break;
		}
		if (hasCycle) errors.push("cycle");
	}

	return errors;
}

/** L'ordre canonique des frères : par rang de niveau (verticale §23) puis par id (tie-break stable). */
function compareSiblings(a: KernelNode, b: KernelNode): number {
	const ra = levelRank(a.level);
	const rb = levelRank(b.level);
	if (ra !== rb) return ra - rb;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * COMPOSE l'arbre fractal depuis la relation `composes` plate — le cœur du twin. PURE & TOTALE &
 * DÉTERMINISTE :
 *   1. valide l'entrée (ids, coordonnées, orphelins, cycles) ; sinon → { ok:false, errors } ;
 *   2. groupe les enfants par parent ; ORDONNE chaque fratrie (verticale §23 puis id) ;
 *   3. construit récursivement, en calculant la PROFONDEUR (racine = 0) ;
 *   4. renvoie les racines ordonnées.
 * Aucune écriture, aucun LLM, aucune horloge. Même entrée → même arbre (même ordre, mêmes
 * profondeurs). « Aucun nœud orphelin » est garanti par la validation préalable.
 */
export function buildKernelTree(nodes: readonly KernelNode[]): BuildResult {
	const errors = validateComposes(nodes);
	if (errors.length > 0) return { ok: false, errors };

	const childrenOf = new Map<string | null, KernelNode[]>();
	for (const n of nodes) {
		const key = n.parentId;
		const bucket = childrenOf.get(key);
		if (bucket === undefined) childrenOf.set(key, [n]);
		else bucket.push(n);
	}
	for (const bucket of childrenOf.values()) bucket.sort(compareSiblings);

	const build = (n: KernelNode, depth: number): TreeNode => {
		const kids = childrenOf.get(n.id) ?? [];
		return {
			id: n.id,
			level: n.level,
			facet: n.facet,
			label: n.label,
			depth,
			children: kids.map((k) => build(k, depth + 1)),
		};
	};

	const roots = (childrenOf.get(null) ?? []).map((r) => build(r, 0));
	return { ok: true, roots };
}

/**
 * APLATIT l'arbre en parcours préfixe (racines puis enfants, dans l'ordre) — l'inverse logique de
 * buildKernelTree. PURE & TOTALE. Sert au miroir de reproductibilité (le compte est préservé) et
 * au comptage de nœuds pour la virtualisation (200+ nœuds).
 */
export function flattenTree(roots: readonly TreeNode[]): TreeNode[] {
	const out: TreeNode[] = [];
	const walk = (n: TreeNode) => {
		out.push(n);
		for (const c of n.children) walk(c);
	};
	for (const r of roots) walk(r);
	return out;
}

/** Le nombre total de nœuds de l'arbre (déterministe). Sert au compteur de virtualisation. */
export function countNodes(roots: readonly TreeNode[]): number {
	return flattenTree(roots).length;
}

/**
 * Construit une relation `composes` SYNTHÉTIQUE de N kernels (un produit racine, puis des branches
 * fractales) — déterministe, pour peupler l'écran (200+ nœuds) et le miroir de virtualisation.
 * PURE & TOTALE : même N → même relation. Chaque kernel descend d'un cran dans la verticale jusqu'à
 * l'entité, puis recommence une cellule sœur ; aucune coordonnée hors des jeux clos.
 */
export function syntheticComposes(n: number): KernelNode[] {
	const size = Math.max(0, Math.floor(n));
	const facets = ["F", "I", "S", "B", "R", "V", "M", "X"];
	const out: KernelNode[] = [];
	for (let i = 0; i < size; i++) {
		const levelIdx = i % SOURCE_ORDER.length;
		const level = SOURCE_ORDER[levelIdx];
		const facet = facets[i % facets.length];
		// La racine (produit) du premier bloc n'a pas de parent ; les autres descendent du
		// précédent dans la fratrie fractale (le nœud d'index i-1 quand on n'est pas une racine).
		const parentId = levelIdx === 0 ? null : `k${i - 1}`;
		out.push({
			id: `k${i}`,
			level,
			facet,
			label: `${level} ${i}`,
			parentId,
		});
	}
	return out;
}
