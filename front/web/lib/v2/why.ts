/**
 * WB2-19 — le TWIN PUR du WhyTree (ROADMAP-fke FK13, FKE-35.1, KRD LIVRE XXX) : `/v2/why` construit,
 * depuis un SYMPTÔME (un miroir rouge), l'ARBRE des causes — le « 5-pourquoi redressé » (fishbone) —
 * en remontant DÉTERMINISTIQUEMENT les arêtes `caused_by` (FK12) du symptôme vers la cause racine.
 *
 * Là où WB2-18 montre TOUTES les specs en graphe 3D, WB2-19 montre la CAUSALITÉ ARRIÈRE : d'un
 * symptôme à sa racine, hop par hop, chaque cause CANDIDATE déjà dans le graphe est VÉRIFIÉE
 * (reproduite) ; une cause HORS-GRAPHE proposée par le LLM n'entre QUE si elle est VÉRIFIÉE (reproduite
 * ou rejetée — une cause rejetée est JETÉE, jamais retenue : anti-confabulation §8) ; et l'arbre se
 * TERMINE OBLIGATOIREMENT en miroir (la racine → /learn → un miroir d'anti-récurrence). Un WhyTree
 * sans miroir terminal est REFUSÉ (`WHYTREE_NO_MIRROR`).
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la remontée `caused_by` est `trace` de `lib/caused-by.ts`
 * (FK12, elle-même miroir du Go `back/kernel/causedby`) — une FONCTION PURE & DÉTERMINISTE (BFS
 * nearest-first, refus de cycle, round-trip content-adressé). Ce module n'invente AUCUNE règle de
 * remontée : il RÉUTILISE `trace` VERBATIM et il ajoute la seule chose neuve de WB2-19 :
 *   - `whyTree(symptom, edges, opts)` — l'ARBRE des causes : la remontée `caused_by` PROJETÉE en arbre
 *     (chaque cause = un nœud), chaque nœud portant son STATUT de vérification (reproduit / rejeté /
 *     hors-graphe-vérifié) ; une cause REJETÉE est élaguée ; la TERMINAISON en miroir est exigée ;
 *   - `arboristWhyTree(tree)` — la projection vers la forme `{ id, name, children }` que React Arborist
 *     déplie (content-adressée par la position dans l'arbre → déterministe) ;
 *   - `WHY_CASES` — le registre CLOS des cas d'exemple (un symptôme → sa chaîne, le cas racine, le cas
 *     cyclique refusé, le cas hors-graphe vérifié) — réutilise les arêtes `caused_by` de FK12.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la remontée est une FONCTION PURE (aucune horloge, aucun aléa,
 * aucune I/O, aucun LLM) — `whyTree(s, e, o)` deux fois → le MÊME arbre (mêmes ids, même ordre, même
 * statut). Le SEUL morceau irréductible serait la formulation LLM du « pourquoi » HORS-graphe ; ce code
 * ne l'écrit pas — il EXIGE qu'une cause hors-graphe arrive DÉJÀ VÉRIFIÉE (reproduite|rejetée) et JETTE
 * toute cause rejetée. Le miroir de reproductibilité lib/v2/why.test.ts épingle : déterminisme,
 * remontée == chaîne `trace`, refus de cycle, refus sans miroir terminal, élagage des causes rejetées.
 *
 * LE MUR (CLAUDE.md §2) : construire un WhyTree LIT le graphe `caused_by` ; il n'écrit AUCUNE vérité.
 * La terminaison en miroir est une EXIGENCE de forme (la racine DOIT pointer un miroir approuvé), pas
 * une écriture — promouvoir le miroir d'anti-récurrence passe par /learn → idée → miroir → /goal.
 */

import {
	CAUSED_BY_KIND,
	type CauseChain,
	type Edge,
	ERR_CYCLE,
	isPinned,
	type Ref,
	refString,
	serializeEdgeBody,
	type TraceResult,
	trace,
	validate,
} from "../caused-by";
import { CAUSED_BY_CASES, type CausedByCase } from "../caused-by-data";

