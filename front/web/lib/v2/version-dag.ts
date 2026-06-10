/**
 * WB2-07 — le TWIN PUR du VERSION DAG (S24, KRD §120-§125) : l'espace des versions est un DAG, pas
 * une ligne. Les NŒUDS = des versions (phases stables), les ARÊTES = des ChangeSets (S20). L'identité
 * d'un nœud = le HASH de son corps canonique (content-addressing, repris de S01). Le DAG est
 * APPEND-ONLY : aucun mouvement ne détruit jamais un nœud ni une arête — une ligne abandonnée RESTE
 * dans le DAG (un stepping-stone potentiel). Trois mouvements §121 :
 *   - branch            : ouvre une ligne ALTERNATIVE de vérité depuis une phase stable ;
 *   - checkout_ancestor : RAMÈNE la tête (head) sur un ancêtre — un mouvement ARRIÈRE, la ligne
 *                         abandonnée n'est ni détachée ni supprimée, seul le head bouge ;
 *   - rebranch          : ouvre une NOUVELLE ligne depuis l'ancêtre re-checkout (la branche d'une
 *                         branche) — le cas-clé : l'ancienne ligne n'est jamais détruite.
 *
 * STRATIFICATION (la ligne de flottaison §124) : `above` = branches de vérité humaine ; `below` =
 * branches évolutionnaires. Dessinée en deux bandes par l'écran.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : composer le DAG, le topo-trier, computer le hash, l'atteignabilité
 * sont des FONCTIONS PURES & TOTALES — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Même séquence
 * → même DAG, même tri topologique, même hash. Le miroir de reproductibilité (version-dag.test.ts,
 * fast-check) épingle : le DAG est ACYCLIQUE, le hash STABLE (même corps → même id), l'append-only
 * (les mouvements ne font que CROÎTRE), le tri topologique cohérent (un parent précède son enfant).
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture du DAG (read-only sous le mur) ; il n'écrit
 * aucune vérité. Les mouvements ici sont des transformations PURES en mémoire (le twin de S24) ; les
 * écritures réelles passent par le CLI aidos via le MCP `dag` (SELECT-only pour l'agent). OpenQuestion
 * documentée : synthétique (la fixture canonique §120) tant que le store ne sert pas le DAG live —
 * ne bloque pas (forward-dependency vers WB2/SDK live).
 */

/** La strate d'un nœud relativement à la ligne de flottaison (§124). Jeu CLOS. */
export type Stratum = "above" | "below";

export const STRATA: readonly Stratum[] = ["above", "below"] as const;

export function isStratum(s: string): s is Stratum {
	return (STRATA as readonly string[]).includes(s);
}

/** Un NŒUD du DAG = une version (phase stable). `id` = hash du corps canonique. */
export interface DagNode {
	/** L'identité content-addressée = hash du corps canonique (jamais un compteur). */
	readonly id: string;
	/** Le libellé humain de la version (ex. « v1 », « tva-eu-variant »). */
	readonly label: string;
	/** Les parents (un DAG : un nœud peut avoir ≥1 parents). Ordonnés, déterministes. */
	readonly parentIds: readonly string[];
	/** La tête courante ? (mutable — un mouvement la déplace, jamais ne supprime). */
	readonly head: boolean;
	/** La strate (above = vérité humaine ; below = évolutionnaire) — §124. */
	readonly stratum: Stratum;
}

/** Une ARÊTE du DAG = un ChangeSet (S20) reliant from → to. */
export interface DagEdge {
	readonly from: string;
	readonly to: string;
	/** L'id du ChangeSet (changesets.changeset.id) — la relation, jamais une copie. */
	readonly changeset: string;
}

/** Le DAG de versions : un ensemble ordonné de nœuds + d'arêtes. */
export interface VersionDag {
	readonly nodes: readonly DagNode[];
	readonly edges: readonly DagEdge[];
}

