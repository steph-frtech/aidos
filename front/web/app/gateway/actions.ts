"use server";

import {
	GATEWAY_SERVERS,
	type RouteDecision,
	route,
	tools,
} from "@/lib/gateway";

/**
 * /gateway Server Actions (S58). Every action is a PURE, DETERMINISTIC projection over
 * lib/gateway (the TS twin of back/runtime/gateway) — no DB, no clock, no LLM
 * (determinism-first, CLAUDE.md §6/§8): "pur routage, zéro LLM". The router is an
 * ALGORITHM, not a prompt. THE WALL (§2): nothing here writes truth — the gateway
 * routes a below-the-line call or refuses (cross-project / truth-write) with a
 * BlockReason. The live MCP-over-HTTP server (back/mcp/gateway) carries the same
 * router; until the front↔back wiring (S59 cutover) the verdict is computed from the
 * authoritative twin, byte-identical to the Go authority.
 */

export interface RouteView {
	outcome: string;
	toolName?: string;
	toolServer?: string;
	disposition?: string;
	code?: string;
	severity?: string;
	explanation?: string;
	howToFix?: string[];
}

/**
 * routeAction is the action-capable control behind the panel's "route" button: given
 * the active (identity, project) scope, a tool, and a target (project + optional forged
 * identity), it EXECUTES gateway.route and returns the decision — route (with the
 * dispatched tool), refused_scope (AGENT_CROSS_PROJECT_WRITE), refused_truth_write
 * (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET), or unknown_tool. The same wall the live
 * server applies, server-side.
 */
export async function routeAction(
	identity: string,
	activeProject: string,
	tool: string,
	targetProject: string,
	claimedIdentity: string,
): Promise<RouteView> {
	const d: RouteDecision = route({ identity, activeProject }, tool, {
		projectId: targetProject,
		claimedIdentity,
	});
	const view: RouteView = { outcome: d.outcome };
	if (d.tool) {
		view.toolName = d.tool.name;
		view.toolServer = d.tool.server;
		view.disposition = d.tool.disposition;
	}
	if (d.blockReason) {
		view.code = d.blockReason.code;
		view.severity = d.blockReason.severity;
		view.explanation = d.blockReason.explanation;
		view.howToFix = d.blockReason.howToFix;
	}
	return view;
}

export interface GatewaySurface {
	servers: string[];
	tools: { name: string; server: string; disposition: string }[];
}

/** gatewaySurface returns the closed exposed surface (the 13 servers + their tools). */
export async function gatewaySurface(): Promise<GatewaySurface> {
	return {
		servers: [...GATEWAY_SERVERS],
		tools: tools().map((t) => ({
			name: t.name,
			server: t.server,
			disposition: t.disposition,
		})),
	};
}