// On RÉ-EXPORTE les types/valeurs réutilisés (FK12) pour que l'écran V2 importe tout depuis un seul
// module v2 — aucune duplication, aucune nouvelle vérité de remontée.
export {
	CAUSED_BY_CASES,
	CAUSED_BY_KIND,
	type CauseChain,
	type CausedByCase,
	type Edge,
	ERR_CYCLE,
	isPinned,
	type Ref,
	refString,
	serializeEdgeBody,
	type TraceResult,
	trace,
	validate,
};

// ── Le STATUT de vérification d'une cause (anti-confabulation §8) ─────────────

/**
 * Le statut de vérification d'une cause candidate :
 *   - `in_graph` — la cause est une arête `caused_by` DÉJÀ dans le graphe versionné : elle est
 *     reproductible par construction (le graphe est la vérité), aucune confabulation possible ;
 *   - `reproduced` — une cause HORS-graphe (proposée par le LLM) qui a été REPRODUITE (vérifiée) :
 *     elle ENTRE dans l'arbre ;
 *   - `rejected` — une cause hors-graphe NON reproduite : elle est ÉLAGUÉE (jamais retenue).
 */
export type CauseVerdict = "in_graph" | "reproduced" | "rejected";

/** Une cause HORS-graphe proposée par le LLM, avec son verdict de vérification (reproduite|rejetée). */
export interface OffGraphCause {
	/** l'id de la cause candidate (hors du graphe `caused_by` versionné). */
	readonly id: string;
	/** le « pourquoi » formulé par le LLM (la seule part irréductible — TEXTE, pas une décision). */
	readonly why: string;
	/** le verdict de vérification : reproduite (entre) ou rejetée (élaguée). Le CODE juge la STRUCTURE. */
	readonly verdict: "reproduced" | "rejected";
	/** l'id de la cause-parent (du graphe) sous laquelle accrocher cette cause hors-graphe. */
	readonly under: string;
}

// ── Le NŒUD du WhyTree (l'arbre fishbone) ────────────────────────────────────

/** Un nœud du WhyTree : une cause (ou le symptôme racine), son statut, et ses causes-filles. */
export interface WhyNode {
	/** l'id content-adressé du nœud dans l'arbre ("w0", "w0.0", …) → déterministe. */
	readonly id: string;
	/** l'id de la cause (ou du symptôme à la racine). */
	readonly cause: string;
	/** la distance en hops depuis le symptôme (0 = le symptôme lui-même). */
	readonly depth: number;
	/** le statut de vérification de la cause (in_graph par défaut ; reproduced pour une cause LLM gardée). */
	readonly verdict: CauseVerdict;
	/** le « pourquoi » (vide pour une cause du graphe ; le texte LLM pour une cause hors-graphe vérifiée). */
	readonly why: string;
	/** true si ce nœud est une FEUILLE (aucune cause plus profonde) → une cause racine candidate. */
	readonly leaf: boolean;
	/** les causes-filles (un hop plus profond). */
	readonly children: WhyNode[];
}

/** Le miroir TERMINAL exigé à la racine d'un WhyTree (la terminaison obligatoire en miroir). */
export interface TerminalMirror {
	/** l'id du miroir d'anti-récurrence (la racine → /learn → ce miroir). */
	readonly mirrorId: string;
	/** le ref `caused_by` racine que ce miroir couvre (la cause racine candidate). */
	readonly covers: string;
}

/** Le sentinel de refus : un WhyTree sans miroir terminal est refusé (la terminaison obligatoire). */
export const WHYTREE_NO_MIRROR = "WHYTREE_NO_MIRROR" as const;

/** Le résultat de `whyTree` : soit l'arbre construit, soit un refus (cycle | pas de miroir terminal). */
export type WhyTreeResult =
	| {
			ok: true;
			/** la racine de l'arbre fishbone (le symptôme + ses causes vérifiées). */
			root: WhyNode;
			/** la chaîne `trace` brute (la remontée déterministe nearest-first) — pour l'audit. */
			chain: CauseChain;
			/** le miroir terminal qui clôt l'arbre (la terminaison obligatoire). */
			terminal: TerminalMirror;
			/** les ids des causes hors-graphe REJETÉES (élaguées) — pour la transparence anti-confabulation. */
			pruned: string[];
	  }
	| { ok: false; error: typeof ERR_CYCLE | typeof WHYTREE_NO_MIRROR };

