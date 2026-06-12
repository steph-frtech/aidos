/**
 * V3 — le TWIN PUR de la PROJECTION GRAPHE des parcours (ADR 0060, ADR 0053).
 *
 * L'écran « Parcours produit » montre les scénarios en GRAPHES (React Flow). La
 * DONNÉE du graphe est une PROJECTION PURE de l'arbre composes : un nœud de flow
 * par nœud d'arbre, une arête par lien composes, des POSITIONS CALCULÉES (la
 * profondeur gouverne X — lecture de gauche à droite ; le rang dans la fratrie
 * cumulée gouverne Y). Aucun aléa, aucun layout physique : même arbre → mêmes
 * positions (le miroir lib/v3/flow.test.ts épingle bijection, déterminisme,
 * positions finies et distinctes, focus de sous-arbre fail-closed).
 *
 * RÉUTILISATION : l'ordre des fratries vient de buildKernelTree (WB2-04) ; le
 * focus résout par nodeByPath (ADR 0055). La lib React Flow ne fait que RENDRE.
 */

import { nodeByPath } from "../v2/composition";
import {
	buildKernelTree,
	type KernelNode,
	type TreeNode,
} from "../v2/kernel-tree";

/** Un nœud du graphe rendu : position calculée + les métadonnées d'affichage. */
export interface FlowNode {
	readonly id: string;
	readonly label: string;
	readonly level: string;
	readonly depth: number;
	readonly x: number;
	readonly y: number;
}

/** Une arête du graphe rendu (un lien composes parent → enfant). */
export interface FlowEdge {
	readonly id: string;
	readonly source: string;
	readonly target: string;
}

const DX = 240;
const DY = 84;

/**
 * PROJETTE l'arbre composes (ou le sous-arbre d'un parcours focalisé) en graphe
 * positionné. PURE & TOTALE & DÉTERMINISTE :
 *   - focusPath null  → l'arbre entier depuis ses racines ;
 *   - focusPath connu → SON sous-arbre (la racine du focus incluse) ;
 *   - focusPath inconnu → graphe VIDE (fail-closed, jamais une invention).
 * X = profondeur × DX ; Y = rang d'apparition dans le parcours préfixe × DY —
 * chaque nœud a une position distincte, l'ordre est celui de buildKernelTree.
 */
export function composesToFlow(
	tree: readonly KernelNode[],
	focusPath: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
	const built = buildKernelTree(tree);
	if (!built.ok) return { nodes: [], edges: [] };

	let roots: readonly TreeNode[] = built.roots;
	if (focusPath !== null) {
		const focus = nodeByPath(tree, focusPath);
		if (focus === null) return { nodes: [], edges: [] };
		const findIn = (ns: readonly TreeNode[]): TreeNode | null => {
			for (const n of ns) {
				if (n.id === focus.id) return n;
				const hit = findIn(n.children);
				if (hit !== null) return hit;
			}
			return null;
		};
		const sub = findIn(built.roots);
		if (sub === null) return { nodes: [], edges: [] };
		roots = [sub];
	}

	const nodes: FlowNode[] = [];
	const edges: FlowEdge[] = [];
	let row = 0;
	const baseDepth = roots.length > 0 ? roots[0].depth : 0;
	const walk = (n: TreeNode, parentId: string | null) => {
		nodes.push({
			id: n.id,
			label: n.label,
			level: n.level,
			depth: n.depth,
			x: (n.depth - baseDepth) * DX,
			y: row * DY,
		});
		row++;
		if (parentId !== null)
			edges.push({ id: `${parentId}>${n.id}`, source: parentId, target: n.id });
		for (const c of n.children) walk(c, n.id);
	};
	for (const r of roots) walk(r, null);
	return { nodes, edges };
}
