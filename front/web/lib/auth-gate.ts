/**
 * auth-gate.ts — the deterministic TS twin of back/runtime/gateway/authgate.go (S61). It
 * composes the authentication gate (lib/authn, layer 0) UPSTREAM of the gateway router
 * (lib/gateway, layer 1). The ordering IS the defense:
 *
 *   authentication (layer 0) → scope (layer 1, projectWall) → zone (layer 1, registry)
 *                                                          ↘ RLS (layer 2, Postgres)
 *
 * An UNAUTHENTICATED call is refused BEFORE the router runs — it reaches no project data
 * (the property done-criterion). The verified identity is propagated into the scope (the
 * request body never sets it). DETERMINISM-FIRST: pure, same input → same decision
 * (pinned by lib/auth-gate.test.ts). The Go package is authoritative; this twin matches it.
 */

import {
	type AuthBlockReason,
	authenticate,
	CODE_UNAUTHENTICATED,
	type Principal,
} from "./authn";
import {
	type GatewayBlockReason,
	type Outcome as GatewayOutcome,
	lookup,
	route,
	type Tool,
} from "./gateway";
import type { Scope, Target } from "./projectWall";

/** The composed outcome — the gateway outcomes plus the upstream UNAUTHENTICATED refusal. */
export type GatedOutcome = GatewayOutcome | "unauthenticated";

/** The composed refusal shape — either an auth refusal (UNAUTHENTICATED) or a gateway one. */
export type GatedBlockReason = AuthBlockReason | GatewayBlockReason;

export interface GatedDecision {
	outcome: GatedOutcome;
	tool?: Tool;
	blockReason?: GatedBlockReason;
}

/**
 * authenticatedRoute mirrors Go Registry.AuthenticatedRoute exactly. It authenticates the
 * principal (refusing UNAUTHENTICATED upstream of routing — reaching no data), then routes
 * under the VERIFIED identity (never the caller-supplied scope identity). Pure + total.
 */
export function authenticatedRoute(
	principal: Principal,
	toolName: string,
	scope: Scope,
	target: Target,
): GatedDecision {
	const t = lookup(toolName);
	const disp =
		t && t.disposition === "truth_write" ? "truth_write" : "below_line";
	const auth = authenticate(principal, disp);
	if (auth.outcome === "unauthenticated") {
		return { outcome: "unauthenticated", blockReason: auth.blockReason };
	}
	// Propagate the VERIFIED identity into the scope — the request body never sets it.
	const verifiedScope: Scope = { ...scope, identity: principal.identity };
	const d = route(verifiedScope, toolName, target);
	return { outcome: d.outcome, tool: d.tool, blockReason: d.blockReason };
}

/**
 * refuseUnauthenticated EXECUTES an unauthenticated call to a truth-write endpoint through
 * the SAME gate the live server applies. It returns the real UNAUTHENTICATED BlockReason
 * (code + severity + explanation + how_to_fix), proving an anonymous call to a
 * truth-write reaches NO data (the property done-criterion). No truth written.
 */
export function refuseUnauthenticated(
	activeProject: string,
	tool: string,
): GatedBlockReason | null {
	const anon: Principal = { identity: "", email: "", provider: "" };
	const d = authenticatedRoute(
		anon,
		tool,
		{ identity: "", activeProject },
		{ projectId: activeProject, claimedIdentity: "" },
	);
	if (d.outcome !== "unauthenticated" || !d.blockReason) return null;
	return d.blockReason;
}

export { CODE_UNAUTHENTICATED };
