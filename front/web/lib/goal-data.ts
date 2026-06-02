/**
 * Worked-example data for the /goal panel (S29). A single fresh goal opened from the canonical
 * idea-order-discount idea (the pinned S20/S22 example — no new ids coined): a DRAFT ChangeSet and a
 * one-element red set (Order.discount.fixture), with the non-gameable stop NOT satisfied while the
 * mirror is red, flipping to satisfied only when the red set is green and prior green is intact.
 *
 * This is FIXTURE data the action-capable panel drives — the panel computes the stop verdict from
 * lib/goal.ts (the twin of back/runtime/goal), so the screen renders EXACTLY what the engine computes.
 */

import type { Goal, StopInput } from "@/lib/goal";

/** The fresh goal — a DRAFT ChangeSet + a non-empty red set, status OPEN (the done criterion). */
export const ORDER_DISCOUNT_GOAL: Goal = {
	id: "goal-order-discount",
	ideaRef: "idea-order-discount",
	changeSetRef: "cs-order-discount-draft",
	changeSetStatus: "DRAFT",
	redSet: ["Order.discount.fixture"],
	status: "OPEN",
	budgets: { timeSeconds: 600, turns: 20, tokens: 100000 },
};

/** The initial live verdicts: the red-set mirror is RED ⇒ the stop is NOT satisfied. */
export const STOP_RED: StopInput = {
	sensors: { "Order.discount.fixture": "red" },
	priorGreen: "intact",
	mutation: 0.9,
	mutationFloor: 0.8,
	monsters: [],
};

/** After the agent turns the red set green AND prior green is intact ⇒ the stop is satisfied. */
export const STOP_GREEN: StopInput = {
	sensors: { "Order.discount.fixture": "green" },
	priorGreen: "intact",
	mutation: 0.9,
	mutationFloor: 0.8,
	monsters: [],
};
