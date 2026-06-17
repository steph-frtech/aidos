"use server";

import { readVia } from "@/lib/gateway-sdk";
import type { ApprovedMirror, Target } from "@/lib/learn";
import {
	closeLoop,
	DEMO_EDGES,
	DEMO_HEADS,
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_TARGET,
	gatewayCloseArgs,
} from "@/lib/learn-data";
import { panelScope } from "@/lib/panelScope";
import { outcomeDecoder } from "./live";
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
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `closeLoopAction` now reads the
 * LIVE loop-closure outcome from the Go learn MCP server through the passerelle
 * (`readVia(scope, "close_loop", …)`, the dispatched below-the-line read), with the twin
 * `lib/learn-data.closeLoop()` preserved ONLY as the deterministic demo fallback
 * (`source:"live"|"demo"`). The `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits
 * behind the demo fallback, never as the live source).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the decoder + the demo fallback (the same pure twin compute
 * the Go engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo
 * outcome. THE WALL (§2): the loop WRITES NOTHING — the outcome is a value (wroteKernel=false; the
 * direct Reality→Kernel edge is always refused); the human authors the approved mirror at /goal,
 * never the agent — nothing learns its own fitness. A live close_loop is a below-the-line READ.
 */
export async function closeLoopAction(
	_prev: LearnView,
	formData: FormData,
): Promise<LearnView> {
	const reReflect = formData.get("reReflect") === "on";
	const mirror: ApprovedMirror = DEMO_MIRROR;
	// re-reflect: a target whose body ALREADY carries the reflection — re-attaching is a no-op
	// (no bump, an empty wave). Both the live args and the demo fallback key on this same target.
	const target: Target = reReflect
		? {
				...DEMO_TARGET,
				specBody: {
					...DEMO_TARGET.specBody,
					_reflections: [DEMO_MIRROR.mirrorId],
				},
			}
		: DEMO_TARGET;

	try {
		const scope = await panelScope();
		// LIVE read through the passerelle (the dispatched learn `close_loop` tool); the twin
		// closeLoop() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
		const { data, source } = await readVia(
			scope,
			"close_loop",
			gatewayCloseArgs(
				DEMO_INCIDENT_REF,
				mirror,
				target,
				DEMO_EDGES,
				DEMO_HEADS,
			),
			outcomeDecoder,
			closeLoop(DEMO_INCIDENT_REF, mirror, target, DEMO_EDGES, DEMO_HEADS),
		);
		return { ok: true, outcome: data, source };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
