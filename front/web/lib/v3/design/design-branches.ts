/**
 * Design Lab — LES BRANCHES DE DESIGN (Tranche 5, ADR 0071 §5) : « les branches/checkpoints
 * Onlook ». Onlook a des branches d'écran et des checkpoints (un retour-arrière visuel) ;
 * AIDOS les MAPPE sur le VERSION DAG S24 (KRD §120-§125) — l'espace des versions est un DAG,
 * pas une ligne. RÉUTILISE, NE RÉINVENTE PAS (CLAUDE.md §6) : ce module N'IMPLÉMENTE PAS la
 * navigation du DAG — il DÉLÈGUE à lib/v2/version-dag (branch / checkoutAncestor / rebranch /
 * heads / topoSort / versionHash / ancestors), le twin pur de S24. Il ne fait que :
 *   1. SEEDER un DAG de design depuis la MAÎTRE (le nœud racine = la version de référence) ;
 *   2. PLIER les captures de design de la session (les ScreenDesign id, content-adressés) en
 *      ARÊTES (= des ChangeSets S20 : l'edge réutilise l'id de la capture) le long de la ligne
 *      courante — chaque capture fait AVANCER la tête (un nouveau nœud-version) ;
 *   3. OUVRIR une branche / FORKER depuis un ancien point / RESTAURER un checkpoint — les trois
 *      mouvements §121, chacun un appel au twin S24 (jamais une logique recopiée ici).
 *
 * LE CHECKPOINT = une PHASE STABLE (S23). « Restaurer » = checkoutAncestor d'une phase. « Forker
 * depuis un ancien point » = checkoutAncestor(ancêtre) + rebranch(ancêtre) — exactement la
 * sémantique §121 du twin. Le MERGE de deux branches de design réutilise le MERGE SÉMANTIQUE
 * (back/archive/merge, §122) — ici on ANNEXE la lisibilité du merge (les têtes mergeables), la
 * décision réelle restant le chemin back gaté par le miroir (OpenQuestion : pas de merge live
 * tant que le store ne sert pas le DAG — ne bloque pas, forward-dependency S17/S31).
 *
 * DÉTERMINISME-FIRST (§6/§8). TOUT est PUR & TOTAL & SANS LLM : seeder, plier, brancher, forker,
 * restaurer sont des fonctions déterministes de leurs entrées — pas d'horloge, pas d'aléa, pas
 * d'E/S. Même (master, captures, séquence de mouvements) → même DAG, mêmes ids (content-adressés
 * via versionHash, repris de S24). Le miroir de reproductibilité (design-branches.test.ts,
 * fast-check) épingle : le seed déterministe, le pli append-only (les captures ne font que
 * CROÎTRE le DAG), le fork = checkout+rebranch (l'ancienne ligne JAMAIS détruite), la restauration
 * = un simple head-flag move (rien supprimé), et la totalité (une ref inconnue → DAG inchangé).
 *
 * LE MUR (§2). Ce module PROJETTE une lecture du DAG (read-only sous la ligne) et compose des
 * mouvements PURS en mémoire (le twin de S24). Les écritures réelles passent par le CLI aidos via
 * le MCP `dag` (rôle `aidos` ; l'agent est SELECT-only) — depuis la lentille, une server action
 * (designBranchAction) appelle ce MCP. Aucune écriture-vérité ici, jamais : un nœud de design est
 * une PHASE STABLE (S23), une arête un ChangeSet (S20) — la relation, jamais une vérité kernel.
 */

import {
	type DagNode,
	branch as dagBranch,
	checkoutAncestor as dagCheckout,
	heads as dagHeads,
	rebranch as dagRebranch,
	topoSort as dagTopoSort,
	type VersionDag,
	versionHash,
} from "../../v2/version-dag";

/** La cible enfant d'une branche de design (web/mobile/desktop) — le jeu CLOS de ChildTarget. */
export type { ChildTarget } from "./screen-design";

/**
 * Une CAPTURE de design pliée dans le DAG : l'id content-adressé d'un ScreenDesign (le `id` que
 * composeScreenDesign / EmitScreenDesign produit, byte-égal Go) + son libellé humain (la coordonnée
 * adaptée, pour l'écran). C'est ce qu'un événement `ecran_adapte` de la session produit ; le pli en
 * fait une ARÊTE (un ChangeSet S20) qui fait avancer la tête de la ligne courante.
 */
