/**
 * WB2-08 — le TWIN PUR des SIX LIENS (KRD §17/§41) entre kernels, rendus par l'écran /v2/liens.
 *
 * Un kernel ne flotte jamais seul : il est RELIÉ aux autres par six familles de liens TYPÉS, et
 * chaque lien pointe une VERSION (`id@version`), JAMAIS une identité nue — c'est tout l'enjeu §41 :
 * quand la tête de la cible bouge, le lien pinné à l'ancienne version devient PÉRIMÉ (la vague de
 * rouge §42). Les six familles (le jeu CLOS, repris de S17 `lib/links.ts`) :
 *   - `composes`     (verticaux)     — un niveau N compose un niveau N+1 (la descente §23) ;
 *   - `depends_on`   (horizontaux)   — un contrat entre cellules (Pact §49) ;
 *   - `supersedes`   (généalogiques) — une version remplace une version antérieure (le DAG §120) ;
 *   - `provenance`   (origine)       — d'où vient une vérité (idée/incident, §27/§43) ;
 *   - `triggers_binds` (control)     — un contrôle déclenche, une action lie une opération (S11) ;
 *   - `mirrors`      (paires-miroir) — une vérité ↔ son miroir (la paire bicéphale §17/S06).
 *
 * Le mapping vers le jeu canonique S17 (`lib/links.ts` — la SOURCE) est explicite (kindToCanon) :
 * `composes→projects_to`, `depends_on→contracts_with`, `supersedes→derives_from`,
 * `provenance→derives_from`, `triggers_binds→triggers`+`binds`, `mirrors→mirrors`. Les libellés §17
 * (verticaux/horizontaux/généalogiques…) restent LISIBLES ; le jeu reste CLOS.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : construire le graphe, le filtrer par type, valider le
 * pinning sont des FONCTIONS PURES & TOTALES — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM.
 * Même entrée → même graphe, même filtre. Le miroir de reproductibilité (links.test.ts, fast-check)
 * épingle : TOUT lien pointe une version (jamais une identité nue), le filtre par type est un
 * sous-ensemble exact, `validate` accepte ssi (kind ∈ jeu clos ∧ from,to pinnés), déterminisme.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture des liens (read-only sous le mur) ; il
 * n'écrit aucune vérité. Synthétique (fixture canonique) tant que le store ne sert pas les liens
 * live — OpenQuestion documentée, ne bloque pas (forward-dependency vers le SDK live).
 */

/** Les six FAMILLES de liens §17 (le jeu CLOS, libellés lisibles côté Workbench V2). */
export const LINK_KINDS = [
	"composes",
	"depends_on",
	"supersedes",
	"provenance",
	"triggers_binds",
	"mirrors",
] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export function isKnownKind(k: string): k is LinkKind {
	return (LINK_KINDS as readonly string[]).includes(k);
}

/**
 * Le mapping vers le jeu CANONIQUE S17 (`lib/links.ts`) : les familles lisibles V2 sont des ALIAS
 * du jeu clos canonique. Une famille peut mapper plusieurs kinds canoniques (triggers_binds). PURE.
 */
const KIND_TO_CANON: Record<LinkKind, readonly string[]> = {
	composes: ["projects_to"],
	depends_on: ["contracts_with"],
	supersedes: ["derives_from"],
	provenance: ["derives_from"],
	triggers_binds: ["triggers", "binds"],
	mirrors: ["mirrors"],
};

export function kindToCanon(k: LinkKind): readonly string[] {
	return KIND_TO_CANON[k];
}

/** Une RÉFÉRENCE PINNÉE : un id de kernel PLUS la version concrète qu'il pointe (`id@version`). */
export interface Ref {
	readonly id: string;
	readonly version: string;
}

/** Un LIEN §17 : une famille, un `from` (kernel consommateur) et un `to` (cible PINNÉE). */
export interface Link {
	readonly kind: string;
	readonly from: Ref;
	readonly to: Ref;
}

/** Le graphe des liens : nœuds = kernels (id@version), arêtes = liens typés. */
export interface LinkGraph {
	readonly nodes: readonly Ref[];
	readonly links: readonly Link[];
}

/** isPinned — id ET version non vides (une identité NUE n'est pas une cible valide §41). */
export function isPinned(r: Ref): boolean {
	return r.id !== "" && r.version !== "";
}

/** refString — la forme canonique « id@version ». PURE & TOTALE. */
export function refString(r: Ref): string {
	return `${r.id}@${r.version}`;
}

