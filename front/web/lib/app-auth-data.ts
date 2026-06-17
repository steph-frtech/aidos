/**
 * app-auth-data — the DETERMINISTIC demo fixtures for the /app-auth panel (S80; the ADR 0092
 * batch-4A flip). It holds the canonical emitted-app auth subsystem (the expanded User/Role/Session
 * + login/logout + the role-authz band), the runtime authz scenarios, the gateway-arg projections,
 * and the twin compute of them — the demo snapshots the panel falls back to when the gateway is
 * unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before this flip /app-auth computed its
 * displayed subsystem/verdict from the TS twin `lib/app-auth` directly — the twin WAS the live
 * source. The flip routes every control through the Go app-auth MCP server via the passerelle
 * (`readVia(scope, "app_auth_expand" | "app_auth_check_access" | "app_auth_attach", …)`, the
 * dispatched below-the-line reads); these fixtures are KEPT only as the deterministic fallback. The
 * presence of this `-data.ts` sibling is ALSO what makes the T5 cliquet (twin-as-live-fitness)
 * RECOGNISE `lib/app-auth` as a twin — the panel stays GREEN because it imports the `readVia`
 * frontier (the witness the twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every demo snapshot is the same PURE twin compute the Go
 * `appauth` runtime reproduces — same target → byte-identical subsystem; check_access is a PURE
 * role→operation lookup, NEVER an LLM.
 *
 * THE WALL (CLAUDE.md §2): expand/check_access write NOTHING; attach LANDS via an APPROVED ChangeSet
 * (propose → approve), WroteKernel always false (the kernel freeze is the aidos CLI's job downstream).
 */

import {
	checkAccess,
	type Decision,
	expandAppAuth,
	pieceCount,
	type Subsystem,
	sortedNames,
} from "./app-auth";
import type { Source } from "./gateway-sdk";

/** The canonical target app the panel demos the auth subsystem for. */
export const DEMO_TARGET = "shop-app";

/** demoSubsystem — the twin EXPAND of the canonical target (the demo `app_auth_expand` value). */
export function demoSubsystem(): Subsystem {
	return expandAppAuth(DEMO_TARGET);
}

/** The canonical runtime authz scenarios the panel demos (a viewer is refused manageRoles). */
export const ACCESS_SCENARIOS: { role: string; operation: string }[] = [
	{ role: "viewer", operation: "login" },
	{ role: "viewer", operation: "manageRoles" },
	{ role: "admin", operation: "manageRoles" },
];

/** demoAccess — the twin check_access of a (role, operation) scenario (the demo verdict). */
export function demoAccess(role: string, operation: string): Decision {
	return checkAccess(role, operation);
}

/**
 * gatewayExpandArgs maps the target to the Go `app_auth_expand` arg shape (snake-less — `target`).
 * PURE projection. A scalar object — no json.RawMessage body, the S59 transport scar avoided.
 */
export function gatewayExpandArgs(target: string): Record<string, unknown> {
	return { target };
}

/** gatewayCheckArgs maps a scenario to the Go `app_auth_check_access` arg shape (`role`/`operation`). */
export function gatewayCheckArgs(
	role: string,
	operation: string,
): Record<string, unknown> {
	return { role, operation };
}

/**
 * gatewayAttachArgs maps the target + the (optional) approval to the Go `app_auth_attach` arg shape.
 * land=false PREVIEWS the DRAFT; land=true requires the RFC3339 approved_at (the wall: propose →
 * approve). PURE projection; the Go server lands via changeset.Apply (WroteKernel always false).
 */
export function gatewayAttachArgs(
	target: string,
	land: boolean,
	approvedAt = "",
	parentPhase = "",
): Record<string, unknown> {
	const args: Record<string, unknown> = { target, land };
	if (parentPhase) args.parent_phase = parentPhase;
	if (approvedAt) args.approved_at = approvedAt;
	return args;
}

/** A typed source-tagged demo expansion (the shape a readVia decoder yields on the demo path). */
export interface AppAuthSnapshot {
	subsystem: Subsystem;
	pieceCount: number;
	pieces: string[];
	source: Source;
}

/** demoSnapshot — the full demo subsystem snapshot the panel renders when the gateway is unreachable. */
export function demoSnapshot(): AppAuthSnapshot {
	const subsystem = demoSubsystem();
	return {
		subsystem,
		pieceCount: pieceCount(subsystem),
		pieces: sortedNames(subsystem),
		source: "demo",
	};
}
