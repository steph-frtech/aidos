/**
 * WB2-03bis — le TWIN PUR de l'ÉCHELLE FRACTALE VIVANTE (§49 composition fractale, §108 `composes`).
 *
 * CORRECTION CONCEPTUELLE (décision humaine 2026-06-12, ADR 0055) : l'échelle fractale n'est PAS
 * un jeu clos à trois valeurs (« cellule | kernel | feuille » en dur était FAUX). L'échelle est une
 * POSITION dans l'ARBRE DE COMPOSITION (`composes`, le 7ᵉ lien §108) :
 *   - l'arbre POUSSE au fur et à mesure des ajouts (append-only, anti-overwrite §9) ;
 *   - sa profondeur est ILLIMITÉE (fractal §49 — borné seulement par le plancher feuille
 *     et le plafond racine/fédération) ;
 *   - racine / cellule / kernel / feuille sont des RÔLES DÉRIVÉS de la position (calculés à la
 *     lecture : profondeur + feuille-ou-non), JAMAIS stockés sur le nœud ;
 *   - le SYSTÈME identifie où attacher un besoin (placeIntent — un ALGORITHME de score, pas un
 *     prompt, §6/§8 déterminisme-first) ; l'HUMAIN peut surcharger (§49 : « les frontières des
 *     cellules sont posées par jugement humain, pas engendrées par la récursion »).
 *
 * DÉTERMINISME-FIRST : toutes les fonctions sont PURES & TOTALES — pas d'horloge, pas d'aléa,
 * pas d'E/S, pas de LLM. L'identité d'un nœud est content-adressée (FNV-1a du chemin canonique) :
 * même greffe → même id ; la greffe est IDEMPOTENTE (re-greffer le même libellé sous le même
 * parent ne crée rien). Le miroir de reproductibilité lib/v2/composition.test.ts (fast-check)
 * épingle : validité sous toute croissance, append-only, idempotence, profondeur illimitée,
 * rôles dérivés (une feuille qui reçoit un enfant DEVIENT kernel), placement total/déterministe/
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

/** Les RÔLES DÉRIVÉS d'une position dans l'arbre — un jeu clos de LECTURES, jamais stocké. */
export const SCALE_ROLES = ["racine", "cellule", "kernel", "feuille"] as const;
export type ScaleRole = (typeof SCALE_ROLES)[number];

/** Le PLACEMENT calculé d'une intention : le nœud d'attache + son adresse + son rôle dérivé. */
export interface Placement {
	/** L'id du nœud d'attache (membre de l'arbre, toujours). */
	readonly nodeId: string;
	/** Le chemin canonique (slugs joints par « / ») — l'ADRESSE de l'échelle. */
	readonly path: string;
	/** Le rôle dérivé de la position (jamais stocké). */
	readonly role: ScaleRole;
	/** Le score d'accroche lexicale (0 ⇒ aucune accroche : proposer une nouvelle cellule à la racine). */
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
 * Le RÔLE DÉRIVÉ d'une position (§49) — CALCULÉ à la lecture, jamais stocké sur le nœud :
 *   - profondeur 0            → « racine »  (le produit / la fédération — le plafond) ;
 *   - profondeur 1            → « cellule » (un contexte délimité, enfant direct de la racine) ;
 *   - feuille (profondeur ≥2) → « feuille » (le grain le plus fin — le plancher) ;
 *   - sinon                   → « kernel »  (un kernel intermédiaire).
 * La MÊME donnée change de rôle quand l'arbre pousse (une feuille greffée devient kernel).
 */
export function roleOf(nodes: readonly KernelNode[], id: string): ScaleRole {
	const depth = nodePath(nodes, id).length - 1;
	if (depth <= 0) return "racine";
	if (depth === 1) return "cellule";
	const hasChild = nodes.some((n) => n.parentId === id);
	return hasChild ? "kernel" : "feuille";
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
	if (best === null) return { nodeId: "", path: "", role: "racine", score: 0 };

	// Aucune accroche → la racine (proposer une nouvelle cellule), jamais un nœud arbitraire.
	const target =
		best.score === 0
			? (nodes.find((n) => n.parentId === null) ?? best.n)
			: best.n;

	return {
		nodeId: target.id,
		path: nodePath(nodes, target.id).join("/"),
		role: roleOf(nodes, target.id),
		score: best.score === 0 ? 0 : best.score,
	};
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