export interface DesignCapture {
	/** L'id content-adressé de la capture (le ScreenDesign.id, ou un id stable de l'adaptation). */
	readonly captureId: string;
	/** Le libellé humain de la capture (la coordonnée + les tokens) — pour l'écran et l'e2e. */
	readonly label: string;
}

/** Le LABEL DE LA RACINE du DAG de design (la version de référence de la maître). DÉCLARÉ. */
export const DESIGN_ROOT_LABEL = "design-base";

/**
 * Le LABEL d'un pas de design (la n-ième capture sur une ligne) — DÉTERMINISTE, jamais une horloge.
 * « design-1 », « design-2 »… : lisible à l'écran, content-adressé via versionHash (l'ordre est la
 * seule donnée d'identité avec le parent). PURE & TOTALE.
 */
export function captureStepLabel(n: number): string {
	return `design-${n}`;
}

/**
 * seedDesignDag — SEED un DAG de design depuis la MAÎTRE : un unique nœud RACINE (la version de
 * référence, Stratum=above, head:true), sans parent. PURE & TOTALE : l'id est content-adressé
 * (versionHash(DESIGN_ROOT_LABEL, [], "above")), déterministe et byte-stable. C'est le point de
 * départ de toute ligne de design — la maître EST le checkpoint racine (la forme canonique, le
 * « design-base » dont tout fork descend).
 *
 * RÉUTILISE le twin S24 : le nœud porte la forme DagNode (id/label/parentIds/head/stratum) ; aucune
 * structure forkée. La strate est TOUJOURS `above` (une branche de vérité humaine — un design est
 * un requirement humain, jamais une variante évolutionnaire below).
 */
export function seedDesignDag(): {
	dag: VersionDag;
	rootId: string;
} {
	const rootId = versionHash(DESIGN_ROOT_LABEL, [], "above");
	const root: DagNode = {
		id: rootId,
		label: DESIGN_ROOT_LABEL,
		parentIds: [],
		head: true,
		stratum: "above",
	};
	return { dag: { nodes: [root], edges: [] }, rootId };
}

/**
 * foldCaptures — PLIE une séquence de captures de design en ARÊTES le long de la LIGNE COURANTE :
 * chaque capture fait AVANCER la tête (branch depuis le head courant, l'arête réutilise l'id de la
 * capture comme ChangeSet S20). PURE & TOTALE & DÉTERMINISTE : même (dag, captures) → même DAG.
 * APPEND-ONLY (§120) : le pli ne fait que CROÎTRE le DAG ; aucune capture ne détruit un nœud.
 *
 * RÉUTILISE le twin S24 : chaque pas est un dagBranch(dag, head, label, captureId) — le head bouge,
 * l'ancienne version reste (jamais supprimée). Le label du pas est captureStepLabel(rang) (lisible,
 * content-adressé). Une capture sans head courant (DAG vide — ne devrait pas arriver après seed)
 * est ignorée (totalité). L'ordre des captures EST l'ordre de la session (déterministe).
 */
export function foldCaptures(
	dag: VersionDag,
	captures: readonly DesignCapture[],
): VersionDag {
	let out = dag;
	let step = 0;
	for (const c of captures) {
		const head = dagHeads(out)[0];
		if (head === undefined) break; // DAG sans tête : rien à faire (totalité)
		step += 1;
		// Une capture = une arête (ChangeSet S20 = l'id de la capture) faisant avancer la tête.
		out = dagBranch(out, head.id, captureStepLabel(step), c.captureId);
	}
	return out;
}

/**
 * buildDesignDag — LE DAG DE DESIGN COMPLET de la session : seed (la maître racine) puis fold des
 * captures (la ligne courante). PURE & TOTALE & DÉTERMINISTE : même (captures) → même DAG, mêmes
 * ids, même tête. C'est la DONNÉE que l'écran pose (jamais stockée — recalculée du transcript, le
 * motif ADR 0060) ; l'e2e hermétique s'appuie dessus (aucune iframe réelle requise).
 */
