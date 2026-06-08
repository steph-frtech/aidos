"use server";

import {
	canAccess,
	checkResources,
	helloWorldRelPath,
	type Limits,
	provision,
} from "@/lib/workspace";

/**
 * Server Actions for the /workspace Workbench panel (S82 — « Bac à sable par projet »).
 *
 * THE STEP (ROADMAP-app-builder S82): an isolated workspace (container + git/jj repo + worktree +
 * CPU/mem/disk/time limits) per project where the generated code lives, compiles and runs its mirrors
 * — the ADR 0001 zones (/ideas /spike /src /kernel/spec) realized as REAL runtime workspaces, never
 * directories of this repo. Three action-capable controls: PROVISION (a project's isolated workspace),
 * ACCESS-CHECK (cross-project isolation — SANDBOX_ESCAPE), RESOURCE-CHECK (anti noisy-neighbor —
 * SANDBOX_RESOURCE_LIMIT kills a runaway).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Provision/access/resource are PURE dry-run value
 * computations (the deterministic twin lib/workspace, the byte-twin of the Go package); the truth-store
 * is OUTSIDE every workspace root (reaching it is exactly a SANDBOX_ESCAPE). Determinism-first
 * (§6/§8): the verdicts are code, never an LLM.
 */

const DEFAULT_LIMITS: Limits = {
	max_memory_mb: 512,
	max_cpu_millis: 2000,
	max_wall_seconds: 60,
	max_disk_mb: 1024,
};

export interface ProvisionView {
	ok: boolean;
	error?: string;
	id?: string;
	projectId?: string;
	root?: string;
	zones?: string[];
	vcs?: string;
	helloRelPath?: string;
	helloGreen?: boolean;
}

/**
 * provisionAction — the PROVISION control (CLAUDE.md §7 ui-completeness): the user names a project,
 * and the action provisions its isolated workspace (ADR 0001 zones, private git/jj worktree, declared
 * caps) and confirms a confined hello-world builds green inside. WRITES NOTHING (the wall).
 */
export async function provisionAction(
	_prev: ProvisionView,
	formData: FormData,
): Promise<ProvisionView> {
	const projectId = String(formData.get("projectId") ?? "").trim();
	if (!projectId) {
		return {
			ok: true,
			error: "id projet vide (l'honnêteté : jamais un workspace deviné)",
		};
	}
	const vcs = String(formData.get("vcs") ?? "git").trim() || "git";
	const ws = provision({ projectId, vcs, limits: DEFAULT_LIMITS });
	const rel = helloWorldRelPath();
	return {
		ok: true,
		id: ws.id,
		projectId: ws.project_id,
		root: ws.root,
		zones: ws.zones,
		vcs: ws.repo.vcs,
		helloRelPath: rel,
		helloGreen: canAccess(ws, `${ws.root}/${rel}`).allowed,
	};
}

export interface AccessView {
	ok: boolean;
	error?: string;
	allowed?: boolean;
	blockCode?: string;
	target?: string;
	root?: string;
}

/**
 * accessAction — the ACCESS-CHECK control: given a project and a target path, the cross-project
 * isolation verdict. A path under another project's root, or the truth-store, is refused with
 * SANDBOX_ESCAPE. WRITES NOTHING (the wall).
 */
export async function accessAction(
	_prev: AccessView,
	formData: FormData,
): Promise<AccessView> {
	const projectId = String(formData.get("projectId") ?? "").trim();
	const target = String(formData.get("target") ?? "").trim();
	if (!projectId || !target) {
		return { ok: true, error: "id projet et chemin cible requis" };
	}
	const ws = provision({ projectId, vcs: "git", limits: DEFAULT_LIMITS });
	const d = canAccess(ws, target);
	return {
		ok: true,
		allowed: d.allowed,
		blockCode: d.blockCode,
		target,
		root: ws.root,
	};
}

export interface ResourceView {
	ok: boolean;
	error?: string;
	killed?: boolean;
	reason?: string;
	blockCode?: string;
}

/**
 * resourceAction — the RESOURCE-CHECK control (anti noisy-neighbor): given a project and a sampled
 * usage, the kill verdict against the declared caps. A runaway (CPU/mem/disk/wall over a positive cap)
 * is killed with SANDBOX_RESOURCE_LIMIT. WRITES NOTHING (the wall).
 */
export async function resourceAction(
	_prev: ResourceView,
	formData: FormData,
): Promise<ResourceView> {
	const projectId = String(formData.get("projectId") ?? "").trim();
	if (!projectId) {
		return { ok: true, error: "id projet requis" };
	}
	const num = (k: string) => Number(formData.get(k) ?? 0) || 0;
	const ws = provision({ projectId, vcs: "git", limits: DEFAULT_LIMITS });
	const v = checkResources(ws, {
		memory_mb: num("memoryMB"),
		cpu_millis: num("cpuMillis"),
		wall_seconds: num("wallSeconds"),
		disk_mb: num("diskMB"),
	});
	return {
		ok: true,
		killed: v.killed,
		reason: v.reason,
		blockCode: v.blockCode,
	};
}