/** Le diagnostic d'un DAG invalide (hors des jeux clos / hors append-only / hors DAG). */
export type DagError =
	| "empty_node_id"
	| "duplicate_node_id"
	| "stratum_unknown"
	| "dangling_parent"
	| "dangling_edge"
	| "cycle"
	| "no_head";

export type DagResult =
	| { ok: true; dag: VersionDag }
	| { ok: false; errors: DagError[] };

/**
 * HASH déterministe d'un corps de version (content-addressing — repris de S01). PURE & TOTALE :
 * djb2 sur le corps canonique (label + parents triés + strate). Même corps → même hash. AUCUN aléa,
 * AUCUNE horloge. Le préfixe `v:` marque l'espace de noms (pas confondu avec un autre hash).
 */
export function versionHash(
	label: string,
	parentIds: readonly string[],
	stratum: Stratum,
): string {
	// Corps canonique : parents TRIÉS (l'ordre d'entrée ne change pas l'identité).
	const canonical = JSON.stringify({
		label,
		parents: [...parentIds].sort(),
		stratum,
	});
	let h = 5381;
	for (let i = 0; i < canonical.length; i++) {
		h = ((h << 5) + h + canonical.charCodeAt(i)) >>> 0;
	}
	return `v:${h.toString(16).padStart(8, "0")}`;
}

/**
 * VALIDE un DAG : ids non vides, aucun dupliqué, strates dans le jeu clos, aucun parent pendant,
 * aucune arête pendante, ACYCLIQUE, ≥1 tête. PURE & TOTALE — même DAG → mêmes erreurs (ordonnées).
 */
export function validateDag(dag: VersionDag): DagError[] {
	const errors: DagError[] = [];
	const ids = new Set<string>();
	let hasEmpty = false;
	let hasDuplicate = false;
	let hasBadStratum = false;
	for (const n of dag.nodes) {
		if (n.id.trim() === "") hasEmpty = true;
		else if (ids.has(n.id)) hasDuplicate = true;
		else ids.add(n.id);
		if (!isStratum(n.stratum)) hasBadStratum = true;
	}
	if (hasEmpty) errors.push("empty_node_id");
	if (hasDuplicate) errors.push("duplicate_node_id");
	if (hasBadStratum) errors.push("stratum_unknown");

	// Parents pendants : chaque parentId référence un nœud existant.
	const danglingParent = dag.nodes.some((n) =>
		n.parentIds.some((p) => !ids.has(p)),
	);
	if (danglingParent) errors.push("dangling_parent");

	// Arêtes pendantes : from/to référencent des nœuds existants.
	const danglingEdge = dag.edges.some(
		(e) => !ids.has(e.from) || !ids.has(e.to),
	);
	if (danglingEdge) errors.push("dangling_edge");

	// Acyclicité : un tri topologique réussit ssi le graphe (parentIds) est un DAG.
	if (!danglingParent && hasCycle(dag.nodes)) errors.push("cycle");

	// ≥1 tête (un DAG actif a au moins une tête).
	if (dag.nodes.length > 0 && !dag.nodes.some((n) => n.head)) {
		errors.push("no_head");
	}

	return errors;
}

/** Détecte un cycle via le graphe parent→enfant (Kahn : reste-t-il des nœuds non sortis ?). */
function hasCycle(nodes: readonly DagNode[]): boolean {
	const indeg = new Map<string, number>();
	const children = new Map<string, string[]>();
	for (const n of nodes) {
		if (!indeg.has(n.id)) indeg.set(n.id, 0);
	}
	for (const n of nodes) {
		for (const p of n.parentIds) {
			// arête parent p → enfant n.id
			indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
			const arr = children.get(p) ?? [];
			arr.push(n.id);
			children.set(p, arr);
		}
	}
	// File initiale : indegree 0, ORDRE STABLE (l'ordre des nœuds d'entrée).
	const queue = nodes
		.filter((n) => (indeg.get(n.id) ?? 0) === 0)
		.map((n) => n.id);
	let visited = 0;
	while (queue.length > 0) {
		const id = queue.shift() as string;
		visited++;
		for (const c of children.get(id) ?? []) {
			const d = (indeg.get(c) ?? 0) - 1;
			indeg.set(c, d);
			if (d === 0) queue.push(c);
		}
	}
	return visited !== nodes.length;
}

