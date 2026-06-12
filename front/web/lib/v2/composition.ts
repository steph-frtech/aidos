/**
 * WB2-03bis — le TWIN PUR de l'ÉCHELLE FRACTALE VIVANTE (§49 composition fractale, §108 `composes`).
 *
 * CORRECTION CONCEPTUELLE (décision humaine 2026-06-12, ADR 0055) : l'échelle fractale n'est PAS
 * un jeu clos à trois valeurs (« cellule | kernel | feuille » en dur était FAUX). L'échelle est une
 * POSITION dans l'ARBRE DE COMPOSITION (`composes`, le 7ᵉ lien §108) :
 *   - l'arbre POUSSE au fur et à mesure des ajouts (append-only, anti-overwrite §9) ;
 *   - sa profondeur est ILLIMITÉE (fractal §49 — borné seulement par le plancher feuille
 *     et le plafond racine/fédération) ;
 *   - la POSITION est TOPOLOGIQUE, jamais un nom de niveau : racine (prof. 0), feuille (sans
 *     enfant) et la profondeur numerique nN — calculees a la lecture, JAMAIS stockees ;
 *   - le SYSTÈME identifie où attacher un besoin (placeIntent — un ALGORITHME de score, pas un
 *     prompt, §6/§8 déterminisme-first) ; l'HUMAIN peut surcharger (§49 : « les frontières des
 *     cellules sont posées par jugement humain, pas engendrées par la récursion »).
 *
 * DÉTERMINISME-FIRST : toutes les fonctions sont PURES & TOTALES — pas d'horloge, pas d'aléa,
 * pas d'E/S, pas de LLM. L'identité d'un nœud est content-adressée (FNV-1a du chemin canonique) :
 * même greffe → même id ; la greffe est IDEMPOTENTE (re-greffer le même libellé sous le même
 * parent ne crée rien). Le miroir de reproductibilité lib/v2/composition.test.ts (fast-check)
 * épingle : validité sous toute croissance, append-only, idempotence, profondeur illimitée,
 * position topologique (une feuille greffée cesse d'être feuille), placement total/déterministe/
 * membre, bijection chemin↔nœud.
 *
 * RÉUTILISATION (pas de fork) : la STRUCTURE (KernelNode, validation cycles/orphelins, l'arbre
 * rendu) vient de lib/v2/kernel-tree (WB2-04) ; les NIVEAUX de la verticale (§23) de
 * lib/besoin-grammar. Ce module ne tient que la LOGIQUE de l'échelle vivante : croissance,
 * chemins, rôles dérivés, placement.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE et PROPOSE ; il n'écrit aucune vérité. La greffe
 * retourne une NOUVELLE liste (l'écran propose) ; la persistance `composes` en Postgres reste
 * S17/S18 (OpenQuestion documentée — le back-fill du substrat, jamais un write d'écran).
 */

import { SOURCE_ORDER } from "../besoin-grammar";
import type { KernelNode } from "./kernel-tree";

/**
 * La POSITION d'un nœud — TOPOLOGIQUE, jamais un nom de niveau. L'arbre étant ILLIMITÉ
 * (§49), nommer les niveaux n'a pas de sens : un « niveau 7 » n'est pas plus « kernel »
 * qu'un autre — CHAQUE nœud est un kernel (l'auto-similarité). Les seules lectures
 * stables d'une position : la RACINE (profondeur 0), la FEUILLE (aucun enfant — le
 * plancher), et la PROFONDEUR numérique (n0, n1, n2… — infinie comme l'arbre).
 * Calculée à la lecture, jamais stockée.
 */
export interface Position {
	/** La profondeur (racine = 0) — illimitée, affichée telle quelle (n{depth}). */
	readonly depth: number;
	/** Profondeur 0 — le produit / la fédération (le plafond §49). */
	readonly isRoot: boolean;
	/** Aucun enfant — le grain le plus fin À CE JOUR (le plancher §49) ; cesse de l'être à la greffe. */
	readonly isLeaf: boolean;
}

/** Le PLACEMENT calculé d'une intention : le nœud d'attache + son adresse + sa position dérivée. */
export interface Placement {
	/** L'id du nœud d'attache (membre de l'arbre, toujours). */
	readonly nodeId: string;
	/** Le chemin canonique (slugs joints par « / ») — l'ADRESSE de l'échelle. */
	readonly path: string;
	/** La position dérivée (topologique, jamais stockée). */
	readonly position: Position;
	/** Le score d'accroche lexicale (0 ⇒ aucune accroche : proposer une nouvelle branche à la racine). */
	readonly score: number;
}

/**
 * SLUGIFIE un libellé en segment de chemin canonique : minuscules, accents pliés (NFD sans
 * diacritiques), tout non-[a-z0-9] devient un tiret, tirets bornés. PURE & TOTALE & IDEMPOTENTE.
 */
