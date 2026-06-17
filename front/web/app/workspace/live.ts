import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";
import type {
	AccessDecision,
	Repo,
	ResourceVerdict,
	Workspace,
} from "../../lib/workspace";

/**
 * /workspace live reads — the decoders over the Go workspace MCP tools' output (S82; the ADR 0092
 * batch-4A flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions)
 * so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of the
 * live wire shape; the static Workspace / AccessDecision / ResourceVerdict are the front twin's types
 * it fills. It pins the decoders == the Go workspacesrv contract (provisionOutput{id, project_id,
 * root, zones, repo, limits, wrote_kernel} ; canAccessOutput{allowed, block_code, root} ;
 * checkResourcesOutput{killed, reason, block_code}), NOT a second implementation of the sandbox logic
 * (the Go workspace runtime is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo snapshot. THE WALL (§2): provisioning is a DRY-RUN descriptor (WroteKernel
 * always false); the truth-store is OUTSIDE every workspace root (reaching it is a SANDBOX_ESCAPE).
 */

function decodeRepo(raw: unknown): Repo | null {
	if (!isObject(raw)) return null;
	const vcs = str(raw.vcs);
	const worktree = str(raw.worktree);
	if (vcs === null || worktree === null) return null;
	return { vcs, worktree };
}

/** workspaceDecoder decodes the Go `provisionOutput` (snake_case project_id) into a Workspace. */
export const workspaceDecoder: Decoder<Workspace> = (
	raw: unknown,
): Workspace | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const id = str(raw.id);
	const projectId = str(raw.project_id);
	const root = str(raw.root);
	if (id === null || projectId === null || root === null) return null;
	const zones = arr(str)(raw.zones ?? []) ?? [];
	const repo = decodeRepo(raw.repo);
	const limits = isObject(raw.limits) ? raw.limits : {};
	return {
		id,
		project_id: projectId,
		root,
		zones,
		repo: repo ?? { vcs: "git", worktree: "" },
		limits: {
			max_memory_mb: num(limits.max_memory_mb) ?? 0,
			max_cpu_millis: num(limits.max_cpu_millis) ?? 0,
			max_wall_seconds: num(limits.max_wall_seconds) ?? 0,
			max_disk_mb: num(limits.max_disk_mb) ?? 0,
		},
	};
};

/** accessDecoder decodes the Go `canAccessOutput` (allowed/block_code) into the front AccessDecision. */
export const accessDecoder: Decoder<AccessDecision> = (
	raw: unknown,
): AccessDecision | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	if (typeof raw.allowed !== "boolean") return null;
	const blockCode = str(raw.block_code);
	const d: AccessDecision = { allowed: raw.allowed };
	if (blockCode !== null && blockCode !== "") d.blockCode = blockCode;
	return d;
};

/** resourceDecoder decodes the Go `checkResourcesOutput` (killed/reason/block_code) into a ResourceVerdict. */
export const resourceDecoder: Decoder<ResourceVerdict> = (
	raw: unknown,
): ResourceVerdict | null => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	if (typeof raw.killed !== "boolean") return null;
	const reasonRaw = str(raw.reason) ?? "";
	const reason =
		reasonRaw === "memory" ||
		reasonRaw === "cpu" ||
		reasonRaw === "wall" ||
		reasonRaw === "disk"
			? reasonRaw
			: "";
	const blockCode = str(raw.block_code);
	const v: ResourceVerdict = { killed: raw.killed, reason };
	if (blockCode !== null && blockCode !== "") v.blockCode = blockCode;
	return v;
};
