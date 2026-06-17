import {
	buildKernelTree,
	type KernelNode,
	syntheticComposes,
	type TreeNode,
} from "./kernel-tree";

/**
 * kernel-tree-data.ts — le REPLI-DÉMO DÉTERMINISTE de la lentille /v3/arbres (le cutover
 * ADR 0092 : le moteur Go est l'UNIQUE source vivante de l'arbre de composition).
 *
 * POURQUOI CE FICHIER. La lentille V3 « arbres » lit désormais le moteur Go LIVE par la
 * passerelle (`tree_aggregate` sur le serveur `kernel-tree`, dispatché — back/kernel/composes
 * est la source unique du §109). `tree_aggregate` calcule, depuis un arbre `composes` (les
 * nœuds + leur voyant own_mirror + les arêtes pondérées), le VERDICT RÉCURSIF de vérité
 * compositionnelle au racine interrogé (VERT ⟺ own_mirror vert ∧ chaque enfant `composes`
 * agrège VERT) ET le DRILL-DOWN (§110) nommant la chaîne jusqu'à l'enfant rouge — ou un refus
 * typé de cycle (CAUSED_BY_CYCLE). Quand la passerelle est injoignable ou qu'aucun store n'est
 * dispatché, l'écran retombe sur ce repli-démo (source:"demo").
 *
 * LE TWIN DEVIENT LE REPLI (jamais le chemin vivant). lib/v2/kernel-tree reste un calcul PUR &
 * TOTAL (buildKernelTree + syntheticComposes — la STRUCTURE de l'arbre : l'ordre verticale §23
 * puis id, la profondeur, l'absence d'orphelin), épinglé par lib/v2/kernel-tree.test.ts ; mais
 * ce calcul ne sert PLUS de source d'affichage live du VERDICT — il ne produit que le repli-démo
 * honnête (la forme structurelle de l'arbre + le verdict §109 reproduit localement). Ce
 * fichier-data EST le témoin du cliquet (twin-as-live-fitness) : `lib/v2/kernel-tree.ts` +
 * `lib/v2/kernel-tree-data.ts` font de `v2/kernel-tree` un twin reconnu, donc tout import-valeur
 * du twin DOIT être derrière la frontière readVia (sinon le cliquet rougit).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : même N → même arbre + même verdict-démo (aucune
 * horloge, aucun aléa, aucun LLM). Le voyant own_mirror et le poids d'arête sont DÉRIVÉS
 * déterministiquement de la position du nœud (tant que le store de kernels n'expose pas ses
 * voyants réels — OpenQuestion documentée, ne bloque pas). Le MUR (§2) : ceci ne DÉCLARE qu'un
 * repli de lecture sous la ligne — aucune écriture-vérité ; recomposer/geler un kernel passe par
 * idée → miroir → /goal → approbation.
 */

/** Les deux poids d'arête `composes` déclarés (§112) — la légende du panneau. */
export type ComposesWeight = "load-bearing" | "cosmetic";

/** Le voyant own_mirror d'un nœud — exactement l'un de deux (pas de troisième valeur, §109). */
export type OwnMirror = "GREEN" | "RED";

/** Un nœud de l'arbre `composes` côté passerelle (la forme `treeIn.nodes` du serveur Go). */
export interface ComposesNodeArg {
	layer_id: string;
	version: string;
	own_mirror: OwnMirror;
	activation_threshold: number;
}

/** Une arête `composes` pondérée côté passerelle (la forme `treeIn.edges` du serveur Go). */
export interface ComposesEdgeArg {
	parent: { id: string; version: string };
	child: { id: string; version: string };
	weight: ComposesWeight;
}

/** L'arbre `composes` complet, la forme `tree` que `tree_aggregate` consomme. */
export interface ComposesTreeArg {
	nodes: ComposesNodeArg[];
	edges: ComposesEdgeArg[];
	changed?: string[];
}

/** Un pas du drill-down §110 (un nœud sur le chemin vers l'enfant rouge), forme front. */
export interface DrillStep {
	layerId: string;
	version: string;
	ownMirror: OwnMirror;
	aggregate: OwnMirror;
}

/** Le verdict §109 + drill-down §110 (la forme décodée de `tree_aggregate`), côté front. */
export interface AggregateVerdict {
	verdict: OwnMirror;
	drillDown: DrillStep[];
	/** non vide ssi le serveur a refusé un cycle (CAUSED_BY_CYCLE). */
	cycle: string[];
}

/** Les deux poids déclarés, la légende live|démo (jamais inventée — le serveur les renvoie). */
export const DEMO_WEIGHTS: ComposesWeight[] = ["load-bearing", "cosmetic"];

/** Le nombre de kernels synthétiques par défaut (prouve la virtualisation 200+ nœuds). */
export const DEFAULT_TREE_SIZE = 240;

/**
 * demoComposes compose la STRUCTURE-démo de l'arbre via le twin pur (la forme exacte que le
 * rendu virtualisé consomme : libellé, niveau, facette, profondeur, ordonnée verticale §23 puis
 * id, sans orphelin). PURE & TOTALE : même N → même arbre.
 */