/** Les options de `whyTree` : le miroir terminal exigé + d'éventuelles causes hors-graphe (LLM, vérifiées). */
export interface WhyOptions {
	/** le miroir d'anti-récurrence qui clôt l'arbre (OBLIGATOIRE — son absence ⇒ WHYTREE_NO_MIRROR). */
	readonly terminal?: TerminalMirror;
	/** les causes HORS-graphe proposées par le LLM, chacune DÉJÀ vérifiée (reproduite|rejetée). */
	readonly offGraph?: readonly OffGraphCause[];
}

/**
 * `whyTree` est la porte WB2-19 : construit l'ARBRE des causes (fishbone) d'un symptôme.
 *
 *   1. REMONTÉE — `trace(symptom, edges)` (FK12) calcule, DÉTERMINISTIQUEMENT, la chaîne de causes
 *      candidates nearest-first ; un cycle ⇒ refus `ERR_CYCLE` (jamais un arbre partiel).
 *   2. ARBRE — la chaîne est projetée en arbre `caused_by` : chaque cause un nœud, accroché sous son
 *      parent `caused_by` le plus proche (la structure d'arête, pas la liste plate) ; profondeur = hops.
 *   3. HORS-GRAPHE (gaté) — chaque cause LLM `reproduced` est GREFFÉE sous son parent ; une cause
 *      `rejected` est ÉLAGUÉE (anti-confabulation §8 — jamais retenue). Le CODE juge la STRUCTURE ; le
 *      LLM ne fournit qu'un TEXTE déjà vérifié.
 *   4. TERMINAISON — l'arbre DOIT être clos par un miroir terminal (`opts.terminal`) ; son absence ⇒
 *      refus `WHYTREE_NO_MIRROR` (la terminaison obligatoire en miroir).
 *
 * PURE + TOTALE + DÉTERMINISTE : (symptom, edges, opts) → même arbre (mêmes ids "w…", même ordre, même
 * statut). NO LLM dans ce twin — il VÉRIFIE la structure. Le mur §2 : lit, n'écrit aucune vérité.
 */
export function whyTree(
	symptom: string,
	edges: readonly Edge[],
	opts: WhyOptions = {},
): WhyTreeResult {
	const traced: TraceResult = trace(symptom, edges);
	if (!traced.ok) return { ok: false, error: traced.error };

	// L'adjacence `caused_by` (du → vers), filtrée aux arêtes valides — la STRUCTURE d'arbre, pas la
	// liste plate de `trace` ; on en garde l'ORDRE déterministe pour des ids stables.
	const adj = new Map<string, string[]>();
	for (const e of edges) {
		if (validate(e) !== null) continue;
		const arr = adj.get(e.from.id);
		if (arr === undefined) adj.set(e.from.id, [e.to.id]);
		else arr.push(e.to.id);
	}

	// Les causes hors-graphe GARDÉES (reproduites) groupées par parent ; les rejetées élaguées.
	const offByParent = new Map<string, OffGraphCause[]>();
	const pruned: string[] = [];
	for (const o of opts.offGraph ?? []) {
		if (o.verdict === "rejected") {
			pruned.push(o.id);
			continue;
		}
		const arr = offByParent.get(o.under);
		if (arr === undefined) offByParent.set(o.under, [o]);
		else arr.push(o);
	}
	pruned.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

	// On déplie l'arbre `caused_by` depuis le symptôme — chaque enfant à un hop plus profond, l'ordre
	// des arêtes préservé pour des ids content-adressés ("w0", "w0.0", …) ; on suit un set `seen` pour
	// ne pas re-déplier (le cycle a déjà été refusé en amont, donc l'arbre est fini).
	const seen = new Set<string>();
	const build = (cause: string, id: string, depth: number): WhyNode => {
		seen.add(cause);
		const children: WhyNode[] = [];
		const next = (adj.get(cause) ?? []).filter((c) => !seen.has(c));
		next.forEach((child, i) => {
			children.push(build(child, `${id}.${i}`, depth + 1));
		});
		// Les causes hors-graphe VÉRIFIÉES greffées sous ce nœud (après les causes du graphe).
		const off = offByParent.get(cause) ?? [];
		off.forEach((o, i) => {
			children.push({
				id: `${id}.${next.length + i}`,
				cause: o.id,
				depth: depth + 1,
				verdict: "reproduced",
				why: o.why,
				leaf: true,
				children: [],
			});
		});
		return {
			id,
			cause,
			depth,
			verdict: "in_graph",
			why: "",
			leaf: children.length === 0,
			children,
		};
	};
	const root = build(symptom, "w0", 0);

	// TERMINAISON OBLIGATOIRE EN MIROIR (la racine → /learn → un miroir d'anti-récurrence). Sans miroir
	// terminal, le WhyTree est REFUSÉ — un pourquoi sans terminaison ne se clôt pas (FK13).
	if (opts.terminal === undefined || opts.terminal.mirrorId.trim() === "") {
		return { ok: false, error: WHYTREE_NO_MIRROR };
	}

	return {
		ok: true,
		root,
		chain: traced.chain,
		terminal: opts.terminal,
		pruned,
	};
}

