"use server";

import { revalidatePath } from "next/cache";
import {
	BASELINE,
	candidateFor,
	computeRatchet,
	type MergeVerdict,
	type Regression,
	type Scenario,
} from "@/lib/mirrors";

/**
 * Server Action for the /mirrors Workbench panel — running the cliquet.
 *
 * THE WALL (CLAUDE.md §2): running the cliquet READS the mirror set and writes
 * only the run-log (runtime.mirror_runs), which sits BELOW the waterline. It
 * never writes truth (kernel/mirrors/fitness). So the panel may trigger a replay
 * directly: the action recomputes the merge verdict over a declared candidate
 * scenario using the PURE cliquet core (lib/mirrors.ts, the port of the Go
 * regression core) — no truth is written from the screen.
 *
 * DETERMINISM-FIRST: the verdict is a pure function of the declared scenario; the
 * action is a thin, side-effect-light wrapper (it only revalidates the route).
 *
 * The canonical capability door is the mirror-runner MCP (ADR 0009:
 * mirror_replay / ratchet_check). This server action reconciles to it via the
 * HTTP/API gateway at a later step (S36) — recorded OpenQuestion, not a blocker.
 */

export interface RatchetActionResult {
	ok: boolean;
	scenario: Scenario;
	verdict: MergeVerdict;
	regressed: Regression[];
	regressedIds: string[];
}

/** runRatchet replays the cliquet over the declared scenario and returns the verdict. */
export async function runRatchet(
	scenario: Scenario,
): Promise<RatchetActionResult> {
	const result = computeRatchet([...BASELINE], candidateFor(scenario));
	revalidatePath("/mirrors");
	return {
		ok: true,
		scenario,
		verdict: result.verdict,
		regressed: result.regressed,
		regressedIds: result.regressedIds,
	};
}