export function slugify(label: string): string {
	return label
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** FNV-1a 32 bits (hex) — le même schéma content-adressé que les twins WB2-03/WB2-11. */
function fnv1a(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/** L'index parent→enfants (lecture pure, recalculé — jamais un état). */
function childrenIndex(
	nodes: readonly KernelNode[],
): Map<string | null, KernelNode[]> {
	const idx = new Map<string | null, KernelNode[]>();
	for (const n of nodes) {
		const bucket = idx.get(n.parentId);
		if (bucket === undefined) idx.set(n.parentId, [n]);
		else bucket.push(n);
	}
	return idx;
}

/**
 * Le CHEMIN d'un nœud : les slugs de ses libellés, de la racine jusqu'à lui. PURE & TOTALE :
 * un id inconnu → [] ; une remontée est bornée par la taille de l'arbre (pas de boucle infinie
 * même sur une entrée cyclique — fail-closed).
 */
export function nodePath(
	nodes: readonly KernelNode[],
	id: string,
): readonly string[] {
	const byId = new Map(nodes.map((n) => [n.id, n] as const));
	const segments: string[] = [];
	let cur = byId.get(id);
	let hops = 0;
	while (cur !== undefined && hops <= nodes.length) {
		segments.unshift(slugify(cur.label));
		cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
		hops++;
	}
	return hops > nodes.length ? [] : segments;
}

/**
 * RÉSOUT un chemin (slugs joints par « / ») vers son nœud — l'inverse de nodePath. PURE &
 * TOTALE : un chemin vide ou inconnu → null (fail-closed). La descente matche slug à slug
 * depuis les racines.
 */
export function nodeByPath(
	nodes: readonly KernelNode[],
	path: string,
): KernelNode | null {
	const segments = path.split("/").filter((s) => s.length > 0);
	if (segments.length === 0) return null;
	const idx = childrenIndex(nodes);
	let candidates = idx.get(null) ?? [];
	let found: KernelNode | null = null;
	for (const seg of segments) {
		found = candidates.find((n) => slugify(n.label) === seg) ?? null;
		if (found === null) return null;
		candidates = idx.get(found.id) ?? [];
	}
	return found;
}

/**
 * La POSITION dérivée d'un nœud (§49) — CALCULÉE à la lecture, jamais stockée, et
 * JAMAIS un nom de niveau : l'arbre est illimité, donc seuls comptent la profondeur
 * numérique et les deux faits topologiques sans échelle (racine, feuille). « Cellule »
 * et « kernel » ne sont PAS des profondeurs — chaque nœud EST un kernel (l'auto-
 * similarité §49), et une cellule est une FRONTIÈRE déclarée par l'humain, pas un
 * étage. La MÊME donnée change de lecture quand l'arbre pousse (une feuille greffée
 * cesse d'être feuille ; sa profondeur, elle, ne bouge pas).
 */
export function positionOf(nodes: readonly KernelNode[], id: string): Position {
	const depth = Math.max(0, nodePath(nodes, id).length - 1);
	const isLeaf = !nodes.some((n) => n.parentId === id);
	return { depth, isRoot: depth === 0, isLeaf };
}

/**
 * GREFFE un nœud sous un parent — « l'arbre se construit au fur et à mesure des ajouts ».
 * PURE & TOTALE & DÉTERMINISTE & IDEMPOTENTE & APPEND-ONLY :
 *   - parent inconnu ou libellé vide (après slug) → l'arbre INCHANGÉ (fail-closed) ;
 *   - un enfant au même slug existe déjà sous ce parent → l'arbre INCHANGÉ (idempotence) ;
 *   - sinon : UN nœud ajouté en queue (le préfixe est intact — append-only, §9), id
 *     content-adressé (FNV-1a du chemin canonique), niveau = le rang SUIVANT de la verticale
 *     (§23, clampé à l'entité — règle DÉCLARÉE), facette héritée du parent.
 */
export function growComposes(
	nodes: readonly KernelNode[],
	parentId: string,
	label: string,
): readonly KernelNode[] {
	const parent = nodes.find((n) => n.id === parentId);
	if (parent === undefined) return nodes;
	const slug = slugify(label);
	if (slug === "") return nodes;

	const exists = nodes.some(
		(n) => n.parentId === parentId && slugify(n.label) === slug,
	);
	if (exists) return nodes;

	const parentRank = SOURCE_ORDER.indexOf(parent.level);
	const childRank = Math.min(
		(parentRank < 0 ? SOURCE_ORDER.length - 1 : parentRank) + 1,
		SOURCE_ORDER.length - 1,
	);
	const path = [...nodePath(nodes, parentId), slug].join("/");

	return [
		...nodes,
		{
			id: fnv1a(path),
			level: SOURCE_ORDER[childRank],
			facet: parent.facet,
			label: label.trim(),
			parentId,
		},
	];
}

/** Plie une chaîne en TOKENS canoniques (≥3 chars, accents pliés, dédupliqués). */
function tokensOf(text: string): Set<string> {
	return new Set(
		text
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length >= 3),
	);
}

/**
 * PLACE une intention dans l'arbre — « le système identifie à quel niveau de l'arbre ajouter ».
 * Un ALGORITHME de score (déterminisme-first §6/§8 — jamais un prompt) :
 *   1. tokenise l'intention (accents pliés, tokens ≥3 chars) ;
 *   2. score chaque nœud : +2 par token commun avec SON libellé, +1 par token commun avec un
 *      libellé ANCÊTRE (le contexte compte, le nœud propre compte double) ;
 *   3. départage : score ↓, puis profondeur ↓ (le PLUS SPÉCIFIQUE gagne), puis id ↑ (stable) ;
 *   4. score 0 (aucune accroche) → la RACINE : l'écran propose d'y greffer une NOUVELLE cellule.
 * PURE & TOTALE & DÉTERMINISTE : même (arbre, intention) → même placement, toujours un nœud
 * MEMBRE. L'humain peut surcharger le placement proposé (§49 — le jugement reste humain).
 */
export function placeIntent(
	nodes: readonly KernelNode[],
	intent: string,
): Placement {
	const tokens = tokensOf(intent);
	const byId = new Map(nodes.map((n) => [n.id, n] as const));

	let best: { n: KernelNode; score: number; depth: number } | null = null;
	for (const n of nodes) {
		const own = tokensOf(n.label);
		let score = 0;
		for (const t of tokens) if (own.has(t)) score += 2;
		// les ancêtres : +1 par token commun (le contexte)
		let cur = n.parentId === null ? undefined : byId.get(n.parentId);
		let hops = 0;
		while (cur !== undefined && hops <= nodes.length) {
			const anc = tokensOf(cur.label);
			for (const t of tokens) if (anc.has(t)) score += 1;
			cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
			hops++;
		}
		const depth = nodePath(nodes, n.id).length - 1;
		if (
			best === null ||
			score > best.score ||
			(score === best.score && depth > best.depth) ||
			(score === best.score && depth === best.depth && n.id < best.n.id)
		) {
			best = { n, score, depth };
		}
	}

	// Arbre vide impossible en pratique (seed) ; total quand même : un placement « nulle part ».
	if (best === null)
		return {
			nodeId: "",
			path: "",
			position: { depth: 0, isRoot: true, isLeaf: true },
			score: 0,
		};

	// Aucune accroche → la racine (proposer une nouvelle branche), jamais un nœud arbitraire.
	const target =
		best.score === 0
			? (nodes.find((n) => n.parentId === null) ?? best.n)
			: best.n;

	return {
		nodeId: target.id,
		path: nodePath(nodes, target.id).join("/"),
		position: positionOf(nodes, target.id),
		score: best.score === 0 ? 0 : best.score,
	};
}

/**
 * L'ARBRE NU d'un PROJET NEUF : la seule racine (le produit), RIEN d'autre — aucun
 * parcours de démonstration. Un utilisateur qui n'a encore rien créé ne doit voir
 * AUCUNE branche pré-remplie (correction utilisateur 2026-06-12) ; l'arbre pousse
 * ensuite par ses greffes et ses idées. Le seed de démo (seedComposes) reste pour
 * les écrans V2 qui illustrent le concept.
 */
export function bareTree(): readonly KernelNode[] {
	return [
		{
			id: fnv1a("app"),
			level: SOURCE_ORDER[0],
			facet: "F",
			label: "app",
			parentId: null,
		},
	];
}

/**
 * L'ARBRE SEED canonique (déterministe) qui amorce l'écran tant que la relation `composes`
 * vivante n'est pas servie depuis Postgres (S17/S18 — OpenQuestion documentée, ne bloque pas) :
 * une racine produit (« app »), deux cellules (« paiement », « catalogue »), un kernel
 * (« checkout ») et une feuille (« débit du compte »). Il POUSSE ensuite via growComposes.
 */
export function seedComposes(): readonly KernelNode[] {
	const L = SOURCE_ORDER;
	const last = L.length - 1;
	const root: KernelNode = {
		id: fnv1a("app"),
		level: L[0],
		facet: "F",
		label: "app",
		parentId: null,
	};
	const paiement: KernelNode = {
		id: fnv1a("app/paiement"),
		level: L[Math.min(1, last)],
		facet: "F",
		label: "paiement",
		parentId: root.id,
	};
	const catalogue: KernelNode = {
		id: fnv1a("app/catalogue"),
		level: L[Math.min(1, last)],
		facet: "F",
		label: "catalogue",
		parentId: root.id,
	};
	const checkout: KernelNode = {
		id: fnv1a("app/paiement/checkout"),
		level: L[Math.min(2, last)],
		facet: "F",
		label: "checkout",
		parentId: paiement.id,
	};
	const debit: KernelNode = {
		id: fnv1a("app/paiement/checkout/debit-du-compte"),
		level: L[Math.min(3, last)],
		facet: "F",
		label: "débit du compte",
		parentId: checkout.id,
	};
	return [root, paiement, catalogue, checkout, debit];
}
