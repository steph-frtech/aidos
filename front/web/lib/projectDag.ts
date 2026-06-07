/**
 * projectDag.ts — the deterministic TS twin of back/archive/projectdag (S56).
 *
 * S56 closes the version-space side of the multi-tenant foundation begun at S53–S55:
 * each project owns its OWN DAG genesis and its OWN content-addressed namespace, and
 * every §121 move (branch / checkout / rebranch) and the §122 merge stay strictly
 * INSIDE the project's frontier. A merge across two projects is refused with
 * CROSS_PROJECT_MERGE; a move onto a foreign node is refused with CROSS_PROJECT_NODE.
 *
 * This module mirrors the Go decider for the DETERMINISTIC PREDICATES the UI needs:
 *  - CONTENT NAMESPACE — `project/<id>/` (byte-identical to Go ContentNamespace);
 *  - FRONTIER — sameProject(a, b) is the exact mergeability predicate;
 *  - MERGE GUARD — mergeGuard(left, right) refuses CROSS_PROJECT_MERGE when the two
 *    sides belong to different projects (before any merge engine runs);
 *  - ARCHIVE/RESTORE — masking a project's version view never destroys its nodes.
 *
 * The genesis node id itself is a SHA-256 content hash computed by the Go authority
 * (records.Hash); this twin treats node ids as opaque and proves the FRONTIER logic
 * (isolation, append-only, refusals) that governs them — the part the screen executes.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6): pure, same input → same output (pinned by the
 * Vitest+fast-check twin lib/projectDag.test.ts). The Go package is authoritative; this
 * twin matches its predicates byte-for-byte. THE WALL: nothing here writes truth.
 */

export const CODE_CROSS_PROJECT_MERGE = "CROSS_PROJECT_MERGE" as const;
export const CODE_CROSS_PROJECT_NODE = "CROSS_PROJECT_NODE" as const;

export type BlockCode =
	| typeof CODE_CROSS_PROJECT_MERGE
	| typeof CODE_CROSS_PROJECT_NODE;

export interface BlockReason {
	code: BlockCode;
	severity: "error";
	explanation: string;
	howToFix: string[];
}

/** A logical DAG node — id is the opaque content address from the Go authority. */
export interface DagNode {
	id: string;
	parentIds: string[];
	head: boolean;
	label: string;
}

/** A project's slice of the version space — its frontier, genesis, nodes and mask state. */
export interface ProjectDag {
	projectId: string;
	genesisId: string;
	nodes: DagNode[];
	masked: boolean;
}

/** ContentNamespace mirrors Go — the per-project content-store key prefix. */
export function contentNamespace(projectId: string): string {
	return `project/${projectId}/`;
}

/** NamespaceKey scopes a logical key under a project's namespace. */
export function namespaceKey(projectId: string, key: string): string {
	return contentNamespace(projectId) + key;
}

/** sameNamespace reports whether a namespaced key belongs to the given project. */
export function sameNamespace(
	projectId: string,
	namespacedKey: string,
): boolean {
	return namespacedKey.startsWith(contentNamespace(projectId));
}

/** sameProject mirrors Go SameProject — the exact mergeability predicate. */
export function sameProject(a: string, b: string): boolean {
	return a === b && a.trim() !== "";
}

/** genesis builds a project's isolated version space from its (Go-derived) genesis id. */
export function genesis(
	projectId: string,
	genesisId: string,
	label: string,
): ProjectDag {
	return {
		projectId,
		genesisId,
		nodes: [{ id: genesisId, parentIds: [], head: true, label }],
		masked: false,
	};
}

/** contains reports whether a node id is inside the project's frontier. */
export function contains(pd: ProjectDag, nodeId: string): boolean {
	return pd.nodes.some((n) => n.id === nodeId);
}

/** heads returns the project's current heads — empty when archived (masked). */
export function heads(pd: ProjectDag): DagNode[] {
	if (pd.masked) return [];
	return pd.nodes.filter((n) => n.head);
}

