/**
 * goal-piloting-data — the DETERMINISTIC demo fixtures for the /goal-piloting panel (S66; the S59
 * cutover, ADR 0092). They hold the canonical "Amélie opens the Order.discount goal" proposal, its
 * LIVE red set, and the actor, as the demo values the panel falls back to when the gateway is
 * unreachable (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /goal-piloting computed
 * its displayed proposal + red set from the TS twin (lib/goal-piloting.pilotOpenGoal / liveRedSet)
 * directly — the twin WAS the live source. The cutover routes proposeGoalAction / the red-set read
 * through the Go goal-piloting MCP server via the passerelle (readVia(scope, "goal_pilot_open"/…)),
 * with these fixtures KEPT only as the deterministic fallback. The presence of this `-data.ts`
 * sibling is also what makes the T5 cliquet (twin-as-live-fitness) RECOGNISE lib/goal-piloting as a
 * twin — the panel stays GREEN because actions.ts imports the `readVia` frontier (the witness the
 * twin sits behind `source:"demo"`).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo proposal is the same value the Go
 * goalpiloting.PilotOpenGoal reproduces for the canonical input — byte-identical fields. The parity
 * mirror app/goal-piloting/live.test.ts pins the decoders' shapes == the Go openOutput/redSetOutput
 * contracts.
 *
 * THE WALL (CLAUDE.md §2): these are inert VALUES — the demo proposal carries a DRAFT (proposed)
 * ChangeSet, never APPLIED; the demo close is a verdict, never a CLOSED stamp.
 */

import type { OpenResult } from "../app/goal-piloting/live";

/** The canonical source idea + spec target the demo proposal is anchored to. */
export const DEMO_IDEA_ID = "idea-order-discount";
export const DEMO_SPEC_TARGET = "Order.discount";

/** The canonical authority-bearing actor (a real human, never a placeholder — the S63 gate). */
export const DEMO_ACTOR = {
	identity: "u-amelie",
	display: "Amélie Roy",
} as const;

/** The canonical LIVE red set (one failing mirror) the demo open derives — stable sorted. */
export const DEMO_RED_SET: string[] = ["Order.discount.fixture"];

/**
 * DEMO_OPEN_RESULT — the canonical successful open proposal: Amélie opens the Order.discount goal
 * from the grilled idea → a DRAFT ChangeSet PROPOSAL (cs:idea-order-discount, DRAFT) carrying the
 * live red set, status OPEN. The id/ref are content-anchored to the idea (agreeing with the Go
 * authority). A DRAFT proposal, never APPLIED (the wall).
 */
export const DEMO_OPEN_RESULT: OpenResult = {
	ok: true,
	goalId: `goal:${DEMO_IDEA_ID}`,
	ideaRef: DEMO_IDEA_ID,
	changeSetRef: `cs:${DEMO_IDEA_ID}`,
	changeSetStatus: "DRAFT",
	status: "OPEN",
	redSet: DEMO_RED_SET,
	actorIdentity: DEMO_ACTOR.identity,
	actorDisplay: DEMO_ACTOR.display,
};