export function demoComposes(n: number = DEFAULT_TREE_SIZE): TreeNode[] {
	const flat: KernelNode[] = syntheticComposes(n);
	const res = buildKernelTree(flat);
	return res.ok ? res.roots : [];
}

/**
 * ownMirrorOf — le voyant own_mirror DÉMO d'un nœud, dérivé déterministiquement de son id
 * (tant que le store n'expose pas les voyants réels — OpenQuestion). Une minorité stable de
 * nœuds est ROUGE pour que le drill-down §110 ait un chemin à montrer ; tout le reste est VERT.
 * PURE & TOTALE : même id → même voyant. Aucun aléa.
 */
export function ownMirrorOf(id: string): OwnMirror {
	// un hash trivial, stable et déterministe de l'id (pas d'horloge, pas d'aléa).
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	// ~1 nœud sur 17 est rouge (assez rare pour rester lisible, assez fréquent pour un chemin).
	return Math.abs(h) % 17 === 0 ? "RED" : "GREEN";
}

/**
 * weightOf — le poids d'arête DÉMO entre un parent et un enfant, dérivé déterministiquement de
 * l'enfant (load-bearing par défaut — un défaut d'enfant porteur rouvre le tout ; quelques arêtes
 * cosmétiques pour la légende). PURE & TOTALE.
 */
export function weightOf(childId: string): ComposesWeight {
	let h = 0;
	for (let i = 0; i < childId.length; i++)
		h = (h * 31 + childId.charCodeAt(i)) | 0;
	return Math.abs(h) % 5 === 0 ? "cosmetic" : "load-bearing";
}

/**
 * toComposesTree — projette l'arbre structurel (TreeNode[]) en l'arbre `composes` que
 * `tree_aggregate` consomme (la forme `tree` du serveur Go) : chaque nœud porte son voyant
 * own_mirror démo + son seuil d'activation, chaque arête parent→enfant son poids. PURE & TOTALE.
 * version = "v1" partout (la version réelle viendra du store — OpenQuestion documentée).
 */
export function toComposesTree(roots: TreeNode[]): ComposesTreeArg {
	const nodes: ComposesNodeArg[] = [];
	const edges: ComposesEdgeArg[] = [];
	const walk = (n: TreeNode, parentId: string | null) => {
		nodes.push({
			layer_id: n.id,
			version: "v1",
			own_mirror: ownMirrorOf(n.id),
			activation_threshold: 0,
		});
		if (parentId !== null) {
			edges.push({
				parent: { id: parentId, version: "v1" },
				child: { id: n.id, version: "v1" },
				weight: weightOf(n.id),
			});
		}
		for (const c of n.children) walk(c, n.id);
	};
	for (const r of roots) walk(r, null);
	return { nodes, edges };
}

/**
 * demoAggregate — le verdict §109 + drill-down §110 DÉMO au racine, reproduit localement par
 * la même loi récursive que le Go `composes.Aggregate` (VERT ⟺ own_mirror vert ∧ chaque
 * enfant agrège VERT ; le drill-down nomme la chaîne jusqu'au premier enfant rouge). PURE &
 * TOTALE : même arbre → même verdict. C'est l'image EXACTE que le live renverrait pour ces états
 * — le twin sit derrière source:"demo", identique en forme au verdict Go autoritatif.
 */
export function demoAggregate(
	roots: TreeNode[],
	rootId: string,
): AggregateVerdict {
	const tree = toComposesTree(roots);
	const own = new Map<string, OwnMirror>();
	for (const n of tree.nodes) own.set(n.layer_id, n.own_mirror);
	const childrenOf = new Map<string, string[]>();
	for (const e of tree.edges) {
		const b = childrenOf.get(e.parent.id);
		if (b === undefined) childrenOf.set(e.parent.id, [e.child.id]);
		else b.push(e.child.id);
	}
	const aggregate = (id: string): { verdict: OwnMirror; path: DrillStep[] } => {
		const ownMirror = own.get(id) ?? "RED";
		if (ownMirror === "RED") {
			return {
				verdict: "RED",
				path: [
					{ layerId: id, version: "v1", ownMirror: "RED", aggregate: "RED" },
				],
			};
		}
		let verdict: OwnMirror = "GREEN";
		let redChildPath: DrillStep[] = [];
		for (const childId of childrenOf.get(id) ?? []) {
			const r = aggregate(childId);
			if (r.verdict === "RED" && verdict === "GREEN") {
				verdict = "RED";
				redChildPath = r.path;
			}
		}
		const step: DrillStep = {
			layerId: id,
			version: "v1",
			ownMirror,
			aggregate: verdict,
		};
		if (verdict === "GREEN") return { verdict: "GREEN", path: [step] };
		return { verdict: "RED", path: [step, ...redChildPath] };
	};
	const r = aggregate(rootId);
	return { verdict: r.verdict, drillDown: r.path, cycle: [] };
}
