/**
 * WB2-09 — le TWIN PUR des CELLULES (bounded contexts, KRD §49) rendues par l'écran /v2/cellules.
 *
 * Une grosse app n'est JAMAIS un seul Kernel indivis (§43–§51) : c'est une FÉDÉRATION délibérée de
 * petites CELLULES (bounded contexts = features = kernels grossiers). Chaque cellule porte SES
 * kernels ; reliés DEDANS par `composes ↓` (la verticale §23, le lien interne) ; et reliés DEHORS,
 * vers d'AUTRES cellules, UNIQUEMENT par CONTRAT — un lien `depends_on` (§17 `contracts_with`)
 * vérifié par Pact (§49). La grandeur vit dans le NOMBRE de cellules, jamais dans la taille d'une.
 *
 * L'écran /v2/cellules rend, par cellule : sa GRILLE niveau × facette (le rollup, somme Σ — réutilise
 * le twin WB2-05 buildGrid sur les kernels de la cellule), ses LIENS INTERNES `composes ↓`, et ses
 * CONTRATS `depends_on`/Pact → vers les autres cellules. Cliquer une cellule descend (drill-down) ;
 * cliquer une case (niveau, facette) ouvre SES specs.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : partitionner les kernels en cellules, rouler la grille de
 * chaque cellule, classer un lien en INTERNE (même cellule) vs CONTRAT (cellule ≠), compter les Σ —
 * sont des FONCTIONS PURES & TOTALES : pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Le Σ n'est
 * pas « estimé » : il est COMPTÉ. L'invariant cardinal (le critère de done) : Σ des cellules =
 * nombre total de kernels — AUCUNE spec n'est perdue ni comptée deux fois (la fédération PARTITIONNE
 * les kernels : chaque kernel appartient à EXACTEMENT une cellule). Le miroir de reproductibilité
 * lib/v2/cellules.test.ts (fast-check) épingle : même entrée → même fédération, la conservation des
 * sommes, la partition (chaque kernel dans une seule cellule), le classement interne/contrat correct
 * (un contrat va d'une cellule à une AUTRE ; un lien interne reste dans la cellule), l'ordre stable.
 *
 * RÉUTILISATION (pas de fork) : la GRILLE par cellule réutilise buildGrid de WB2-05 (lib/v2/grid) ;
 * les LIENS (Ref pinnée id@version, le jeu clos §17) réutilisent lib/v2/links (WB2-08). La cellule
 * est une AUTRE lecture des mêmes kernels — un sur-scope par-dessus l'arbre et la grille.
 *
 * LE MUR (CLAUDE.md §2) : ce module PROJETTE une lecture ; il n'écrit aucune vérité. La fédération
 * est une projection de lecture, jamais un kernel. Synthétique (fixture canonique) tant que le store
 * ne sert pas les cellules live — OpenQuestion documentée, ne bloque pas (forward-dependency).
 */

import { buildGrid, type Grid } from "./grid";
import type { KernelNode } from "./kernel-tree";
import { isPinned, type Link, type Ref, refString } from "./links";

/**
 * Un KERNEL situé dans SA cellule : le KernelNode plat (id, niveau, facette, label, parent) AUGMENTÉ
 * de l'id de la cellule (le bounded context) à laquelle il appartient. C'est la donnée d'entrée du
 * twin — la fédération PARTITIONNE ces kernels par `cellId`.
 */
export interface CellKernel extends KernelNode {
	/** L'id de la cellule (bounded context) qui contient ce kernel. */
	readonly cellId: string;
}

/** Une CELLULE projetée : son id, ses kernels, sa grille niveau × facette (rollup) et son Σ. */
export interface Cell {
	/** L'id de la cellule (bounded context), stable. */
	readonly id: string;
	/** Les ids des kernels de la cellule, ORDONNÉS (lexicographique, stable). */
	readonly kernelIds: readonly string[];
	/** Le nombre de kernels de la cellule (= kernelIds.length, le Σ de la cellule). */
	readonly count: number;
	/** La grille niveau × facette des kernels de CETTE cellule (rollup, Σ marginales, total). */
	readonly grid: Grid;
}

