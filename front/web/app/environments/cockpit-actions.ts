"use server";

import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	approveBinding,
	type BindingChangeSet,
	cockpitMatrix,
	hashCockpitMatrix,
	isCockpitRefusal,
	proposeBinding,
	sensorStatus,
} from "@/lib/env-binding-cockpit";
import { route } from "@/lib/gateway";
import type { Scope } from "@/lib/projectWall";
import type { ApproveView, ProposeView, WallProbeView } from "./cockpit-view";

/**
 * Server Actions for the DP09 cockpit on /environments — « déclarer/éditer un
 * binding d'environnement » as propose → ChangeSet → approbation, reusing the
 * S58 MCP-over-HTTP gateway twin as THE door (changeset_open /
 * changeset_apply route below-the-line; kernel_write is REFUSED with
 * GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — the wall probe shows it on screen).
 *
 * THE WALL (CLAUDE.md §2): every action runs the PURE twin
 * lib/env-binding-cockpit (same input ⇒ identical outcome, never an LLM) —
 * the cockpit PROPOSES the content-addressed envelope and, on human approval,
 * applies it IN THE SANDBOX and recomputes the matrix as the PURE DP07
 * projection (parity-pinned ∀). It never writes the kernel: the real apply
 * lands through the changeset MCP / the aidos CLI.
 */

async function gatewayDoor(
	tool: string,
): Promise<{ door: string; refusedCode?: string; explanation?: string }> {
	const ctx = await activeProjectContext();
	const scope: Scope = {
		identity: "workbench-human",
		activeProject: ctx.activeId ?? "",
	};
	const decision = route(scope, tool, { projectId: ctx.activeId ?? "" });
	if (decision.outcome !== "route") {
		return {
			door: `${tool} → ${decision.outcome}`,
			refusedCode: decision.blockReason?.code,
			explanation: decision.blockReason?.explanation,
		};
	}
	return { door: `${tool} → route (${decision.tool?.server})` };
}

export async function proposeBindingAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const door = await gatewayDoor("changeset_open");
	if (door.refusedCode) {
		return {
			done: true,
			door: door.door,
			refusal: {
				code: "MALFORMED_PROPOSAL",
				message: door.explanation ?? door.refusedCode,
			},
		};
	}
	const out = await proposeBinding({
		environment: String(formData.get("environment") ?? ""),
		default_datastore: String(formData.get("datastore") ?? ""),
		url_pattern: String(formData.get("url_pattern") ?? ""),
		tls: formData.get("tls") === "on",
		network: String(formData.get("network") ?? ""),
		managed: formData.get("managed") === "on",
	});
	if (isCockpitRefusal(out)) {
		return { done: true, door: door.door, refusal: out };
	}
	return { done: true, door: door.door, proposal: out.changeset };
}

export async function approveBindingAction(
	_prev: ApproveView,
	formData: FormData,
): Promise<ApproveView> {
	const door = await gatewayDoor("changeset_apply");
	if (door.refusedCode) {
		return {
			done: true,
			door: door.door,
			refusal: {
				code: "MALFORMED_PROPOSAL",
				message: door.explanation ?? door.refusedCode,
			},
		};
	}
	const seededHash = String(formData.get("seededMatrixHash") ?? "");
	let proposal: BindingChangeSet;
	try {
		proposal = JSON.parse(
			String(formData.get("proposal") ?? ""),
		) as BindingChangeSet;
	} catch {
		return {
			done: true,
			door: door.door,
			refusal: {
				code: "MALFORMED_PROPOSAL",
				message:
					"the carried proposal is not a parsable envelope — re-propose from the form",
			},
		};
	}
	// approveBinding re-verifies the content address (anti-tamper) then applies
	// via the S20 state machine — pure, fail-closed.
	const out = approveBinding(proposal);
	if (isCockpitRefusal(out)) {
		return { done: true, door: door.door, refusal: out };
	}
	const applied = [out.applied];
	const matrixRows = cockpitMatrix(applied).filter(
		(r) => r.environment === out.applied.binding.environment,
	);
	const hash = await hashCockpitMatrix(applied);
	return {
		done: true,
		door: door.door,
		applied: out.applied,
		matrixRows,
		hash,
		sameAsSeeded: hash === seededHash,
		sensor: sensorStatus(),
	};
}

export async function wallProbeAction(
	_prev: WallProbeView,
	_formData: FormData,
): Promise<WallProbeView> {
	const ctx = await activeProjectContext();
	const scope: Scope = {
		identity: "workbench-human",
		activeProject: ctx.activeId ?? "",
	};
	const decision = route(scope, "kernel_write", {
		projectId: ctx.activeId ?? "",
	});
	return {
		probed: true,
		outcome: decision.outcome,
		blockReason: decision.blockReason,
	};
}
