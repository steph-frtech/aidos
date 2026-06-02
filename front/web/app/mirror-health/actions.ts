"use server";

import { revalidatePath } from "next/cache";
import {
	type Completeness,
	computeCompleteness,
	DEMO_LAYERS,
	inventoryFor,
	type MirrorInventoryRow,
	mirrorsFor,
	type Scenario,
} from "@/lib/mirror-health";

/**
 * Server Action for the /mirror-health Workbench panel — computing the
 * completeness law over a declared cut of mirrors ⋈ kernel (AIDOS step S06).
 *
 * THE WALL (CLAUDE.md §2): computing completeness READS a projection of mirrors ⋈
 * kernel and returns the monster set + verdict. It writes NOTHING — mirrors and
 * kernel are above the waterline (truth), and this action only computes. So the
 * panel may run it directly: it is a read-only verdict, never a truth-write.
 *
 * DETERMINISM-FIRST: the verdict is a pure function of the declared scenario; the
 * action is a thin wrapper over the pure core (lib/mirror-health.ts, the port of
 * the Go records package) that only revalidates the route.
 *
 * The canonical capability door is the completeness/Stop-time enforcement hook
 * (the NEXT safe step, S12): this action surfaces the SAME predicate the hook
 * will call. The HTTP/API gateway reconciliation lands at S36 — recorded
 * OpenQuestion, not a blocker.
 */

export interface CompletenessActionResult {
	ok: boolean;
	scenario: Scenario;
	completeness: Completeness;
	inventory: MirrorInventoryRow[];
}

/** computeHealth runs the completeness law over a declared scenario cut. */
export async function computeHealth(
	scenario: Scenario,
): Promise<CompletenessActionResult> {
	const completeness = computeCompleteness(
		[...mirrorsFor(scenario)],
		[...DEMO_LAYERS],
	);
	revalidatePath("/mirror-health");
	return {
		ok: true,
		scenario,
		completeness,
		inventory: inventoryFor(scenario),
	};
}
