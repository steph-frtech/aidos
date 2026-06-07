"use server";

import { type GatedBlockReason, refuseUnauthenticated } from "@/lib/auth-gate";
import { authenticate, type Disposition, type Principal } from "@/lib/authn";

/**
 * /auth Server Actions (S61). Two action-capable controls behind the panel:
 *
 *   1. signInAction — resolves a verified principal (the Auth.js/OIDC session twin) and
 *      returns its propagated identity (the value that descends to BOTH walls). In a real
 *      deployment Auth.js performs the OIDC dance + the gateway verifies the JWT; here the
 *      deterministic twin authenticate() resolves the principal so the panel is executable
 *      offline. A blank subject yields UNAUTHENTICATED (no anonymous door).
 *   2. attemptUnauthenticatedAction — EXECUTES an unauthenticated call to a truth-write
 *      endpoint through the SAME gate the live server applies (auth → scope → zone). It is
 *      refused with the REAL UNAUTHENTICATED BlockReason, reaching no data — the property
 *      done-criterion, surfaced as an inline toast.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure projections over lib/authn + lib/auth-gate —
 * no DB, no clock, no LLM. THE WALL (§2): nothing here writes truth — auth lives outside
 * the Kernel; the gate refuses the write.
 */

export interface SignInView {
	authenticated: boolean;
	principal?: Principal;
	blockReason?: GatedBlockReason;
}

export async function signInAction(
	subject: string,
	email: string,
	provider: string,
): Promise<SignInView> {
	const disp: Disposition = "below_line";
	const d = authenticate({ identity: subject, email, provider }, disp);
	return {
		authenticated: d.outcome === "authenticated",
		principal: d.principal,
		blockReason: d.blockReason,
	};
}

export interface AttemptView {
	/** the UNAUTHENTICATED refusal, or null if the call unexpectedly reached routing. */
	reason: GatedBlockReason | null;
}

export async function attemptUnauthenticatedAction(
	activeProject: string,
	tool: string,
): Promise<AttemptView> {
	return { reason: refuseUnauthenticated(activeProject, tool) };
}
