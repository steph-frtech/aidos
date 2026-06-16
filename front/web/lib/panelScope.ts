import { cookies } from "next/headers";
import { ACTIVE_PROJECT_COOKIE } from "./activeProject";
import type { Scope } from "./projectWall";

/**
 * panelScope.ts — the SERVER-SIDE active (identity, project) scope a read-only V1 panel
 * carries on its LIVE gateway reads (the S59 cutover).
 *
 * Each panel that reads the live truth-store through the typed SDK (lib/gateway-sdk →
 * gateway_call) needs the (identity, active_project) scope the passerelle keys its wall on
 * (S55/S57/S61). This module resolves it from the `AIDOS_PROJECT` cookie (the S57 selector,
 * sibling of `NEXT_LOCALE`) and the canonical Workbench identity.
 *
 * NO PROJECT SNAPSHOT (the cycle break): panelScope reads ONLY the cookie — it does NOT
 * fetch the live project list. The cookie value is the scope HINT; the gateway applies the
 * wall server-side, so an absent / stale cookie simply yields no live data (the panel falls
 * back to its demo fixture). This avoids the /projects ⇄ panelScope import cycle (the
 * /projects snapshot reads the gateway with this same scope) and keeps the read trivial.
 *
 * THE WALL (CLAUDE.md §2): this only READS — the active project is a read-scope selector,
 * never a write door; the scope is consumed by below-the-line reads (changeset_list,
 * store_history, dag_heads, project_list). A truth-write never originates from a panel.
 */

/** The canonical Workbench operator identity propagated on a panel's live reads. */
export const WORKBENCH_IDENTITY = "workbench-human";

/**
 * panelScope resolves the active (identity, project) scope for a server-side panel read,
 * straight from the S57 cookie. When no cookie is set the activeProject is empty (an
 * unscoped read — the gateway treats it as below-the-line, and the panel still falls back
 * to its demo fixture on any miss).
 */
export async function panelScope(): Promise<Scope> {
	const store = await cookies();
	const activeProject = store.get(ACTIVE_PROJECT_COOKIE)?.value ?? "";
	return { identity: WORKBENCH_IDENTITY, activeProject };
}
