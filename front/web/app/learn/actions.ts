"use server";

import {
	type ApprovedMirror,
	closeLoop,
	DEMO_EDGES,
	DEMO_HEADS,
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_TARGET,
} from "@/lib/learn";
import type { LearnView } from "./view";

/**
 * Server Actions for the /learn Workbench panel (S107 — incident → nouveau miroir → nouvelle dent,
 * app-builder EPIC 12 / E12).
 *
 * THE STEP: a RealityMirror (draft Idea, provenance=incident, S106) re-enters idée→grill→goal; on
 * HUMAN APPROVAL a NEW mirror (ex. out-of-stock-during-checkout) is attached, the policy/operation
 * HASH CHANGES, and a TARGETED red wave becomes the worklist (« facts change » résolu
 * mécaniquement). The done-criterion (executable from the screen): closing the loop on the approved
 * mirror bumps the createOrder operation's content address and seeds a mirror-first red wave.
 *
 * One control with a toggle drives both outcomes:
 *   - reReflect=off (default): attach the NEW approved mirror → the hash bumps → a targeted red
 *     wave becomes the worklist.
 *   - reReflect=on: re-attach an ALREADY-reflected mirror → NO bump, an EMPTY wave (a cosmetic
 *     re-reflection is not a new tooth).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): closeLoop runs the PURE twin lib/learn — same input →
 * byte-identical outcome, never an LLM. THE WALL (§2): the loop WRITES NOTHING — the outcome is a
 * value (wroteKernel=false; the direct Reality→Kernel edge is always refused); the human authors
 * the approved mirror at /goal, never the agent — nothing learns its own fitness.
 */
export async function closeLoopAction(
	_prev: LearnView,
	formData: FormData,
): Promise<LearnView> {
	const reReflect = formData.get("reReflect") === "on";
	try {
		if (reReflect) {
			// A target whose body ALREADY carries the reflection — re-attaching is a no-op.
			const target = {
				...DEMO_TARGET,
				specBody: {
					...DEMO_TARGET.specBody,
					_reflections: [DEMO_MIRROR.mirrorId],
				},
			};
			const mirror: ApprovedMirror = DEMO_MIRROR;
			const outcome = closeLoop(
				DEMO_INCIDENT_REF,
				mirror,
				target,
				DEMO_EDGES,
				DEMO_HEADS,
			);
			return { ok: true, outcome };
		}
		const outcome = closeLoop(
			DEMO_INCIDENT_REF,
			DEMO_MIRROR,
			DEMO_TARGET,
			DEMO_EDGES,
			DEMO_HEADS,
		);
		return { ok: true, outcome };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
