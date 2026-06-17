/**
 * workspace-data — the DETERMINISTIC demo fixtures for the /workspace panel (S82; the ADR 0092
 * batch-4A flip). It holds the canonical per-project workspace request (declared caps), the
 * cross-project isolation scenarios (a legal in-root path, an escape to the truth-store), the
 * resource-kill scenario, the gateway-arg projections, and the twin compute of them — the demo
 * snapshots the panel falls back to when the gateway is unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /workspace computed its
 * displayed descriptor/verdict from the TS twin `lib/workspace` directly — the twin WAS the live
 * source. The flip routes every control through the Go workspace MCP server via the passerelle
 * (`readVia(scope, "workspace_provision" | "workspace_can_access" | "workspace_check_resources" |
 * "workspace_build_hello", …)`, the dispatched below-the-line reads); these fixtures are KEPT only as
 * the deterministic fallback. The presence of this `-data.ts` sibling is ALSO what makes the T5
 * cliquet (twin-as-live-fitness) RECOGNISE `lib/workspace` as a twin — the panel stays GREEN because
 * it imports the `readVia` frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every demo snapshot is the same PURE twin compute the Go
 * `workspace` runtime reproduces — same request → byte-identical descriptor; provisioning is a
 * DRY-RUN value (WroteKernel always false).
 *
 * THE WALL (CLAUDE.md §2): the workspace root is below the line; the truth-store is OUTSIDE every
 * workspace root (reaching it is exactly a SANDBOX_ESCAPE). These fixtures and the panel WRITE NOTHING.
 */

import type { Source } from "./gateway-sdk";
import {
	type AccessDecision,
	canAccess,
	checkResources,
	type Limits,
	type ProvisionRequest,
	provision,
	type ResourceUsage,
	type ResourceVerdict,
	type Workspace,
} from "./workspace";

/** The canonical declared caps the panel demos a workspace with. */
export const DEMO_LIMITS: Limits = {
	max_memory_mb: 512,
	max_cpu_millis: 2000,
	max_wall_seconds: 60,
	max_disk_mb: 1024,
};

/** The canonical provision request (project + git VCS + the declared caps). */
export const DEMO_REQUEST: ProvisionRequest = {
	projectId: "proj-a",
	vcs: "git",
	limits: DEMO_LIMITS,
};

/** demoWorkspace — the twin PROVISION of the canonical request (the demo `workspace_provision` value). */
export function demoWorkspace(req: ProvisionRequest = DEMO_REQUEST): Workspace {
	return provision(req);
}

/** The canonical isolation scenarios the panel demos (a legal in-root path; an escape). */
export const ACCESS_SCENARIOS: { label: string; target: string }[] = [
	{ label: "in-root", target: "src/app.ts" },
	{ label: "truth-store-escape", target: ".aidos/truth-store/kernel.truth" },
];

/** demoAccess — the twin can_access of a target path (the demo isolation verdict). */
export function demoAccess(target: string): AccessDecision {
	return canAccess(demoWorkspace(), target);
}

/** A runaway usage that crosses the memory cap (the demo SANDBOX_RESOURCE_LIMIT kill). */
export const RUNAWAY_USAGE: ResourceUsage = {
	memory_mb: 4096,
	cpu_millis: 500,
	wall_seconds: 10,
	disk_mb: 100,
};

/** demoCheckResources — the twin check_resources of a sampled usage (the demo kill verdict). */
export function demoCheckResources(
	usage: ResourceUsage = RUNAWAY_USAGE,
): ResourceVerdict {
	return checkResources(demoWorkspace(), usage);
}

/**
 * gatewayProvisionArgs maps a ProvisionRequest to the Go `workspace_provision` arg shape: the caps
 * are FLAT, snake_case (the provisionInput contract — the go-sdk infers the non-pointer ints as
 * required, so all four caps are always supplied; 0 = no cap). PURE projection, never an LLM. A
 * scalar object — no json.RawMessage body, the S59 transport scar avoided.
 */
export function gatewayProvisionArgs(
	req: ProvisionRequest = DEMO_REQUEST,
): Record<string, unknown> {
	return {
		project_id: req.projectId,
		vcs: req.vcs ?? "git",
		max_memory_mb: req.limits.max_memory_mb,
		max_cpu_millis: req.limits.max_cpu_millis,
		max_wall_seconds: req.limits.max_wall_seconds,
		max_disk_mb: req.limits.max_disk_mb,
	};
}

/** gatewayCanAccessArgs — the `workspace_can_access` args: the provision fields + the target path. */
export function gatewayCanAccessArgs(
	target: string,
	req: ProvisionRequest = DEMO_REQUEST,
): Record<string, unknown> {
	return { ...gatewayProvisionArgs(req), target };
}

/** gatewayCheckResourcesArgs — the `workspace_check_resources` args: the provision fields + usage. */
export function gatewayCheckResourcesArgs(
	usage: ResourceUsage,
	req: ProvisionRequest = DEMO_REQUEST,
): Record<string, unknown> {
	return {
		...gatewayProvisionArgs(req),
		used_memory_mb: usage.memory_mb,
		used_cpu_millis: usage.cpu_millis,
		used_wall_seconds: usage.wall_seconds,
		used_disk_mb: usage.disk_mb,
	};
}

/** A typed source-tagged demo workspace (the shape a readVia decoder yields on the demo path). */
export interface WorkspaceSnapshot {
	workspace: Workspace;
	source: Source;
}

/** demoSnapshot — the full demo workspace snapshot the panel renders when the gateway is unreachable. */
export function demoSnapshot(
	req: ProvisionRequest = DEMO_REQUEST,
): WorkspaceSnapshot {
	return { workspace: demoWorkspace(req), source: "demo" };
}
