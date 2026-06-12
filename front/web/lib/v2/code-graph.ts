/**
 * WB2-26 — le TWIN PUR du GRAPHE DE CONNAISSANCE DU CODE (ADR 0056 — graphify + Bazel).
 *
 * LA DESCENTE FRACTALE CONTINUE SOUS LA FEUILLE (§49 prolongé, ADR 0055 → ADR 0056) :
 * requirement (chemin dans l'arbre `composes`) → fichier → classe → fonction →
 * VERSION (hash content-adressé du corps) → LIGNES (span dans le fichier). Le code
 * lui-même devient un graphe de connaissance : des nœuds de code (contenance par
 * `parentId`, comme l'arbre composes) + des arêtes `calls`/`imports` taguées par
 * CONFIANCE (`extracted` = prouvée par l'AST ; `inferred` = résolue inter-fichiers) —
 * le tag de confiance vient de graphify.
 *
 * « QUOI TOUCHE QUOI » : impactOf est la clôture des DÉPENDANTS INVERSES (le `rdeps`
 * de Bazel) = la vague de rouge (S22) au grain code — modifier un symbole rougit ses
 * appelants, transitivement, plus les conteneurs (le fichier d'un impacté est touché).
 * « SI ON LA MODIFIE, QUEL IMPACT » : diffGraphs compare deux instantanés extraits du
 * source réel et rend les symboles changés + leur vague. actionKey est la clé
 * d'invalidation à la Bazel : hash(mon corps + les versions de mes deps DIRECTES) —
 * toute modification, même profonde, invalide finement, jamais globalement.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : tout est PUR & TOTAL — pas d'horloge, pas
 * d'aléa, pas d'E/S, pas de LLM, pas d'import `typescript` (client-safe ; l'extraction
 * AST vit dans lib/v2/code-extract.ts, côté serveur/test). L'impact est CALCULÉ (BFS
 * ordonné, déterministe même sur cycles), jamais estimé. Le miroir lib/v2/
 * code-graph.test.ts épingle : validation fail-closed, impact total/membre/déterministe/
 * terminant sur cycles, profondeur de vague, clé Bazel (corps + deps directes), diff
 * (identique → vide ; corps changé → vague des appelants), ancrage requirement→code,
 * god nodes.
 *
 * RÉUTILISATION : l'ancrage requirement→code s'appuie sur l'arbre composes (lib/v2/
 * composition — nodeByPath) ; la forme « liste plate + parentId » reprend kernel-tree.
 * LE MUR (§2) : ce module PROJETTE une lecture du code ; il n'écrit aucune vérité.
 */

import { nodeByPath } from "./composition";
import type { KernelNode } from "./kernel-tree";

/** Le GENRE d'un nœud de code — le grain de la descente sous la feuille. Jeu clos. */
export type CodeKind = "file" | "class" | "function" | "method";

/** La CONFIANCE d'une arête (graphify) : prouvée par l'AST, ou résolue inter-fichiers. */
export type EdgeConfidence = "extracted" | "inferred";

/** Un NŒUD de code : identité content-adressée, position (fichier + lignes), version. */
export interface CodeNode {
	/** L'id content-adressé (stable pour un même fichier#nom). */
	readonly id: string;
	readonly kind: CodeKind;
	/** Le nom du symbole (verbatim du source). */
	readonly name: string;
	/** Le fichier porteur. */
	readonly file: string;
	/** Le span de LIGNES (1-based, inclusif) — « quelle ligne dans le fichier ». */
	readonly span: { readonly start: number; readonly end: number };
	/** La VERSION content-adressée du corps — change ssi le texte du symbole change. */
	readonly version: string;
	/** La contenance (method→class→file), même forme que l'arbre composes. */
	readonly parentId: string | null;
}

/** Une ARÊTE de dépendance : un symbole en appelle/importe un autre. */
export interface CodeEdge {
	readonly from: string;
	readonly to: string;
	readonly kind: "calls" | "imports";
	readonly confidence: EdgeConfidence;
}

/** Un élément de la VAGUE D'IMPACT : le nœud touché + sa profondeur (1 = direct). */
export interface ImpactItem {
	readonly id: string;
	readonly depth: number;
}

/** Le DIFF de deux instantanés : quoi a changé, et la vague de rouge résultante. */
export interface GraphDiff {
	readonly changed: readonly string[];
	readonly added: readonly string[];
	readonly removed: readonly string[];
	readonly redWave: readonly ImpactItem[];
}

/** Une suggestion d'ANCRAGE requirement → symbole de code (score lexical, déterministe). */
export interface AnchorSuggestion {
	readonly nodeId: string;
	readonly name: string;
	readonly file: string;
	readonly score: number;
}

/** Un GOD NODE (graphify) : un symbole à très fort degré entrant. */
export interface GodNode {
	readonly id: string;
	readonly name: string;
	readonly inDegree: number;
}

export type CodeGraphError =
	| "duplicate_id"
	| "empty_id"
	| "orphan_node"
	| "dangling_edge";

/**
 * VALIDE un graphe de code — fail-closed, même style que validateComposes (WB2-04) :
 * ids non vides et uniques, parentId résolu, arêtes non pendantes. PURE & TOTALE.
 */