/**
 * Un CONTRAT inter-cellules (§49, Pact) : un lien `depends_on` qui part d'une cellule et arrive dans
 * une AUTRE cellule. Il porte les deux cellules + la référence PINNÉE de la cible (id@version). C'est
 * la SEULE manière dont deux cellules se parlent (le bounded context EST la frontière).
 */
export interface CellContract {
	/** La cellule consommatrice (d'où part le `depends_on`). */
	readonly fromCell: string;
	/** La cellule fournisseur (où arrive le contrat). */
	readonly toCell: string;
	/** Le kernel `from` (consommateur), pinné id@version. */
	readonly from: Ref;
	/** Le kernel `to` (cible du contrat), pinné id@version. */
	readonly to: Ref;
}

/** La FÉDÉRATION projetée : les cellules (ordonnées) + les contrats inter-cellules + le total. */
export interface Federation {
	/** Les cellules, ORDONNÉES par id (stable). */
	readonly cells: readonly Cell[];
	/** Les contrats inter-cellules (`depends_on`/Pact), ORDONNÉS (stable). */
	readonly contracts: readonly CellContract[];
	/** Le total de kernels (= Σ des Cell.count = nombre de CellKernel placés). */
	readonly total: number;
}

/** Le diagnostic d'une entrée invalide pour la fédération. */
export type FederationError =
	| "empty_kernel_id"
	| "empty_cell_id"
	| "grid_invalid";

export type FederationResult =
	| { ok: true; federation: Federation }
	| { ok: false; errors: FederationError[] };