/**
 * validate — le garde de forme PUR (miroir de S17 `links.validate`) : kind ∈ le jeu clos ; `from`
 * et `to` sont des refs PINNÉES `id@version` (un `to` non pinné est lui-même un monstre §41).
 * Renvoie une chaîne d'erreur non vide si invalide, « » si valide. PURE & TOTALE.
 */
export function validate(l: Link): string {
	if (!isKnownKind(l.kind)) return `famille de lien inconnue : ${l.kind}`;
	if (!isPinned(l.from))
		return `from n'est pas une ref pinnée id@version : ${refString(l.from)}`;
	if (!isPinned(l.to))
		return `to n'est pas pinné (id@version requis) : ${refString(l.to)}`;
	return "";
}

/** Le graphe est-il TOTALEMENT pinné ? (tout lien pointe une version, jamais une identité). PURE. */
export function allLinksPinned(graph: LinkGraph): boolean {
	return graph.links.every((l) => isPinned(l.from) && isPinned(l.to));
}

/**
 * FILTRE le graphe par famille de lien : renvoie un sous-graphe avec UNIQUEMENT les liens de cette
 * famille (et tous les nœuds, pour que l'écran garde le repère). PURE & TOTALE — un kind inconnu
 * renvoie un graphe SANS lien (jamais une erreur). C'est ce que l'écran appelle au clic d'un filtre.
 */
export function filterByKind(graph: LinkGraph, kind: string): LinkGraph {
	return {
		nodes: graph.nodes,
		links: graph.links.filter((l) => l.kind === kind),
	};
}

/** Compte les liens par famille (pour le résumé de l'écran). PURE — clés = le jeu clos. */
export function countByKind(graph: LinkGraph): Record<LinkKind, number> {
	const out = Object.fromEntries(LINK_KINDS.map((k) => [k, 0])) as Record<
		LinkKind,
		number
	>;
	for (const l of graph.links) {
		if (isKnownKind(l.kind)) out[l.kind] += 1;
	}
	return out;
}

/**
 * Construit le GRAPHE SYNTHÉTIQUE CANONIQUE des six liens (déterministe, content-pinné) pour
 * peupler l'écran tant que le store ne sert pas les liens live (OpenQuestion documentée, ne bloque
 * pas). PURE & TOTALE : six kernels (cs = checkout-submit, co = create-order, …) reliés par les six
 * familles, CHAQUE cible pinnée `@version`. Aucun aléa, aucune horloge. Les ids restent lisibles
 * pour l'écran et l'e2e ; les versions sont des @vN.
 */
export function syntheticLinkGraph(): LinkGraph {
	const ref = (id: string, version: string): Ref => ({ id, version });

	const checkoutView = ref("checkout-view", "v2");
	const checkoutSubmit = ref("checkout-submit", "v1");
	const createOrder = ref("create-order", "v3");
	const createOrderV2 = ref("create-order", "v2");
	const order = ref("order-entity", "v1");
	const inventory = ref("inventory-cell", "v4");
	const createOrderMirror = ref("create-order-fixture", "v3");
	const orderIdea = ref("idea-order-flow", "v1");

	const nodes: Ref[] = [
		checkoutView,
		checkoutSubmit,
		createOrder,
		createOrderV2,
		order,
		inventory,
		createOrderMirror,
		orderIdea,
	];

	const links: Link[] = [
		// composes (verticaux §23) : la vue compose le contrôle, le contrôle compose l'opération.
		{ kind: "composes", from: checkoutView, to: checkoutSubmit },
		{ kind: "composes", from: checkoutSubmit, to: createOrder },
		// depends_on (horizontaux §49, Pact) : l'opération dépend d'une autre cellule.
		{ kind: "depends_on", from: createOrder, to: inventory },
		// supersedes (généalogiques §120) : create-order@v3 remplace create-order@v2.
		{ kind: "supersedes", from: createOrder, to: createOrderV2 },
		// provenance (origine §27) : la vérité create-order vient de l'idée idea-order-flow.
		{ kind: "provenance", from: createOrder, to: orderIdea },
		// triggers_binds (control S11) : le contrôle déclenche, l'action lie l'opération.
		{ kind: "triggers_binds", from: checkoutSubmit, to: createOrder },
		// mirrors (paires-miroir §17/S06) : l'opération ↔ son miroir (fixture).
		{ kind: "mirrors", from: createOrder, to: createOrderMirror },
		// composes : l'opération compose l'entité order.
		{ kind: "composes", from: createOrder, to: order },
	];

	return { nodes, links };
}