/** headsIncludingMasked returns the heads even when archived (proving non-destruction). */
export function headsIncludingMasked(pd: ProjectDag): DagNode[] {
	return pd.nodes.filter((n) => n.head);
}

function crossProjectNodeReason(
	projectId: string,
	nodeId: string,
): BlockReason {
	return {
		code: CODE_CROSS_PROJECT_NODE,
		severity: "error",
		explanation:
			`Refus du mur de version : le nœud « ${nodeId} » n'appartient pas au projet « ${projectId} ». ` +
			"Une phase d'un autre projet est invisible depuis les heads de celui-ci.",
		howToFix: [
			"Naviguez uniquement sur des phases du projet courant — chaque projet a sa propre genèse DAG.",
			"Basculez sur le projet visé (project switcher, S57) pour travailler dans sa frontière.",
		],
	};
}

function crossProjectMergeReason(left: string, right: string): BlockReason {
	return {
		code: CODE_CROSS_PROJECT_MERGE,
		severity: "error",
		explanation:
			`Refus du mur de version : tentative de merge entre le projet « ${left} » et le projet « ${right} ». ` +
			"La frontière du projet est inviolable — deux espaces de version distincts ne se joignent jamais.",
		howToFix: [
			"Un merge ne s'opère qu'à l'INTÉRIEUR d'un même projet (branch/checkout/rebranch/merge dans sa frontière).",
			"Pour réutiliser une app comme base, utilisez duplicate-from-template (S56) — il forke une racine DAG isolée, il ne joint pas les projets.",
		],
	};
}

export interface MoveResult {
	dag: ProjectDag;
	event?: "Branched" | "HeadMoved" | "Rebranched";
	blockReason?: BlockReason;
}

/**
 * branch opens an alternative line inside the frontier. A foreign `from` is refused
 * with CROSS_PROJECT_NODE. Append-only: the new node is added, none removed. The new
 * node id is supplied by the caller (the Go authority computes the content hash).
 */
export function branch(
	pd: ProjectDag,
	from: string,
	newNodeId: string,
	label: string,
): MoveResult {
	if (!contains(pd, from)) {
		return { dag: pd, blockReason: crossProjectNodeReason(pd.projectId, from) };
	}
	const fromNode = pd.nodes.find((n) => n.id === from);
	const nodes = pd.nodes.map((n) =>
		fromNode?.head && n.id === from ? { ...n, head: false } : n,
	);
	nodes.push({ id: newNodeId, parentIds: [from], head: true, label });
	return { dag: { ...pd, nodes }, event: "Branched" };
}

/**
 * mergeGuard is the FRONTIER check (the part the screen executes): a merge across two
 * different projects is refused with CROSS_PROJECT_MERGE before any merge engine runs.
 * Same-project ⇒ allowed (the §122 semantic-merge oracle then decides clean/conflict).
 */
export function mergeGuard(
	leftProjectId: string,
	rightProjectId: string,
): { allowed: boolean; blockReason?: BlockReason } {
	if (!sameProject(leftProjectId, rightProjectId)) {
		return {
			allowed: false,
			blockReason: crossProjectMergeReason(leftProjectId, rightProjectId),
		};
	}
	return { allowed: true };
}

/** archive masks the project's version view without destroying its nodes (append-only). */
export function archive(pd: ProjectDag): ProjectDag {
	return { ...pd, masked: true };
}

/** restore un-masks an archived project's version view (the nodes were never destroyed). */
export function restore(pd: ProjectDag): ProjectDag {
	return { ...pd, masked: false };
}

/**
 * duplicate forks an ISOLATED root for a new project: a fresh genesis sharing NO node
 * with the source (a different project id ⇒ a different content address). The source is
 * unchanged. The destination genesis id is supplied by the Go authority.
 */
export function duplicate(
	dstProjectId: string,
	dstGenesisId: string,
	dstLabel: string,
): ProjectDag {
	return genesis(dstProjectId, dstGenesisId, dstLabel);
}