export function validateCodeGraph(
	nodes: readonly CodeNode[],
	edges: readonly CodeEdge[],
): CodeGraphError[] {
	const errors: CodeGraphError[] = [];
	const ids = new Set<string>();
	let dup = false;
	let empty = false;
	for (const n of nodes) {
		if (n.id.trim() === "") empty = true;
		else if (ids.has(n.id)) dup = true;
		else ids.add(n.id);
	}
	if (empty) errors.push("empty_id");
	if (dup) errors.push("duplicate_id");
	if (nodes.some((n) => n.parentId !== null && !ids.has(n.parentId)))
		errors.push("orphan_node");
	if (edges.some((e) => !ids.has(e.from) || !ids.has(e.to)))
		errors.push("dangling_edge");
	return errors;
}

/** L'index des DÉPENDANTS INVERSES (qui pointe VERS moi) — le `rdeps` de Bazel. */
function reverseIndex(edges: readonly CodeEdge[]): Map<string, string[]> {
	const idx = new Map<string, string[]>();
	for (const e of edges) {
		const bucket = idx.get(e.to);
		if (bucket === undefined) idx.set(e.to, [e.from]);
		else bucket.push(e.from);
	}
	for (const bucket of idx.values()) bucket.sort();
	return idx;
}

/**
 * « QUOI TOUCHE QUOI » — la VAGUE DE ROUGE au grain code (S22 ; le `rdeps` transitif
 * de Bazel). PURE & TOTALE & DÉTERMINISTE, terminaison garantie sur cycles (BFS avec
 * ensemble vu) :
 *   - les APPELANTS/IMPORTEURS du symbole modifié, transitivement (profondeur 1, 2…) ;
 *   - plus les CONTENEURS (parentId) du symbole et de chaque impacté — le fichier qui
 *     contient une fonction rougie est touché lui aussi ;
 *   - JAMAIS le symbole lui-même (il est la cause, pas l'impact).
 * L'ordre est canonique : profondeur croissante puis id (stable).
 */
export function impactOf(
	nodes: readonly CodeNode[],
	edges: readonly CodeEdge[],
	id: string,
): ImpactItem[] {
	const byId = new Map(nodes.map((n) => [n.id, n] as const));
	if (!byId.has(id)) return [];
	const rdeps = reverseIndex(edges);
	const depthOf = new Map<string, number>();

	/** Remonte la contenance d'un nœud touché : ses conteneurs prennent sa profondeur. */
	const liftContainers = (fromId: string, depth: number) => {
		let cur = byId.get(fromId)?.parentId ?? null;
		let hops = 0;
		while (cur !== null && hops <= nodes.length) {
			if (cur !== id && !depthOf.has(cur)) depthOf.set(cur, depth);
			cur = byId.get(cur)?.parentId ?? null;
			hops++;
		}
	};

	// Le fichier/la classe contenant le symbole MODIFIÉ sont touchés (profondeur 1).
	liftContainers(id, 1);

	let frontier = [id];
	let depth = 0;
	const seen = new Set<string>([id]);
	while (frontier.length > 0) {
		depth++;
		const next: string[] = [];
		for (const cur of frontier) {
			for (const caller of rdeps.get(cur) ?? []) {
				if (seen.has(caller)) continue;
				seen.add(caller);
				depthOf.set(caller, Math.min(depthOf.get(caller) ?? depth, depth));
				liftContainers(caller, depth);
				next.push(caller);
			}
		}
		frontier = next;
	}

	return [...depthOf.entries()]
		.map(([nid, d]) => ({ id: nid, depth: d }))
		.sort((a, b) =>
			a.depth !== b.depth ? a.depth - b.depth : a.id < b.id ? -1 : 1,
		);
}

/** FNV-1a 32 bits (hex) — le schéma content-adressé commun aux twins V2. */
function fnv1a(canon: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * La CLÉ D'ACTION à la Bazel : hash(ma version + les versions TRIÉES de mes dépendances
 * DIRECTES). Mon corps change → ma clé change ; une dep directe change → ma clé change ;
 * un nœud sans lien avec moi change → ma clé est STABLE. C'est l'invalidation FINE :
 * jamais « tout rebuild », toujours « exactement ce qui dépend ». PURE & TOTALE.
 */
export function actionKey(
	nodes: readonly CodeNode[],
	edges: readonly CodeEdge[],
	id: string,
): string {
	const byId = new Map(nodes.map((n) => [n.id, n] as const));
	const self = byId.get(id);
	if (self === undefined) return fnv1a("");
	const depVersions = edges
		.filter((e) => e.from === id)
		.map((e) => byId.get(e.to)?.version ?? "")
		.sort();
	return fnv1a([self.version, ...depVersions].join("|"));
}

/**
 * « SI ON LA MODIFIE, QUEL IMPACT » — le DIFF de deux instantanés extraits du source :
 * changed (même id, version différente), added, removed (triés, stables), et la VAGUE
 * DE ROUGE = l'union des impacts des changés/ajoutés (sur l'après) et des supprimés
 * (sur l'avant), profondeur minimale conservée. PURE & TOTALE & DÉTERMINISTE.
 */