export function buildDesignDag(captures: readonly DesignCapture[]): {
	dag: VersionDag;
	rootId: string;
} {
	const seeded = seedDesignDag();
	return { dag: foldCaptures(seeded.dag, captures), rootId: seeded.rootId };
}

/**
 * openDesignBranch — OUVRE une branche ALTERNATIVE de design depuis un nœud (§121). PURE & TOTALE :
 * DÉLÈGUE à dagBranch (le twin S24) — un nouveau nœud parenté sur `fromId` devient la tête, l'arête
 * réutilise `changeset` (l'id de la capture qui motive la branche, ou un id de branche stable).
 * Append-only : `fromId` n'est JAMAIS supprimé. Une ref inconnue → DAG inchangé (le twin est total).
 */
export function openDesignBranch(
	dag: VersionDag,
	fromId: string,
	label: string,
	changeset: string,
): VersionDag {
	return dagBranch(dag, fromId, label, changeset);
}

/**
 * forkFromPoint — FORKE depuis un ANCIEN POINT (le geste-clé Onlook « repartir d'un checkpoint
 * passé ») : la sémantique §121 EXACTE = checkoutAncestor(ancêtre) PUIS rebranch(ancêtre). PURE &
 * TOTALE : DÉLÈGUE deux fois au twin S24, jamais une logique recopiée. L'ancienne ligne (les
 * descendants de l'ancêtre) RESTE intégralement dans le DAG (append-only §120, un stepping-stone
 * §123) — forker ne détruit RIEN ; il ramène la tête sur l'ancêtre puis ouvre une NOUVELLE ligne.
 * Une ref inconnue → DAG inchangé (les deux mouvements sont totaux).
 */
export function forkFromPoint(
	dag: VersionDag,
	ancestorId: string,
	label: string,
	changeset: string,
): VersionDag {
	// 1) Ramène la tête sur l'ancêtre (un head-flag move — la ligne abandonnée reste).
	const reset = dagCheckout(dag, ancestorId);
	// 2) Ouvre une NOUVELLE ligne depuis l'ancêtre (la branche d'une branche).
	return dagRebranch(reset, ancestorId, label, changeset);
}

/**
 * restoreCheckpoint — RESTAURE un CHECKPOINT (une phase stable S23) : « revenir à une version
 * antérieure du design ». PURE & TOTALE : DÉLÈGUE à dagCheckout (le twin S24) — un simple
 * head-flag move ARRIÈRE. Rien n'est supprimé (append-only §120) : la ligne plus récente reste
 * dans le DAG, prête à être re-checkout ou forkée. Une ref inconnue → DAG inchangé.
 *
 * NOTE (le mur §2) : « restaurer » et « forker un stepping-stone » sont LE MÊME geste DAG (§123) —
 * checkoutAncestor ; la différence est l'intention humaine, jamais la mécanique.
 */
export function restoreCheckpoint(
	dag: VersionDag,
	checkpointId: string,
): VersionDag {
	return dagCheckout(dag, checkpointId);
}

/**
 * Un CHECKPOINT de design lisible par l'écran : un nœud-version + son rang topologique (l'ordre où
 * l'écran le pose) + s'il est la tête courante + s'il est la racine. Une projection PURE du DAG.
 */
export interface DesignCheckpoint {
	readonly id: string;
	readonly label: string;
	readonly parentIds: readonly string[];
	readonly head: boolean;
	readonly isRoot: boolean;
	/** Le rang topologique (Kahn, déterministe) — l'ordre de pose à l'écran. */
	readonly rank: number;
}

/**
 * listCheckpoints — PROJETTE le DAG en une liste de checkpoints triés TOPOLOGIQUEMENT (un parent
 * précède son enfant), chacun annoté (tête ? racine ? rang). PURE & TOTALE & DÉTERMINISTE :
 * DÉLÈGUE le tri à dagTopoSort (le twin S24) — l'écran ne re-trie jamais. C'est la liste « explorer
 * une branche / naviguer / restaurer » que la lentille rend (chaque checkpoint cliquable).
 */
export function listCheckpoints(dag: VersionDag): DesignCheckpoint[] {
	const sorted = dagTopoSort(dag);
	return sorted.map((n, i) => ({
		id: n.id,
		label: n.label,
		parentIds: n.parentIds,
		head: n.head,
		isRoot: n.parentIds.length === 0,
		rank: i,
	}));
}

