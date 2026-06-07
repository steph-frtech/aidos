"use server";

import type { Source } from "@/lib/gateway-sdk";
import { type GoalStream, streamGoal } from "@/lib/goal-stream";

/**
 * /goal-stream Server Actions (S60). It reads the LIVE open goal of the active project
 * through the typed S58 gateway via the S59 SDK (the below-the-line `changeset_status`
 * read), decoded with a PURE decoder, with the deterministic demo twin preserved as the
 * fallback (`source: "live" | "demo"`). THE WALL (§2): a read only — opening/closing a
 * goal is a truth-write owned by the CLI writer role via propose → ChangeSet.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback are pure; the
 * streamed red set EQUALS the engine-computed red set for the known goal (no re-derivation).
 */

export interface GoalStreamView {
	data: GoalStream;
	source: Source;
}

export async function streamGoalAction(
	identity: string,
	activeProject: string,
): Promise<GoalStreamView> {
	return streamGoal({ identity, activeProject });
}
