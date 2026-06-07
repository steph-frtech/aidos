"use server";

import {
	archive,
	branch,
	CODE_CROSS_PROJECT_MERGE,
	CODE_CROSS_PROJECT_NODE,
	contains,
	duplicate,
	genesis,
	heads,
	headsIncludingMasked,
	mergeGuard,
	type ProjectDag,
	restore,
} from "@/lib/projectDag";

/**
 * /project-dag Server Actions (S56). Every action is a PURE, DETERMINISTIC projection
 * over lib/projectDag (the TS twin of back/archive/projectdag) — no DB, no clock, no LLM
 * (determinism-first, CLAUDE.md §6/§8). The frontier is an ALGORITHM (sameProject), not a
 * prompt. THE WALL (§2): nothing here writes truth — recording a DAG node rides the S24
 * `dag` MCP under the privileged writer. The live gateway path arrives at S58; until then
 * the version-space verdict is computed from the authoritative twin, byte-identical to Go.
 */

const SOURCE = "demo" as const;

export interface HeadView {
	id: string;
	label: string;
	head: boolean;
}

export interface DagView {
	source: typeof SOURCE;
	projectId: string;
	genesisId: string;
	namespace: string;
	masked: boolean;
	heads: HeadView[];
	keptCount: number;
	event?: string;
	blockCode?: string;
	explanation?: string;
	howToFix?: string[];
}

function toView(pd: ProjectDag, extra?: Partial<DagView>): DagView {
	return {
		source: SOURCE,
		projectId: pd.projectId,
		genesisId: pd.genesisId,
		namespace: `project/${pd.projectId}/`,
		masked: pd.masked,
		heads: heads(pd).map((n) => ({ id: n.id, label: n.label, head: n.head })),
		keptCount: headsIncludingMasked(pd).length,
		...extra,
	};
}

/**
 * branchAction is the action-capable control behind the panel's "branch" button: it cuts
 * a new phase INSIDE the project's frontier off `from`. A foreign node is refused with
 * CROSS_PROJECT_NODE — the version-space isolation done-criterion, executed from a screen.
 */
export async function branchAction(
	projectId: string,
	genesisId: string,
	from: string,
	label: string,
): Promise<DagView> {
	const pd = genesis(projectId, genesisId, `project:${projectId}`);
	const fromId = from.trim() === "" ? genesisId : from;
	// A new phase id is content-addressed by Go; here a deterministic logical id suffices.
	const newId = `${genesisId}/${label || "line"}`;
	const res = branch(pd, fromId, newId, label || "line");
	if (res.blockReason) {
		return toView(pd, {
			blockCode: res.blockReason.code,
			explanation: res.blockReason.explanation,
			howToFix: res.blockReason.howToFix,
		});
	}
	return toView(res.dag, { event: res.event });
}

/**
 * mergeGuardAction is the action-capable control behind the "merge" button: it runs the
 * FRONTIER guard. A merge across two different projects is refused with CROSS_PROJECT_MERGE
 * before any merge engine runs (the roadmap's named refusal), executed from a screen.
 */
export async function mergeGuardAction(
	leftProjectId: string,
	rightProjectId: string,
): Promise<{
	allowed: boolean;
	blockCode?: string;
	explanation?: string;
	howToFix?: string[];
}> {
	const g = mergeGuard(leftProjectId, rightProjectId);
	if (!g.allowed && g.blockReason) {
		return {
			allowed: false,
			blockCode: g.blockReason.code,
			explanation: g.blockReason.explanation,
			howToFix: g.blockReason.howToFix,
		};
	}
	return { allowed: true };
}

/**
 * duplicateAction is the control behind "duplicate-from-template": it forks an ISOLATED
 * root for a new project. The fork shares NO node with the source — proven by the disjoint
 * genesis id and the empty inherited history.
 */
export async function duplicateAction(
	dstProjectId: string,
): Promise<{ fork: DagView; isolated: boolean; srcGenesis: string }> {
	const srcGenesis = "src-genesis";
	const dstGenesis = `${dstProjectId}-genesis`;
	const fork = duplicate(dstProjectId, dstGenesis, `project:${dstProjectId}`);
	const isolated = !contains(fork, srcGenesis) && fork.genesisId !== srcGenesis;
	return { fork: toView(fork), isolated, srcGenesis };
}

/**
 * archiveAction is the control behind "archive": it masks the project's version view while
 * keeping every node (append-only). restoreAction un-masks it — nothing is destroyed.
 */
export async function archiveAction(
	projectId: string,
	genesisId: string,
): Promise<DagView> {
	let pd = genesis(projectId, genesisId, `project:${projectId}`);
	pd = branch(pd, genesisId, `${genesisId}/work`, "work").dag;
	return toView(archive(pd), { event: "Archived" });
}

export async function restoreAction(
	projectId: string,
	genesisId: string,
): Promise<DagView> {
	let pd = genesis(projectId, genesisId, `project:${projectId}`);
	pd = branch(pd, genesisId, `${genesisId}/work`, "work").dag;
	return toView(restore(archive(pd)), { event: "Restored" });
}

/** blockCodes returns the stable codes this version-space wall emits (panel legend). */
export async function blockCodes(): Promise<{ merge: string; node: string }> {
	return { merge: CODE_CROSS_PROJECT_MERGE, node: CODE_CROSS_PROJECT_NODE };
}