/**
 * TRI TOPOLOGIQUE du DAG (Kahn, tie-break déterministe = ordre d'entrée des nœuds). PURE & TOTALE.
 * Un parent précède TOUJOURS son enfant. Sur un cycle, renvoie [] (jamais un ordre arbitraire).
 * C'est l'ordre dans lequel l'écran pose les versions (les racines en haut).
 */
export function topoSort(dag: VersionDag): DagNode[] {
	const byId = new Map(dag.nodes.map((n) => [n.id, n] as const));
	const indeg = new Map<string, number>();
	const children = new Map<string, string[]>();
	for (const n of dag.nodes) indeg.set(n.id, 0);
	for (const n of dag.nodes) {
		for (const p of n.parentIds) {
			if (!byId.has(p)) continue; // parent pendant : ignoré ici (validateDag le signale)
			indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
			const arr = children.get(p) ?? [];
			arr.push(n.id);
			children.set(p, arr);
		}
	}
	const queue = dag.nodes
		.filter((n) => (indeg.get(n.id) ?? 0) === 0)
		.map((n) => n.id);
	const out: DagNode[] = [];
	while (queue.length > 0) {
		const id = queue.shift() as string;
		const node = byId.get(id);
		if (node) out.push(node);
		// Enfants dans l'ordre d'insertion (déterministe).
		for (const c of children.get(id) ?? []) {
			const d = (indeg.get(c) ?? 0) - 1;
			indeg.set(c, d);
			if (d === 0) queue.push(c);
		}
	}
	// Cycle : on ne renvoie que ce qui a pu sortir (caller doit valider d'abord).
	return out;
}

/** Tous les ANCÊTRES d'un nœud (parents transitifs), ordonnés déterministe. PURE. */
export function ancestors(dag: VersionDag, nodeId: string): string[] {
	const byId = new Map(dag.nodes.map((n) => [n.id, n] as const));
	const seen = new Set<string>();
	const stack = [...(byId.get(nodeId)?.parentIds ?? [])];
	while (stack.length > 0) {
		const id = stack.pop() as string;
		if (seen.has(id)) continue;
		seen.add(id);
		for (const p of byId.get(id)?.parentIds ?? []) stack.push(p);
	}
	return [...seen].sort();
}

/** `from` atteint-il `to` en suivant les arêtes parent→enfant ? PURE. Irréflexif sur soi. */
export function isReachable(
	dag: VersionDag,
	from: string,
	to: string,
): boolean {
	if (from === to) return false;
	return ancestors(dag, to).includes(from);
}

/** Les TÊTES du DAG (les nœuds head:true) — plusieurs lignes parallèles possibles (§125). PURE. */
export function heads(dag: VersionDag): DagNode[] {
	return dag.nodes.filter((n) => n.head);
}

/**
 * BRANCH (§121) — ouvre une ligne ALTERNATIVE depuis une phase stable. APPEND-ONLY : ajoute un nœud
 * (head:true) + une arête (ChangeSet), déplace head depuis l'ancien head, NE SUPPRIME RIEN. PURE.
 * Le nouvel id = hash du corps canonique (content-addressing). La strate est héritée du parent.
 */
export function branch(
	dag: VersionDag,
	fromId: string,
	label: string,
	changeset: string,
): VersionDag {
	const parent = dag.nodes.find((n) => n.id === fromId);
	if (!parent) return dag; // phase inconnue : DAG inchangé (totalité)
	const stratum = parent.stratum;
	const id = versionHash(label, [fromId], stratum);
	if (dag.nodes.some((n) => n.id === id)) return dag; // idempotent (même corps → même id)
	const newNode: DagNode = {
		id,
		label,
		parentIds: [fromId],
		head: true,
		stratum,
	};
	// La tête bouge sur la nouvelle ligne ; l'ancienne ligne RESTE (head:false), jamais supprimée.
	return {
		nodes: [...dag.nodes.map((n) => ({ ...n, head: false })), newNode],
		edges: [...dag.edges, { from: fromId, to: id, changeset }],
	};
}