// ── La projection React Arborist (content-adressée, déterministe) ─────────────

/** La forme `{ id, name, children }` que React Arborist consomme — content-adressée par position. */
export interface ArboristWhyNode {
	readonly id: string;
	readonly name: string;
	readonly cause: string;
	readonly verdict: CauseVerdict;
	readonly depth: number;
	readonly leaf: boolean;
	readonly children?: ArboristWhyNode[];
}

/** L'étiquette FR lisible d'un statut de cause (pour l'arbre). PURE & TOTALE. */
const VERDICT_LABEL_FR: Record<CauseVerdict, string> = {
	in_graph: "dans le graphe",
	reproduced: "reproduite (hors-graphe)",
	rejected: "rejetée",
};

/** L'étiquette FR d'un statut de cause (totalité). */
export function verdictLabel(v: CauseVerdict): string {
	return VERDICT_LABEL_FR[v] ?? v;
}

/**
 * `arboristWhyTree` projette la racine d'un WhyTree vers la forêt React Arborist. Content-adressée par
 * la position dans l'arbre (les ids "w0", "w0.0", … sont déjà déterministes) → même arbre, même forêt.
 * PURE + TOTALE.
 */
export function arboristWhyTree(root: WhyNode): ArboristWhyNode[] {
	const walk = (n: WhyNode): ArboristWhyNode => ({
		id: n.id,
		name: n.cause,
		cause: n.cause,
		verdict: n.verdict,
		depth: n.depth,
		leaf: n.leaf,
		...(n.children.length > 0 ? { children: n.children.map(walk) } : {}),
	});
	return [walk(root)];
}

/** Le compte de nœuds / feuilles / causes hors-graphe d'un WhyTree (le résumé de l'en-tête). PURE & TOTALE. */
export function whyTally(root: WhyNode): {
	nodes: number;
	leaves: number;
	offGraph: number;
	maxDepth: number;
} {
	let nodes = 0;
	let leaves = 0;
	let offGraph = 0;
	let maxDepth = 0;
	const walk = (n: WhyNode): void => {
		nodes++;
		if (n.leaf) leaves++;
		if (n.verdict === "reproduced") offGraph++;
		if (n.depth > maxDepth) maxDepth = n.depth;
		for (const c of n.children) walk(c);
	};
	walk(root);
	return { nodes, leaves, offGraph, maxDepth };
}

// ── Le REGISTRE CLOS des cas d'exemple du WhyTree ────────────────────────────

