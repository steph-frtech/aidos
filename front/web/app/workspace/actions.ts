"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	canAccess,
	helloWorldRelPath,
	type ProvisionRequest,
	type ResourceUsage,
} from "@/lib/workspace";
import {
	DEMO_LIMITS,
	demoCheckResources,
	demoWorkspace,
	gatewayCanAccessArgs,
	gatewayCheckResourcesArgs,
	gatewayProvisionArgs,
} from "@/lib/workspace-data";
import { accessDecoder, resourceDecoder, workspaceDecoder } from "./live";

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
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). Every control now reads the LIVE
 * descriptor/verdict from the Go workspace MCP server through the passerelle (`readVia(scope,
 * "workspace_provision" | "workspace_can_access" | "workspace_check_resources", …)`, the dispatched
 * below-the-line reads), with the twin `lib/workspace` compute preserved ONLY as the deterministic
 * demo fallback (`lib/workspace-data`, tagged `source:"live"|"demo"`). The actions NO LONGER call the
 * twin functions client-side. The `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits
 * behind the demo fallback, never as the live source).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Provision/access/resource are PURE dry-run value
 * computations; the truth-store is OUTSIDE every workspace root (reaching it is exactly a
 * SANDBOX_ESCAPE). Determinism-first (§6/§8): a malformed / undispatched / refused answer yields the
 * deterministic demo verdict; the verdicts are code, never an LLM.
 */

function requestFor(projectId: string, vcs = "git"): ProvisionRequest {
	return { projectId, vcs, limits: DEMO_LIMITS };
}

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
	source?: "live" | "demo";
}

/**
 * provisionAction — the PROVISION control (CLAUDE.md §7 ui-completeness): the user names a project,
 * and the action reads its isolated workspace descriptor LIVE from the Go engine through the passerelle
 * (the twin demoWorkspace is the deterministic fallback) and confirms a confined hello-world builds
 * green inside. WRITES NOTHING (the wall — provisioning is a dry-run value, WroteKernel always false).
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
	const req = requestFor(projectId, vcs);
	const scope = await panelScope();
	const { data: ws, source } = await readVia(
		scope,
		"workspace_provision",
		gatewayProvisionArgs(req),
		workspaceDecoder,
		demoWorkspace(req),
	);
	const rel = helloWorldRelPath();
	return {
		ok: true,
		id: ws.id,
		projectId: ws.project_id,
		root: ws.root,
		zones: ws.zones,
		vcs: ws.repo.vcs,
		helloRelPath: rel,
		// the hello-world is confined iff it lives under the workspace root — a deterministic
		// verdict over the (live or demo) root.
		helloGreen: canAccess(ws, `${ws.root}/${rel}`).allowed,
		source,
	};
}

export interface AccessView {
	ok: boolean;
	error?: string;
	allowed?: boolean;
	blockCode?: string;
	target?: string;
	root?: string;
	source?: "live" | "demo";
}

/**
 * accessAction — the ACCESS-CHECK control: given a project and a target path, the cross-project
 * isolation verdict read LIVE from the Go engine (the twin demoAccess is the deterministic fallback).
 * A path under another project's root, or the truth-store, is refused with SANDBOX_ESCAPE. WRITES
 * NOTHING (the wall).
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
	const req = requestFor(projectId);
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"workspace_can_access",
		gatewayCanAccessArgs(target, req),
		accessDecoder,
		canAccess(demoWorkspace(req), target),
	);
	return {
		ok: true,
		allowed: data.allowed,
		blockCode: data.blockCode,
		target,
		root: demoWorkspace(req).root,
		source,
	};
}

export interface ResourceView {
	ok: boolean;
	error?: string;
	killed?: boolean;
	reason?: string;
	blockCode?: string;
	source?: "live" | "demo";
}

/**
 * resourceAction — the RESOURCE-CHECK control (anti noisy-neighbor): given a project and a sampled
 * usage, the kill verdict against the declared caps read LIVE from the Go engine (the twin
 * demoCheckResources is the deterministic fallback). A runaway (CPU/mem/disk/wall over a positive cap)
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
	const usage: ResourceUsage = {
		memory_mb: num("memoryMB"),
		cpu_millis: num("cpuMillis"),
		wall_seconds: num("wallSeconds"),
		disk_mb: num("diskMB"),
	};
	const req = requestFor(projectId);
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"workspace_check_resources",
		gatewayCheckResourcesArgs(usage, req),
		resourceDecoder,
		demoCheckResources(usage),
	);
	return {
		ok: true,
		killed: data.killed,
		reason: data.reason,
		blockCode: data.blockCode,
		source,
	};
}
