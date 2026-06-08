/**
 * workspace — the S82 front twin of back/runtime/workspace (workspace.go). It is the PER-PROJECT
 * SANDBOX: an isolated workspace (container + git/jj repo + worktree + CPU/mem/disk/time limits) per
 * project, the runtime realization of the ADR 0001 managed-project zones (/ideas /spike /src
 * /kernel/spec). It reproduces the Go provisioning deterministically for the Workbench preview,
 * BYTE-IDENTICALLY (the same content-addressed workspace id).
 *
 * It does NOT fork the authoritative Go logic — the Go `Provision`/`CanAccess`/`ExceedsLimits` are the
 * single source; this TS twin reproduces them so the screen can show the SAME verdicts without a round
 * trip. The two non-negotiable guarantees are reproduced here:
 *
 *   - CROSS-PROJECT ISOLATION (SANDBOX_ESCAPE): project A can never access project B's tree/build nor
 *     the truth-store — every access is judged against the current workspace's root (default-deny).
 *   - RESOURCE-LIMIT KILL (SANDBOX_RESOURCE_LIMIT): a runaway (CPU/mem/disk/wall) is killed the instant
 *     a positive cap is crossed (anti noisy-neighbor).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE — same input → byte-identical
 * output. workspace.test.ts pins the byte-identity of the workspace id against the Go values.
 */

import { createHash } from "node:crypto";

/** TruthStoreRoot — the AIDOS truth-store prefix; OUTSIDE every workspace (the wall). Matches Go. */
export const TRUTH_STORE_ROOT = ".aidos/truth-store";
/** WorkspacesRoot — the parent under which every per-project workspace is mounted. Matches Go. */
export const WORKSPACES_ROOT = ".aidos/workspaces";
/** The ADR 0001 managed-project zones, realized inside each isolated workspace root. */
export const ZONES = ["ideas", "spike", "src", "kernel/spec"] as const;

export const VCS_GIT = "git";
export const VCS_JJ = "jj";

export interface Limits {
	max_memory_mb: number;
	max_cpu_millis: number;
	max_wall_seconds: number;
	max_disk_mb: number;
}

export interface ResourceUsage {
	memory_mb: number;
	cpu_millis: number;
	wall_seconds: number;
	disk_mb: number;
}

export interface Repo {
	vcs: string;
	worktree: string;
}

export interface Workspace {
	id: string;
	project_id: string;
	root: string;
	zones: string[];
	repo: Repo;
	limits: Limits;
}

export interface ProvisionRequest {
	projectId: string;
	vcs?: string;
	limits: Limits;
}

/** slug — normalize a project id into one safe path segment (no separators, no traversal). Go twin. */
function slug(projectId: string): string {
	let s = projectId.trim();
	s = s.replaceAll("/", "-");
	s = s.replaceAll("\\", "-");
	s = s.replaceAll("..", "-");
	s = s.replace(/^\.+|\.+$/g, "");
	return s === "" ? "unknown" : s;
}

/** cleanPath — minimal POSIX path.Clean twin (collapse //, resolve . and .., strip trailing /). */
function cleanPath(p: string): string {
	const rooted = p.startsWith("/");
	const out: string[] = [];
	for (const seg of p.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") {
			if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
			else if (!rooted) out.push("..");
			continue;
		}
		out.push(seg);
	}
	const joined = out.join("/");
	if (rooted) return `/${joined}`;
	return joined === "" ? "." : joined;
}

/** rootFor — the canonical workspace root of a project (WorkspacesRoot/<slug>). Go twin. */
function rootFor(projectId: string): string {
	return cleanPath(`${WORKSPACES_ROOT}/${slug(projectId)}`);
}