export function diffGraphs(
	beforeNodes: readonly CodeNode[],
	beforeEdges: readonly CodeEdge[],
	afterNodes: readonly CodeNode[],
	afterEdges: readonly CodeEdge[],
): GraphDiff {
	const before = new Map(beforeNodes.map((n) => [n.id, n] as const));
	const after = new Map(afterNodes.map((n) => [n.id, n] as const));

	const changed: string[] = [];
	const added: string[] = [];
	const removed: string[] = [];
	for (const [nid, n] of after) {
		const prev = before.get(nid);
		if (prev === undefined) added.push(nid);
		else if (prev.version !== n.version) changed.push(nid);
	}
	for (const nid of before.keys()) if (!after.has(nid)) removed.push(nid);
	changed.sort();
	added.sort();
	removed.sort();

	const depthOf = new Map<string, number>();
	const absorb = (items: readonly ImpactItem[]) => {
		for (const it of items)
			depthOf.set(it.id, Math.min(depthOf.get(it.id) ?? it.depth, it.depth));
	};
	for (const nid of [...changed, ...added])
		absorb(impactOf(afterNodes, afterEdges, nid));
	for (const nid of removed) absorb(impactOf(beforeNodes, beforeEdges, nid));

	const redWave = [...depthOf.entries()]
		.map(([nid, d]) => ({ id: nid, depth: d }))
		.sort((a, b) =>
			a.depth !== b.depth ? a.depth - b.depth : a.id < b.id ? -1 : 1,
		);

	return { changed, added, removed, redWave };
}

/**
 * La CHAÎNE DE CONTENANCE d'un symbole, racine → lui (fichier → classe → fonction) —
 * le bas de la descente « requirement → … → ligne ». PURE & TOTALE (id inconnu → []).
 */
export function codePath(nodes: readonly CodeNode[], id: string): CodeNode[] {
	const byId = new Map(nodes.map((n) => [n.id, n] as const));
	const chain: CodeNode[] = [];
	let cur = byId.get(id);
	let hops = 0;
	while (cur !== undefined && hops <= nodes.length) {
		chain.unshift(cur);
		cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
		hops++;
	}
	return hops > nodes.length ? [] : chain;
}

/** Plie un texte en TOKENS canoniques : camelCase scindé, accents pliés, ≥3 chars. */
function tokensOf(text: string): Set<string> {
	return new Set(
		text
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length >= 3),
	);
}

/**
 * SUGGÈRE l'ancrage requirement → code : « tel requirement, ça fait telle classe,
 * telle fonction ». Score lexical DÉTERMINISTE (même esprit que placeIntent, ADR 0055) :
 * +2 par token commun avec le NOM du symbole (camelCase scindé), +1 par token commun
 * avec son CHEMIN de fichier ; les tokens viennent du chemin requirement + du libellé
 * du nœud composes résolu (l'arbre reste la source). Classement : score ↓ puis id ↑.
 * Seuls les scores > 0 sont proposés ; l'HUMAIN tranche (§49). PURE & TOTALE.
 */
export function anchorSymbols(
	tree: readonly KernelNode[],
	nodes: readonly CodeNode[],
	edges: readonly CodeEdge[],
	requirementPath: string,
): AnchorSuggestion[] {
	void edges;
	const reqTokens = tokensOf(requirementPath.replace(/[/-]/g, " "));
	const treeNode = nodeByPath(tree, requirementPath);
	if (treeNode !== null)
		for (const t of tokensOf(treeNode.label)) reqTokens.add(t);

	const ranked: AnchorSuggestion[] = [];
	for (const n of nodes) {
		if (n.kind === "file") continue;
		const nameTokens = tokensOf(n.name);
		const fileTokens = tokensOf(n.file.replace(/[/.]/g, " "));
		let score = 0;
		for (const t of reqTokens) {
			if (nameTokens.has(t)) score += 2;
			if (fileTokens.has(t)) score += 1;
		}
		if (score > 0)
			ranked.push({ nodeId: n.id, name: n.name, file: n.file, score });
	}
	return ranked.sort((a, b) =>
		a.score !== b.score ? b.score - a.score : a.nodeId < b.nodeId ? -1 : 1,
	);
}

/**
 * Les GOD NODES (graphify) : les k symboles au plus fort DEGRÉ ENTRANT — les points
 * de couplage du code, là où une modification fait la plus grande vague. PURE & TOTALE,
 * départage stable par id.
 */
export function godNodes(
	nodes: readonly CodeNode[],
	edges: readonly CodeEdge[],
	k: number,
): GodNode[] {
	const inDeg = new Map<string, number>();
	for (const e of edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
	return nodes
		.map((n) => ({ id: n.id, name: n.name, inDegree: inDeg.get(n.id) ?? 0 }))
		.sort((a, b) =>
			a.inDegree !== b.inDegree
				? b.inDegree - a.inDegree
				: a.id < b.id
					? -1
					: 1,
		)
		.slice(0, Math.max(0, Math.floor(k)));
}
