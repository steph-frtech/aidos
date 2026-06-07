"use server";

import { type BlockReason, refuseTruthWrite } from "@/lib/blocks";

/**
 * /blocks Server Actions (S60). The action-capable control behind the panel's "attempt
 * the write" button: it EXECUTES a truth-zone tool through the gateway router (the same
 * server-side wall the live HTTP server applies, §2). A direct truth-write
 * (kernel_write / mirror_write / fitness_write) is refused with its REAL BlockReason
 * (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET), returned verbatim to render as an inline toast.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure projection over lib/blocks (which routes via
 * the lib/gateway twin of back/runtime/gateway) — no DB, no clock, no LLM. THE WALL (§2):
 * nothing here writes truth — the router refuses the write.
 */

export interface RefuseView {
	/** the refusal raised by the wall, or null if the call unexpectedly routed. */
	reason: BlockReason | null;
}

export async function refuseAction(
	identity: string,
	activeProject: string,
	tool: string,
): Promise<RefuseView> {
	return { reason: refuseTruthWrite(identity, activeProject, tool) };
}