/** Un cas d'exemple du WhyTree : un symptôme + ses arêtes + son miroir terminal (+ causes hors-graphe). */
export interface WhyCase {
	readonly id: string;
	readonly labelKey: string;
	readonly symptom: string;
	readonly edges: Edge[];
	/** le miroir d'anti-récurrence qui clôt l'arbre (undefined pour le cas « sans miroir terminal »). */
	readonly terminal?: TerminalMirror;
	/** les causes hors-graphe (LLM, vérifiées) à greffer — pour le cas « hors-graphe vérifié ». */
	readonly offGraph?: OffGraphCause[];
	/** le sentinel de refus attendu (undefined si le cas construit un arbre). */
	readonly expectRefusal?: typeof ERR_CYCLE | typeof WHYTREE_NO_MIRROR;
}

const ref = (id: string): Ref => ({ id, version: "v1" });

/**
 * Le registre CLOS des cas d'exemple. RÉUTILISE les arêtes `caused_by` de FK12 (CAUSED_BY_CASES) :
 *   - `chain` — le symptôme checkout-accept remonte à la migration racine, clos par un miroir ;
 *   - `off-graph` — la même chaîne + une cause HORS-graphe reproduite (gardée) + une rejetée (élaguée) ;
 *   - `cyclic` — la variante cyclique → refus ERR_CYCLE ;
 *   - `no-mirror` — la chaîne SANS miroir terminal → refus WHYTREE_NO_MIRROR.
 * Aucune règle inventée : ce ne sont que des entrées d'exemple pour la remontée déterministe.
 */
export const WHY_CASES: readonly WhyCase[] = [
	{
		id: "chain",
		labelKey: "caseChain",
		symptom: "checkout-accept",
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("createOrder"), to: ref("authzPolicy") },
			{ from: ref("Order"), to: ref("add_total_col") },
		],
		terminal: {
			mirrorId: "mirror-anti-recurrence-total-col",
			covers: "add_total_col",
		},
	},
	{
		id: "off-graph",
		labelKey: "caseOffGraph",
		symptom: "checkout-accept",
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("add_total_col") },
		],
		offGraph: [
			{
				id: "pgx-pool-exhausted",
				why: "Le pool pgx était saturé sous charge — reproduit en rejouant la rafale.",
				verdict: "reproduced",
				under: "createOrder",
			},
			{
				id: "moon-phase",
				why: "« La phase de la lune » — NON reproductible, rejetée.",
				verdict: "rejected",
				under: "createOrder",
			},
		],
		terminal: {
			mirrorId: "mirror-anti-recurrence-total-col",
			covers: "add_total_col",
		},
	},
	{
		id: "cyclic",
		labelKey: "caseCyclic",
		symptom: "checkout-accept",
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("Order") },
			{ from: ref("Order"), to: ref("createOrder") },
		],
		terminal: { mirrorId: "mirror-x", covers: "Order" },
		expectRefusal: ERR_CYCLE,
	},
	{
		id: "no-mirror",
		labelKey: "caseNoMirror",
		symptom: "checkout-accept",
		edges: [
			{ from: ref("checkout-accept"), to: ref("createOrder") },
			{ from: ref("createOrder"), to: ref("add_total_col") },
		],
		// pas de `terminal` → REFUS WHYTREE_NO_MIRROR.
		expectRefusal: WHYTREE_NO_MIRROR,
	},
];

/** Les ids de tous les cas d'exemple connus. */
export function whyCaseIds(): string[] {
	return WHY_CASES.map((c) => c.id);
}

/** Résout un id de cas d'exemple (totalité). */
export function whyCaseById(id: string): WhyCase | undefined {
	return WHY_CASES.find((c) => c.id === id);
}

/** Construit le WhyTree d'un cas d'exemple (la porte unifiée de l'écran). PURE & TOTALE. */
export function caseWhyTree(c: WhyCase): WhyTreeResult {
	return whyTree(c.symptom, c.edges, {
		terminal: c.terminal,
		offGraph: c.offGraph,
	});
}

/** Le slug d'étape canonique de WB2-19 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-19-why";
