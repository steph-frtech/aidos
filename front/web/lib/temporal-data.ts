/**
 * The checkout-confirm-within-5m TemporalInvariant + its evaluation rows for the
 * /temporal-invariants panel (AIDOS step S50).
 *
 * The invariant is the KRD §49.3 canonical example, VERBATIM — the agent invents no clock, mirror
 * form, tolerance semantics, or property branch beyond the frozen §49.3 vocabulary. The four
 * evaluation rows are the fixture rows of
 * tests/kernel/checkout-confirm-within-5m_temporal_invariant.fixture.md: the page runs the PURE
 * evaluator (lib/temporal.ts, the projection of back/kernel/temporal) over each, so each verdict
 * badge is COMPUTED, never declared.
 *
 * No truth is invented as fact: the invariant is a CANDIDATE source used to exercise the
 * evaluator — the wall is untouched.
 */

import type { Observation, TemporalInvariant } from "./temporal";

/** The KRD §49.3 checkout-confirm-within-5m temporal invariant, verbatim (bound 5m, tolerance 10s). */
export const CHECKOUT_CONFIRM_WITHIN_5M: TemporalInvariant = {
	property: "payment_captured implies order_confirmed within 5 minutes",
	antecedent: "payment_captured",
	consequent: "order_confirmed",
	relation: "within",
	boundSeconds: 5 * 60,
	clock: "system",
	toleranceSeconds: 10,
	mirror: "statechart",
};

/** An evaluation row: a human label, the observation, and whether it is the inside-tolerance case. */
export interface EvaluationRow {
	key: string;
	label: string;
	observation: Observation;
	/** True for the 5m04s row — visibly inside tolerance so a human sees it is not a flake. */
	insideTolerance?: boolean;
}

/**
 * The four evaluation rows of the checkout-confirm-within-5m fixture: 4m58s held (inside bound),
 * 5m04s held (inside tolerance — NOT a flake), 5m20s violated (THE done case — outside tolerance),
 * and the out-of-order observation violated (§49.3 ordre des événements).
 */
export const EVALUATION_ROWS: readonly EvaluationRow[] = [
	{
		key: "inside-bound",
		label: "Confirmation à 4m58s — confortablement dans la borne",
		observation: {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 4 * 60 + 58,
		},
	},
	{
		key: "inside-tolerance",
		label: "Confirmation à 5m04s — dans la tolérance (5m + 4s ≤ 5m + 10s)",
		observation: {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 5 * 60 + 4,
		},
		insideTolerance: true,
	},
	{
		key: "over-tolerance",
		label: "Confirmation à 5m20s — hors tolérance, la propriété rougit",
		observation: {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 5 * 60 + 20,
		},
	},
	{
		key: "out-of-order",
		label:
			"order_confirmed AVANT payment_captured — l'ordre brise l'implication",
		observation: {
			eventOrder: ["order_confirmed", "payment_captured"],
			elapsedSeconds: 60,
		},
	},
] as const;
