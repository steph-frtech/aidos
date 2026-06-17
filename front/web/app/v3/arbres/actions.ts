"use server";

import { readVia, type Source } from "../../../lib/gateway-sdk";
import { panelScope } from "../../../lib/panelScope";
import type { TreeNode } from "../../../lib/v2/kernel-tree";
import {
	type AggregateVerdict,
	type ComposesWeight,
	DEFAULT_TREE_SIZE,
	DEMO_WEIGHTS,
	demoAggregate,
	demoComposes,
	toComposesTree,
} from "../../../lib/v2/kernel-tree-data";
import { aggregateDecoder } from "./live";

/**
 * Server Actions de la lentille Workbench /v3/arbres (l'ARBRE DE COMPOSITION des kernels —
 * §17 `composes`, §49 fractale, §109 vérité compositionnelle récursive).
 *
 * LE STEP : l'arbre fractal des kernels (produit → parcours → … → entité) ET le VERDICT §109 de
 * vérité compositionnelle au racine (VERT ⟺ own_mirror vert ∧ chaque enfant `composes` agrège
 * VERT) + le DRILL-DOWN §110 nommant la chaîne jusqu'à l'enfant rouge — un défaut d'enfant
 * porteur (load-bearing) rouvre le tout.
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). `arbresSnapshot` lit le
 * VERDICT live depuis le serveur MCP Go `kernel-tree` par la passerelle
 * (`readVia(scope, "tree_aggregate", …)`, la lecture dispatchée sous la ligne), avec le twin
 * `lib/v2/kernel-tree` PRÉSERVÉ UNIQUEMENT comme repli-démo déterministe (source:"live"|"demo").
 * La STRUCTURE de l'arbre (libellés, niveaux, facettes, profondeurs — la forme que React Arborist
 * rend) reste produite par le calcul pur (repli démo) côté SERVEUR ; le calcul du VERDICT, lui, est délégué au
 * moteur Go. L'import-valeur du twin vit ICI (derrière la frontière readVia) — jamais dans le
 * composant client : le cliquet T5 (NO_TWIN_AS_LIVE_PATH) reste VERT.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + le repli-démo (la même loi récursive pure
 * que le moteur Go reproduit) sont purs ; une réponse malformée / non-dispatchée / refusée donne
 * le verdict-démo. LE MUR (§2/§9) : /v3/arbres PROJETTE une lecture (l'arbre + le verdict sont des
 * projections) ; l'écran n'écrit AUCUNE vérité. Recomposer/geler un kernel passe par
 * idée → miroir → /goal → approbation, jamais depuis cette lentille.
 */

/** Un nœud de l'arbre tel que le composant client le consomme (forme sérialisable, plate). */
export interface ArbreNodeDTO {
	id: string;
	label: string;
	level: string;
	facet: string;
	depth: number;
	/** le voyant agrégé §109 de CE nœud (GREEN|RED) — calculé côté serveur depuis le verdict. */
	verdict: "GREEN" | "RED";
	children: ArbreNodeDTO[];
}

/** Le snapshot complet passé au composant client (tout est sérialisable, zéro logique twin). */
export interface ArbresSnapshot {
	roots: ArbreNodeDTO[];
	total: number;
	/** le verdict §109 au racine de l'arbre (le racine = le produit unique). */
	rootVerdict: "GREEN" | "RED";
	/** le drill-down §110 : la chaîne layer_id → … → enfant rouge (vide si VERT). */
	drillDown: {
		layerId: string;
		ownMirror: "GREEN" | "RED";
		aggregate: "GREEN" | "RED";
	}[];
	/** non vide ssi le serveur a refusé un cycle (CAUSED_BY_CYCLE). */
	cycle: string[];
	/** les deux poids d'arête déclarés (§112) — la légende. */
	weights: ComposesWeight[];
	source: Source;
}

function countNodesDTO(roots: ArbreNodeDTO[]): number {
	let n = 0;
	const walk = (x: ArbreNodeDTO) => {
		n += 1;
		for (const c of x.children) walk(c);
	};
	for (const r of roots) walk(r);
	return n;
}

/**
 * decorate projette l'arbre structurel (TreeNode du twin) en ArbreNodeDTO sérialisable, en
 * apposant sur chaque nœud son voyant own_mirror (la couleur d'un nœud isolé) — c'est la donnée
 * d'affichage. PURE & TOTALE.
 */
function decorate(
	roots: TreeNode[],
	ownMirror: (id: string) => "GREEN" | "RED",
): ArbreNodeDTO[] {
	const conv = (n: TreeNode): ArbreNodeDTO => ({
		id: n.id,
		label: n.label,
		level: n.level,
		facet: n.facet,
		depth: n.depth,
		verdict: ownMirror(n.id),
		children: n.children.map(conv),
	});
	return roots.map(conv);
}

/**
 * arbresSnapshot construit le snapshot de la lentille : la STRUCTURE (calcul pur (repli démo), serveur) + le
 * VERDICT §109 LIVE (moteur Go via la passerelle). Si la passerelle est injoignable / non
 * dispatchée / refuse, le verdict-démo (même loi pure reproduite) prend le relais (source:"demo").
 */
export async function arbresSnapshot(
	size: number = DEFAULT_TREE_SIZE,
): Promise<ArbresSnapshot> {
	const roots: TreeNode[] = demoComposes(size);
	const rootId = roots[0]?.id ?? "";
	const tree = toComposesTree(roots);
	const scope = await panelScope();

	// LECTURE LIVE par la passerelle (l'outil Go `tree_aggregate` dispatché) ; le verdict-démo
	// (demoAggregate, la même loi récursive pure) est le repli déterministe (source:"live"|"demo").
	const { data, source } = await readVia<AggregateVerdict>(
		scope,
		"tree_aggregate",
		{ tree, root: rootId },
		aggregateDecoder,
		demoAggregate(roots, rootId),
	);

	// le voyant own_mirror par nœud (déterministe) sert à colorer chaque nœud de l'arbre ; il est
	// déjà figé dans l'arbre `composes` qu'on a envoyé au serveur.
	const ownById = new Map<string, "GREEN" | "RED">();
	for (const n of tree.nodes) ownById.set(n.layer_id, n.own_mirror);
	const ownMirror = (id: string): "GREEN" | "RED" => ownById.get(id) ?? "GREEN";

	const dtoRoots = decorate(roots, ownMirror);
	return {
		roots: dtoRoots,
		total: countNodesDTO(dtoRoots),
		rootVerdict: data.verdict,
		drillDown: data.drillDown.map((s) => ({
			layerId: s.layerId,
			ownMirror: s.ownMirror,
			aggregate: s.aggregate,
		})),
		cycle: data.cycle,
		weights: DEMO_WEIGHTS,
		source,
	};
}