/**
 * currentHead — LA TÊTE COURANTE du DAG de design (le checkpoint « où vous êtes »). PURE & TOTALE :
 * DÉLÈGUE à dagHeads (le twin S24) et renvoie la première (une ligne de design unique a UNE tête ;
 * plusieurs lignes parallèles §125 sont possibles après un fork — la première en ordre d'insertion
 * est la « courante » affichée). null si le DAG est vide (totalité).
 */
export function currentHead(dag: VersionDag): DagNode | null {
	return dagHeads(dag)[0] ?? null;
}

/**
 * leaves — LES POINTES (tips) du DAG : les nœuds SANS enfant. Un fork (§121) crée une 2e pointe sans
 * supprimer la première (append-only §123) — c'est la divergence réelle de deux lignes de design.
 * PURE & TOTALE. (Le twin S24 lib/v2 déplace toujours la tête à chaque branch : les « têtes » ne
 * divergent pas, mais les POINTES si — c'est la lisibilité fidèle de deux lignes à réconcilier.)
 */
export function leaves(dag: VersionDag): DagNode[] {
	const hasChild = new Set<string>();
	for (const e of dag.edges) hasChild.add(e.from);
	return dag.nodes.filter((n) => !hasChild.has(n.id));
}

/**
 * mergeReadiness — LA LISIBILITÉ du MERGE de deux branches de design (§122) : les POINTES divergentes
 * candidates au merge sémantique. PURE & TOTALE : lit les leaves (les tips sans enfant). Le MERGE
 * réel réutilise back/archive/merge (le miroir décide, jamais le diff textuel) — ANNEXÉ ici, jamais
 * exécuté côté écran (le mur §2 : la décision de merge est gatée par le miroir, rôle `aidos`).
 *
 * `canMerge` est true ssi le DAG a ≥2 POINTES (deux lignes de design divergentes à réconcilier,
 * typiquement après un fork) — sinon il n'y a rien à merger (une seule ligne). C'est une LISIBILITÉ,
 * jamais une auto-décision : le verdict (clean/conflict/unresolvable) reste le chemin back gaté par
 * le miroir. `heads` reste exposé (la tête courante, où l'on est) pour l'écran.
 */
export function mergeReadiness(dag: VersionDag): {
	canMerge: boolean;
	tips: readonly DagNode[];
	heads: readonly DagNode[];
} {
	const tips = leaves(dag);
	return { canMerge: tips.length >= 2, tips, heads: dagHeads(dag) };
}

/**
 * Le jeu CLOS des MOUVEMENTS de branche de design — exactement les §121 du DAG S24, exposés comme
 * tools MCP (un op = un tool, ADR 0009) par la server action. AUCUN autre mouvement n'existe
 * (fail-closed, déterminisme-first §6/§8).
 */
export type DesignBranchMove = "branch" | "fork" | "restore";

export const DESIGN_BRANCH_MOVES: readonly DesignBranchMove[] = [
	"branch",
	"fork",
	"restore",
] as const;

export function isDesignBranchMove(s: string): s is DesignBranchMove {
	return (DESIGN_BRANCH_MOVES as readonly string[]).includes(s);
}

/**
 * applyDesignMove — APPLIQUE un mouvement de branche de design (le jeu CLOS). PURE & TOTALE &
 * DÉTERMINISTE : DÉLÈGUE à open/fork/restore (eux-mêmes des délégations au twin S24). Un mouvement
 * inconnu OU une ref inconnue → DAG inchangé (totalité, fail-closed). C'est le point UNIQUE que la
 * lentille (et le miroir e2e) appelle — la mécanique du mur §2 reste celle du DAG, jamais recopiée.
 */
export function applyDesignMove(
	dag: VersionDag,
	move: DesignBranchMove,
	targetId: string,
	label: string,
	changeset: string,
): VersionDag {
	switch (move) {
		case "branch":
			return openDesignBranch(dag, targetId, label, changeset);
		case "fork":
			return forkFromPoint(dag, targetId, label, changeset);
		case "restore":
			return restoreCheckpoint(dag, targetId);
		default:
			return dag;
	}
}