/** canonicalEncode — sorted keys, ordered arrays, no whitespace — matching records.Canonicalize. */
function canonicalEncode(v: unknown): string {
	if (v === null) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		const keys = Object.keys(obj).sort();
		return `{${keys
			.map((k) => `${JSON.stringify(k)}:${canonicalEncode(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

/** workspaceId — the content-addressed id over the canonical idBody (matches Go workspaceID). */
function workspaceId(ws: Omit<Workspace, "id">): string {
	const body = {
		project_id: ws.project_id,
		root: ws.root,
		zones: ws.zones,
		vcs: ws.repo.vcs,
		limits: ws.limits,
	};
	return createHash("sha256")
		.update(Buffer.from(canonicalEncode(body), "utf8"))
		.digest("hex");
}

/** provision — build the isolated per-project workspace. Pure, deterministic (Go twin). */
export function provision(req: ProvisionRequest): Workspace {
	const root = rootFor(req.projectId);
	const vcs = req.vcs === VCS_JJ ? VCS_JJ : VCS_GIT;
	const partial: Omit<Workspace, "id"> = {
		project_id: req.projectId,
		root,
		zones: [...ZONES],
		repo: { vcs, worktree: root },
		limits: req.limits,
	};
	return { id: workspaceId(partial), ...partial };
}

/** underRoot — pure prefix test: is target inside root? (cleaned both sides). Go twin. */
function underRoot(root: string, target: string): boolean {
	const r = cleanPath(root);
	const t = cleanPath(target);
	return t === r || t.startsWith(`${r}/`);
}

export interface AccessDecision {
	allowed: boolean;
	blockCode?: string;
}

/** canAccess — cross-project isolation verdict; refuses with SANDBOX_ESCAPE off-root. Go twin. */
export function canAccess(ws: Workspace, target: string): AccessDecision {
	if (underRoot(ws.root, target)) return { allowed: true };
	return { allowed: false, blockCode: "SANDBOX_ESCAPE" };
}

/** canObserve — two distinct workspaces are pairwise non-observable. Go twin. */
export function canObserve(a: Workspace, b: Workspace): boolean {
	if (a.id === b.id) return true;
	return underRoot(a.root, b.root);
}

/** canReachTruthStore — always false: the truth-store is outside every workspace (the wall). */
export function canReachTruthStore(ws: Workspace): boolean {
	return underRoot(ws.root, TRUTH_STORE_ROOT);
}

export type KillReason = "" | "memory" | "cpu" | "wall" | "disk";

export interface ResourceVerdict {
	killed: boolean;
	reason: KillReason;
	blockCode?: string;
}

function exceeds(used: number, cap: number): boolean {
	return cap > 0 && used > cap;
}

/** exceedsLimits — the anti-noisy-neighbor kill predicate (stable axis order). Go twin. */
export function exceedsLimits(l: Limits, u: ResourceUsage): ResourceVerdict {
	if (exceeds(u.memory_mb, l.max_memory_mb))
		return {
			killed: true,
			reason: "memory",
			blockCode: "SANDBOX_RESOURCE_LIMIT",
		};
	if (exceeds(u.cpu_millis, l.max_cpu_millis))
		return { killed: true, reason: "cpu", blockCode: "SANDBOX_RESOURCE_LIMIT" };
	if (exceeds(u.wall_seconds, l.max_wall_seconds))
		return {
			killed: true,
			reason: "wall",
			blockCode: "SANDBOX_RESOURCE_LIMIT",
		};
	if (exceeds(u.disk_mb, l.max_disk_mb))
		return {
			killed: true,
			reason: "disk",
			blockCode: "SANDBOX_RESOURCE_LIMIT",
		};
	return { killed: false, reason: "" };
}

/** checkResources — the workspace-level kill check against its declared caps. Go twin. */
export function checkResources(
	ws: Workspace,
	u: ResourceUsage,
): ResourceVerdict {
	return exceedsLimits(ws.limits, u);
}

/** helloWorldRelPath — the confined hello-world a fresh workspace builds+tests green inside. */
export function helloWorldRelPath(): string {
	return "src/main.go";
}

/** canBuildPath — does a build writing relPath (relative to root) stay confined? Go twin. */
export function canBuildPath(ws: Workspace, relPath: string): boolean {
	return canAccess(ws, cleanPath(`${ws.root}/${relPath}`)).allowed;
}
