/**
 * The checkout-payment-shipping SagaInvariant + its evaluation rows + the CoherenceTest for the
 * /sagas panel (AIDOS step S49).
 *
 * The saga is the KRD §49.2 canonical example, VERBATIM — the agent invents no participant,
 * event, cert_language, or property branch beyond the frozen §49.2 vocabulary. The evaluation
 * rows are the fixture rows of tests/kernel/checkout-payment-shipping_saga.fixture.md: the page
 * runs the PURE evaluator (lib/saga.ts, the projection of back/kernel/sagas) over each, so each
 * outcome badge is computed, never declared.
 *
 * No truth is invented as fact: the saga is a CANDIDATE source used to exercise the evaluator —
 * the wall is untouched.
 */

import type { CoherenceTest, Heads, SagaInvariant, Trace } from "./saga";

/** The KRD §49.2 checkout-payment-shipping saga, verbatim. */
export const CHECKOUT_PAYMENT_SHIPPING: SagaInvariant = {
	name: "checkout-payment-shipping",
	scope: "federation_policy",
	participants: [
		{
			cell: "order",
			commits: ["order_confirmed"],
			compensation: [{ id: "cancelOrder", version: "v2" }],
		},
		{
			cell: "payment",
			commits: ["payment_captured"],
			compensation: [{ id: "refundPayment", version: "v3" }],
		},
		{
			cell: "shipping",
			commits: ["shipping_scheduled"],
			compensation: [],
		},
	],
	property:
		"payment_captured implies (order_confirmed or compensation_executed)",
	certLanguage: "statechart",
};

/** An evaluation row: a human label, the trace, and whether the saga runs compensation first. */
export interface EvaluationRow {
	key: string;
	label: string;
	trace: Trace;
	runCompensation: boolean;
}

/**
 * The evaluation rows of the checkout-payment-shipping fixture: the happy path (satisfied), the
 * failed-leg-with-compensation (satisfied VIA compensation — THE done case), and the
 * dangling-money monster (violated / SAGA_INVARIANT_VIOLATED).
 */
export const EVALUATION_ROWS: readonly EvaluationRow[] = [
	{
		key: "happy",
		label: "Chemin nominal — chaque jambe commit",
		trace: ["order_confirmed", "payment_captured", "shipping_scheduled"],
		runCompensation: false,
	},
	{
		key: "compensated",
		label: "Jambe en échec après payment_captured — la compensation s'exécute",
		trace: ["order_confirmed", "payment_captured", "shipping_failed"],
		runCompensation: true,
	},
	{
		key: "dangling",
		label: "Paiement capturé, ni commande confirmée ni compensation",
		trace: ["payment_captured"],
		runCompensation: false,
	},
] as const;

/** The KRD §49.2 CoherenceTest, verbatim: the pinned consumed contracts. */
export const CHECKOUT_COHERENCE_TEST: CoherenceTest = {
	contracts: [
		{ id: "order.events", version: "v3" },
		{ id: "payment.commands", version: "v2" },
	],
	property:
		"aucun événement consommé n'est produit par une version incompatible",
};

/** Heads where payment.commands has moved past the pinned v2 ⇒ incompatible. */
export const HEADS_INCOMPATIBLE: Heads = {
	"order.events": "v3",
	"payment.commands": "v4",
};

/** Heads where every consumed contract is at head ⇒ coherent. */
export const HEADS_COHERENT: Heads = {
	"order.events": "v3",
	"payment.commands": "v2",
};
