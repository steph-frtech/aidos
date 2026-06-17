import {
	allLinksPinned,
	syntheticLinkGraph,
	type LinkGraph as TwinGraph,
	type LinkKind as TwinKind,
	type Link as TwinLink,
	validate,
} from "./links";

/**
 * links-data.ts — le REPLI-DÉMO DÉTERMINISTE de la lentille /v3/liens (le cutover ADR 0092 :
 * le moteur Go est l'UNIQUE source vivante des SIX LIENS §41).
 *
 * POURQUOI CE FICHIER. La lentille V3 « liens » lit DÉSORMAIS le moteur Go LIVE par la passerelle
 * (`links_graph` sur le serveur `links` dispatché — back/mcp/links/linksrv → back/kernel/links est
 * la source unique). `links_graph` valide + résout un graphe de liens contre les heads et renvoie,
 * PAR LIEN, son verdict §41–§42 (green pinné à la tête | stale pinné à une non-tête | absent), plus
 * la garantie tout-pinné et les comptes. Quand la passerelle est injoignable ou qu'aucun serveur
 * des liens n'est dispatché, l'écran retombe sur ce corps-démo (source:"demo").
 *
 * LE TWIN DEVIENT LE REPLI (jamais le chemin vivant). lib/v2/links reste un calcul PUR & TOTAL
 * (syntheticLinkGraph, validate, allLinksPinned, le filtre par famille), épinglé par
 * lib/v2/links.test.ts ; mais ce calcul ne sert PLUS de source d'affichage live — il ne fait que
 * produire le repli-démo honnête. Ce fichier-data EST le témoin du cliquet (twin-as-live-fitness) :
 * `lib/v2/links.ts` + `lib/v2/links-data.ts` font de `v2/links` un twin reconnu, donc tout
 * import-valeur du twin DOIT être derrière la frontière readVia (sinon le cliquet rougit).
 *
 * LE MAPPING VERS LE JEU CANONIQUE §41 (le jeu CLOS du Go). Le twin V2 porte les familles LISIBLES
 * (composes/depends_on/supersedes/provenance/triggers_binds/mirrors) ; le moteur Go attend le jeu
 * CANONIQUE back/kernel/links.Kind (projects_to/derives_from/contracts_with/triggers/binds/mirrors).
 * familyToCanon projette chaque famille V2 vers UN kind canonique (le même mapping que le twin
 * kindToCanon, mais 1→1 pour l'arête envoyée au Go : triggers_binds→triggers, provenance→derives_from).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : même graphe synthétique → même vue-démo (syntheticLinkGraph
 * est pure, zéro horloge/aléa/LLM). Le MUR (§2) : ceci ne DÉCLARE qu'un repli de lecture sous la
 * ligne — aucune écriture-vérité ; geler un lien passe par idée → miroir → /goal → approbation.
 */

/** Les SIX kinds CANONIQUES §41 (back/kernel/links.Kind — le jeu CLOS) dans l'ordre canonique. */
export const CANON_KINDS = [
	"projects_to",
	"derives_from",
	"contracts_with",
	"triggers",
	"binds",
	"mirrors",
] as const;
export type CanonKind = (typeof CANON_KINDS)[number];

/** Le statut §41–§42 d'un lien résolu : green (pinné à la tête) · stale · absent. */
export type LinkStatus = "green" | "stale" | "absent";

/** Une RÉFÉRENCE PINNÉE rendue pour l'écran (le repère React Flow). */
export interface Ref {
	readonly id: string;
	readonly version: string;
}

/** refStr — la forme canonique « id@version » (miroir de links.Ref.String). PURE. */
export function refStr(r: Ref): string {
	return `${r.id}@${r.version}`;
}

/**
 * Une LIGNE de la vue : le verdict PAR LIEN renvoyé par le moteur Go (`links_graph`). C'est la
 * forme exacte du tool (linkStatusRow : from/to déjà rendus « id@version », valid + status?).
 */
export interface LinkRow {
	readonly kind: string;
	readonly from: string;
	readonly to: string;
	readonly valid: boolean;
	readonly status?: LinkStatus;
	readonly error?: string;
}

/**
 * La VUE que la lentille rend : les nœuds (pour le repère React Flow) + le statut PAR LIEN du
 * moteur Go + la garantie tout-pinné + les comptes green/stale/absent. C'est la forme que le
 * décodeur live remplit ; demoLinksView la produit aussi (badge honnête source:"live"|"demo").
 */
export interface LinksView {
	readonly nodes: readonly Ref[];
	readonly rows: readonly LinkRow[];
	readonly allPinned: boolean;
	readonly green: number;
	readonly stale: number;
	readonly absent: number;
}

/**
 * familyToCanon — la projection 1→1 d'une famille V2 lisible vers UN kind canonique §41 (celui que
 * le Go attend pour l'arête). Aligné sur le twin kindToCanon (triggers_binds prend triggers ;
 * provenance/supersedes prennent derives_from). PURE & TOTALE.
 */
export function familyToCanon(k: TwinKind): CanonKind {
	switch (k) {
		case "composes":
			return "projects_to";
		case "depends_on":
			return "contracts_with";
		case "supersedes":
			return "derives_from";
		case "provenance":
			return "derives_from";
		case "triggers_binds":
			return "triggers";
		case "mirrors":
			return "mirrors";
	}
}