/**
 * CHECKOUT_ANCESTOR (§120/§121) — RAMÈNE la tête sur un ancêtre. Mouvement ARRIÈRE : un simple
 * head-flag move. La ligne abandonnée RESTE intégralement (aucun nœud/arête supprimé). PURE & TOTALE.
 */
export function checkoutAncestor(dag: VersionDag, phaseId: string): VersionDag {
	if (!dag.nodes.some((n) => n.id === phaseId)) return dag; // phase inconnue : inchangé
	return {
		nodes: dag.nodes.map((n) => ({ ...n, head: n.id === phaseId })),
		edges: dag.edges, // aucune arête touchée
	};
}

/**
 * REBRANCH (§121) — la branche d'une branche : ouvre une NOUVELLE ligne depuis l'ancêtre re-checkout.
 * Sémantiquement = un branch depuis l'ancêtre ; le cas-clé est que l'ancienne ligne n'est jamais
 * détruite (append-only). PURE & TOTALE.
 */
export function rebranch(
	dag: VersionDag,
	fromId: string,
	label: string,
	changeset: string,
): VersionDag {
	return branch(dag, fromId, label, changeset);
}

/**
 * Construit le DAG CANONIQUE §120 SYNTHÉTIQUE (déterministe, content-addressé) pour peupler l'écran
 * tant que le store ne sert pas le DAG live (OpenQuestion documentée, ne bloque pas). PURE & TOTALE :
 * v0 → v1 → v2 (la ligne principale), branch w1 off v1 (above), branch g1 off v1 en strate `below`
 * (évolutionnaire), puis checkout-ancestor sur v1 + rebranch v2a off v1. Aucun aléa, aucune horloge.
 * Les ids sont des hashes ; les `label` restent lisibles (v0,v1,v2,w1,g1,v2a) pour l'écran et l'e2e.
 */
export function syntheticDag(): {
	dag: VersionDag;
	labelToId: Record<string, string>;
} {
	const labelToId: Record<string, string> = {};
	const id = (label: string, parents: string[], stratum: Stratum) => {
		const h = versionHash(label, parents, stratum);
		labelToId[label] = h;
		return h;
	};

	const v0 = id("v0", [], "above");
	const v1 = id("v1", [v0], "above");
	const v2 = id("v2", [v1], "above");
	const w1 = id("w1", [v1], "above"); // branche alternative de vérité humaine
	const g1 = id("g1", [v1], "below"); // branche évolutionnaire (sous la ligne de flottaison)
	const v2a = id("v2a", [v1], "above"); // rebranch off v1 (la branche d'une branche)

	const mk = (
		label: string,
		parents: string[],
		head: boolean,
		stratum: Stratum,
	): DagNode => ({
		id: labelToId[label],
		label,
		parentIds: parents,
		head,
		stratum,
	});

	const dag: VersionDag = {
		nodes: [
			mk("v0", [], false, "above"),
			mk("v1", [v0], true, "above"), // la tête courante (after checkout_ancestor v1)
			mk("v2", [v1], false, "above"), // ligne abandonnée — PRÉSENTE, jamais détruite
			mk("w1", [v1], false, "above"),
			mk("g1", [v1], false, "below"),
			mk("v2a", [v1], false, "above"),
		],
		edges: [
			{ from: v0, to: v1, changeset: "cs-0001" },
			{ from: v1, to: v2, changeset: "cs-0002" },
			{ from: v1, to: w1, changeset: "cs-0003" },
			{ from: v1, to: g1, changeset: "cs-0004" },
			{ from: v1, to: v2a, changeset: "cs-0005" },
		],
	};
	return { dag, labelToId };
}