/** Tri lexicographique total et stable (même règle partout — déterminisme). */
function byString(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * PARTITIONNE les kernels en cellules + roule la grille de chaque cellule — le cœur du twin.
 * PURE & TOTALE & DÉTERMINISTE :
 *   1. valide l'entrée (id de kernel et id de cellule non vides ; chaque grille de cellule valide) ;
 *   2. groupe les kernels par `cellId` — chaque kernel tombe dans EXACTEMENT une cellule (partition) ;
 *   3. pour chaque cellule, COMPOSE sa grille niveau × facette (buildGrid, WB2-05) — le rollup Σ ;
 *   4. ordonne les cellules par id, les kernelIds de chaque cellule par id (stable).
 * Aucune écriture, aucun LLM, aucune horloge. Même entrée → même fédération (mêmes Σ, même ordre).
 * Invariant cardinal : total = Σ des Cell.count = nombre de kernels placés (aucune spec perdue).
 */
export function buildFederation(
	kernels: readonly CellKernel[],
): FederationResult {
	const errors: FederationError[] = [];
	if (kernels.some((k) => k.id.trim() === "")) errors.push("empty_kernel_id");
	if (kernels.some((k) => k.cellId.trim() === "")) errors.push("empty_cell_id");
	if (errors.length > 0) return { ok: false, errors };

	// Groupe par cellule (partition déterministe : Map insertion-ordonnée, puis re-trié par id).
	const groups = new Map<string, CellKernel[]>();
	for (const k of kernels) {
		const bucket = groups.get(k.cellId);
		if (bucket) bucket.push(k);
		else groups.set(k.cellId, [k]);
	}

	const cells: Cell[] = [];
	for (const cellId of [...groups.keys()].sort(byString)) {
		const members = groups.get(cellId) ?? [];
		const res = buildGrid(members);
		if (!res.ok) {
			return { ok: false, errors: ["grid_invalid"] };
		}
		const kernelIds = members.map((m) => m.id).sort(byString);
		cells.push({
			id: cellId,
			kernelIds,
			count: kernelIds.length,
			grid: res.grid,
		});
	}

	const total = cells.reduce((s, c) => s + c.count, 0);
	return { ok: true, federation: { cells, contracts: [], total } };
}

/**
 * Classe les LIENS d'une fédération en INTERNES vs CONTRATS, et REMPLIT les contrats inter-cellules.
 * PURE & TOTALE & DÉTERMINISTE :
 *   - un lien `composes` dont les deux extrémités sont dans la MÊME cellule est INTERNE (la verticale
 *     §23 descend dans la cellule) — il N'est PAS un contrat ;
 *   - un lien `depends_on` qui part d'une cellule et arrive dans une AUTRE est un CONTRAT (§49, Pact) ;
 *   - un lien dont une extrémité n'appartient à aucune cellule connue est IGNORÉ (jamais une erreur :
 *     une projection de lecture ne fabrique pas de contrat fantôme).
 * Les contrats sont triés (fromCell, toCell, from, to) — ordre stable. Renvoie une NOUVELLE
 * fédération avec ses contrats remplis (immuable). Une cible non pinnée (id@version) est REFUSÉE
 * (un contrat vers une identité nue est un monstre §41) — elle est ignorée.
 */
export function withContracts(
	federation: Federation,
	links: readonly Link[],
): Federation {
	// id de kernel → id de cellule (la carte d'appartenance, déterministe).
	const cellOf = new Map<string, string>();
	for (const c of federation.cells) {
		for (const id of c.kernelIds) cellOf.set(id, c.id);
	}

	const contracts: CellContract[] = [];
	for (const l of links) {
		if (l.kind !== "depends_on") continue; // seul depends_on porte un contrat inter-cellules.
		if (!isPinned(l.from) || !isPinned(l.to)) continue; // un to nu n'est jamais un contrat (§41).
		const fromCell = cellOf.get(l.from.id);
		const toCell = cellOf.get(l.to.id);
		if (fromCell === undefined || toCell === undefined) continue; // extrémité inconnue → ignorée.
		if (fromCell === toCell) continue; // même cellule ⇒ pas un contrat inter-cellules.
		contracts.push({ fromCell, toCell, from: l.from, to: l.to });
	}

	contracts.sort(
		(a, b) =>
			byString(a.fromCell, b.fromCell) ||
			byString(a.toCell, b.toCell) ||
			byString(refString(a.from), refString(b.from)) ||
			byString(refString(a.to), refString(b.to)),
	);

	return { ...federation, contracts };
}

/**
 * Les LIENS INTERNES `composes ↓` d'UNE cellule : les liens `composes` dont les DEUX extrémités sont
 * des kernels de cette cellule (la verticale §23 qui descend DEDANS). PURE & TOTALE. Renvoie les
 * liens, dans l'ordre stable (from, to). C'est ce que le drill-down d'une cellule consomme.
 */
export function internalComposes(
	_cellId: string,
	cellKernelIds: readonly string[],
	links: readonly Link[],
): readonly Link[] {
	const inCell = new Set(cellKernelIds);
	return links
		.filter(
			(l) =>
				l.kind === "composes" && inCell.has(l.from.id) && inCell.has(l.to.id),
		)
		.slice()
		.sort(
			(a, b) =>
				byString(refString(a.from), refString(b.from)) ||
				byString(refString(a.to), refString(b.to)),
		);
}

/**
 * Les CONTRATS d'UNE cellule : ceux qui PARTENT d'elle (consommatrice) ou ARRIVENT vers elle
 * (fournisseur). PURE & TOTALE. C'est ce que le drill-down d'une cellule consomme pour montrer ses
 * dépendances inter-cellules (§49). Déjà triés par la fédération.
 */
export function cellContracts(
	federation: Federation,
	cellId: string,
): readonly CellContract[] {
	return federation.contracts.filter(
		(c) => c.fromCell === cellId || c.toCell === cellId,
	);
}

/**
 * Résout UNE cellule par son id. PURE & TOTALE — renvoie null si la cellule n'existe pas (jamais une
 * exception : une projection de lecture est totale).
 */
export function findCell(federation: Federation, cellId: string): Cell | null {
	return federation.cells.find((c) => c.id === cellId) ?? null;
}

/**
 * Construit la FÉDÉRATION SYNTHÉTIQUE CANONIQUE (déterministe, content-pinnée) pour peupler l'écran
 * tant que le store ne sert pas les cellules live (OpenQuestion documentée, ne bloque pas). PURE &
 * TOTALE : TROIS cellules (checkout, order, inventory), chacune avec ses kernels répartis sur la
 * verticale × facette, des liens INTERNES `composes ↓` dans chaque cellule, et DEUX contrats
 * `depends_on`/Pact inter-cellules (checkout → order, order → inventory). Aucun aléa, aucune horloge.
 * Les ids restent lisibles pour l'écran et l'e2e ; les cibles sont pinnées @vN.
 */
export function syntheticFederation(): {
	kernels: CellKernel[];
	links: Link[];
} {
	const kernels: CellKernel[] = [
		// Cellule « checkout » — le parcours d'achat (verticale produit → action).
		{
			id: "checkout-product",
			cellId: "checkout",
			level: "product",
			facet: "F",
			label: "Checkout",
			parentId: null,
		},
		{
			id: "checkout-view",
			cellId: "checkout",
			level: "view",
			facet: "I",
			label: "Écran panier",
			parentId: "checkout-product",
		},
		{
			id: "checkout-submit",
			cellId: "checkout",
			level: "control",
			facet: "I",
			label: "Bouton payer",
			parentId: "checkout-view",
		},
		{
			id: "checkout-pay",
			cellId: "checkout",
			level: "operation",
			facet: "B",
			label: "Payer",
			parentId: "checkout-submit",
		},
		// Cellule « order » — la commande (verticale opération → entité).
		{
			id: "order-product",
			cellId: "order",
			level: "product",
			facet: "F",
			label: "Commande",
			parentId: null,
		},
		{
			id: "order-create",
			cellId: "order",
			level: "operation",
			facet: "B",
			label: "Créer commande",
			parentId: "order-product",
		},
		{
			id: "order-entity",
			cellId: "order",
			level: "entity",
			facet: "S",
			label: "Order",
			parentId: "order-create",
		},
		// Cellule « inventory » — le stock (verticale opération → entité).
		{
			id: "inventory-product",
			cellId: "inventory",
			level: "product",
			facet: "F",
			label: "Stock",
			parentId: null,
		},
		{
			id: "inventory-reserve",
			cellId: "inventory",
			level: "operation",
			facet: "B",
			label: "Réserver",
			parentId: "inventory-product",
		},
		{
			id: "inventory-entity",
			cellId: "inventory",
			level: "entity",
			facet: "S",
			label: "Item",
			parentId: "inventory-reserve",
		},
	];

	const ref = (id: string, version: string): Ref => ({ id, version });
	const links: Link[] = [
		// Liens INTERNES composes ↓ (la verticale §23 descend dans chaque cellule).
		{
			kind: "composes",
			from: ref("checkout-product", "v1"),
			to: ref("checkout-view", "v1"),
		},
		{
			kind: "composes",
			from: ref("checkout-view", "v1"),
			to: ref("checkout-submit", "v1"),
		},
		{
			kind: "composes",
			from: ref("checkout-submit", "v1"),
			to: ref("checkout-pay", "v1"),
		},
		{
			kind: "composes",
			from: ref("order-product", "v1"),
			to: ref("order-create", "v1"),
		},
		{
			kind: "composes",
			from: ref("order-create", "v1"),
			to: ref("order-entity", "v1"),
		},
		{
			kind: "composes",
			from: ref("inventory-product", "v1"),
			to: ref("inventory-reserve", "v1"),
		},
		{
			kind: "composes",
			from: ref("inventory-reserve", "v1"),
			to: ref("inventory-entity", "v1"),
		},
		// CONTRATS depends_on/Pact inter-cellules (§49) : checkout → order, order → inventory.
		{
			kind: "depends_on",
			from: ref("checkout-pay", "v1"),
			to: ref("order-create", "v1"),
		},
		{
			kind: "depends_on",
			from: ref("order-create", "v1"),
			to: ref("inventory-reserve", "v1"),
		},
	];

	return { kernels, links };
}
