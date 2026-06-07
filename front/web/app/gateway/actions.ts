"use server";

import {
	GATEWAY_SERVERS,
	type RouteDecision,
	route,
	tools,
} from "@/lib/gateway";
import {
	arr,
	callMeta,
	type Decoder,
	decodeVia,
	isObject,
	type Source,
	str,
} from "@/lib/gateway-sdk";

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
	/** S59 cutover: did the surface come from the live gateway, or the deterministic twin? */
	source: Source;
}

// The surface decoder, declared EXACTLY ONCE (the never-double-typed hinge): the static
// shape of the live gateway_tools / gateway_servers payloads is inferred from these.
const serversDecoder: Decoder<string[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(str)(raw.servers);
};
const toolDecoder: Decoder<{
	name: string;
	server: string;
	disposition: string;
}> = (raw) => {
	if (!isObject(raw)) return null;
	const name = str(raw.name);
	const server = str(raw.server);
	const disposition = str(raw.disposition);
	if (name === null || server === null || disposition === null) return null;
	return { name, server, disposition };
};
const toolsDecoder: Decoder<
	{ name: string; server: string; disposition: string }[]
> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(toolDecoder)(raw.tools);
};

/**
 * gatewaySurface returns the closed exposed surface (the 13 servers + their tools). S59
 * CUTOVER: it now reads the LIVE gateway via the typed SDK (callMeta → decodeVia) when
 * AIDOS_GATEWAY_HTTP_URL is set and the payload decodes; otherwise it falls back to the
 * DETERMINISTIC twin (lib/gateway), tagging `source:"live" | "demo"`. The decoder is the
 * single type source — the panel never double-types. THE WALL (§2): a read only.
 */
export async function gatewaySurface(): Promise<GatewaySurface> {
	const demoServers = [...GATEWAY_SERVERS];
	const demoTools = tools().map((t) => ({
		name: t.name,
		server: t.server,
		disposition: t.disposition,
	}));
	const srvRes = await callMeta("gateway_servers", {});
	const toolRes = await callMeta("gateway_tools", {});
	const srv = await decodeVia(srvRes, serversDecoder, demoServers);
	const tls = await decodeVia(toolRes, toolsDecoder, demoTools);
	// The surface is "live" only when BOTH meta-reads decoded from the live gateway.
	const source: Source =
		srv.source === "live" && tls.source === "live" ? "live" : "demo";
	return { servers: srv.data, tools: tls.data, source };
}