/**
 * demoHeads — les têtes courantes (id → tête) de la démo, déterministes. Toutes les cibles pointent
 * leur tête SAUF create-order (tête v3) : un lien supersedes pinné create-order@v2 est donc STALE
 * (la vague de rouge §42, rendue hors-ligne). Calculées du graphe synthétique du twin (pas de
 * version codée à la main hors du graphe).
 */
export function demoHeads(
	graph: TwinGraph = syntheticLinkGraph(),
): Record<string, string> {
	const heads: Record<string, string> = {};
	for (const n of graph.nodes) {
		// la tête d'un id = la version la plus haute vue dans les nœuds (tri lexical des @vN suffit
		// ici : v1 < v2 < v3 < v4). Déterministe, aucune horloge.
		const prev = heads[n.id];
		if (prev === undefined || prev < n.version) heads[n.id] = n.version;
	}
	return heads;
}

/**
 * canonGraph — projette le graphe synthétique du twin (familles V2) vers le graphe CANONIQUE §41
 * que le Go consomme : chaque arête prend son kind canonique (familyToCanon). PURE. Les nœuds et
 * les refs pinnées sont conservés tels quels (l'écran garde le repère lisible).
 */
export interface CanonLink {
	readonly kind: CanonKind;
	readonly from: Ref;
	readonly to: Ref;
}
export interface CanonGraph {
	readonly nodes: readonly Ref[];
	readonly links: readonly CanonLink[];
	readonly heads: Readonly<Record<string, string>>;
}

export function canonGraph(
	graph: TwinGraph = syntheticLinkGraph(),
): CanonGraph {
	const links: CanonLink[] = graph.links.map((l: TwinLink) => ({
		kind: familyToCanon(l.kind as TwinKind),
		from: { id: l.from.id, version: l.from.version },
		to: { id: l.to.id, version: l.to.version },
	}));
	const nodes: Ref[] = graph.nodes.map((n) => ({
		id: n.id,
		version: n.version,
	}));
	return { nodes, links, heads: demoHeads(graph) };
}

/**
 * gatewayGraphArgs projette le graphe CANONIQUE vers l'objet d'arguments EXACT de l'outil Go
 * `links_graph` (graphInput = { links:[{kind,from:{id,version},to:{id,version}}], heads:{id:version} }).
 * PURE ; un objet SIMPLE sérialisable (pas de json.RawMessage — le garde du scar S59). C'est l'unique
 * pont vers le moteur ; aucune logique de validation/résolution n'est dupliquée ici (le Go juge).
 */
export function gatewayGraphArgs(
	graph: CanonGraph = canonGraph(),
): Record<string, unknown> {
	return {
		links: graph.links.map((l) => ({
			kind: l.kind,
			from: { id: l.from.id, version: l.from.version },
			to: { id: l.to.id, version: l.to.version },
		})),
		heads: { ...graph.heads },
	};
}

/**
 * demoLinksView construit la VUE de repli déterministe À PARTIR DU TWIN (le calcul pur lib/v2/links :
 * syntheticLinkGraph pour le graphe, validate pour la forme, allLinksPinned pour la garantie). Elle
 * REND la même forme que le décodeur live (rows + allPinned + counts) — badge honnête source:"demo".
 * Le statut suit le MÊME critère §41–§42 que le Go (green si pinné à la tête, stale sinon, absent si
 * pas de tête) — un repli de DÉMO, pas une seconde source autoritaire (le Go reste la vérité live).
 */
export function demoLinksView(): LinksView {
	const twin = syntheticLinkGraph();
	const heads = demoHeads(twin);
	let green = 0;
	let stale = 0;
	let absent = 0;
	const rows: LinkRow[] = twin.links.map((tl: TwinLink) => {
		// On réutilise le validate PUR du twin (le garde de forme §41) sur l'arête D'ORIGINE
		// (famille V2, le seul jeu que le twin connaît) ; le pinning est indépendant du kind.
		const err = validate(tl);
		// Le kind RENDU à l'écran est le kind CANONIQUE §41 (celui que le Go renverrait).
		const kind = familyToCanon(tl.kind as TwinKind);
		if (err !== "") {
			return {
				kind,
				from: refStr(tl.from),
				to: refStr(tl.to),
				valid: false,
				error: err,
			};
		}
		const head = heads[tl.to.id];
		let status: LinkStatus;
		if (head === undefined) status = "absent";
		else if (head === tl.to.version) status = "green";
		else status = "stale";
		if (status === "green") green += 1;
		else if (status === "stale") stale += 1;
		else absent += 1;
		return {
			kind,
			from: refStr(tl.from),
			to: refStr(tl.to),
			valid: true,
			status,
		};
	});
	const nodes: Ref[] = twin.nodes.map((n) => ({
		id: n.id,
		version: n.version,
	}));
	return {
		nodes,
		rows,
		// la garantie tout-pinné vient du twin (allLinksPinned PUR) sur le graphe synthétique.
		allPinned: allLinksPinned(twin),
		green,
		stale,
		absent,
	};
}
