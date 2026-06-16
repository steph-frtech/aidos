"use server";

import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { DEMO_MUTATION, type LiveMutationView, mutationDecoder } from "./live";

/**
 * /kernel-debt LIVE Server Action — read the engine's mutation verdict (the §40 densimètre run
 * the SURVIVING-MUTANTS debt category is consumed from) through the typed S58 gateway via the
 * S59 SDK (the below-the-line `run_mutation` tool of the mutation-runner server, dispatched
 * in-process by the passerelle), decoded with the PURE decoder from ./live, with the
 * deterministic demo verdict preserved as the fallback (`source: "live" | "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2/§8) ───────────────────────────────────────────────────────
 * run_mutation gates the report against the DECLARED threshold (read SELECT-only from `fitness`
 * — the agent is graded by it, never authors it) and appends the run below the line. The
 * action-capable suggest-only KernelDebt ledger above stays the demo; this section surfaces the
 * LIVE verdict + the surviving mutants alongside it (strictly additive cutover). /trim PROPOSES,
 * it never deletes — a READ of a below-the-line run.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder + the demo fallback (./live) are pure; a malformed / undispatched / refused
 * gateway answer (e.g. no runner wired) deterministically yields the demo verdict.
 */

export type { LiveMutationView } from "./live";

/**
 * liveMutation reads the engine's go-scope mutation verdict (live → demo fallback). With no raw
 * report and no installed runner the gateway answer is unavailable → the demo verdict; a wired
 * run surfaces the real verdict + the surviving mutants the debt ledger consumes.
 */
export async function liveMutation(): Promise<LiveMutationView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"run_mutation",
		{ scope: "go", run_id: "kernel-debt-panel", commit_or_phase_hash: "" },
		mutationDecoder,
		DEMO_MUTATION,
	);
	return { ...data, source };
}
