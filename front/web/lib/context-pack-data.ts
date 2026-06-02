/**
 * The canonical §142/§143 ContextGraph + goal for the /context-pack panel (AIDOS step S33).
 *
 * The shape reuses the fixture mirror's example artifacts (checkout-apply-promo / view:cart /
 * control:promo-field / operation:applyPromo / billing:invoice-internals / PaymentGateway@hash /
 * old-promo-rule / refund-window) — the SAME snapshot the Go fixture
 * (back/runtime/context/context_router_fixture_test.go) and ExampleGraph pin. The router coins no
 * new business rule: these are the METHOD's examples. The pack is compiled from the red-set (S22,
 * reused), over the affected subgraph (§142), content-addressed (§143).
 *
 * THE DONE CRITERION is visible here: compiling checkout-apply-promo on main includes the checkout
 * subgraph + red mirrors + the crossed PaymentGateway@hash, and provably EXCLUDES
 * billing:invoice-internals (cross-BC), the stale old-promo-rule (stale), and refund-window
 * (out-of-scope).
 */

import type { ContextGraph, Goal } from "./context-pack";

/** The branches the panel can compile against (branch-aware; another branch's node never leaks). */
export const BRANCHES = ["main", "feature/cart-redesign"] as const;
export type Branch = (typeof BRANCHES)[number];

/** The checkout-apply-promo goal with its S22 red-set (reused, not recomputed). */
export const CHECKOUT_GOAL: Goal = {
	id: "checkout-apply-promo",
	boundedContext: "checkout",
	redSet: ["view:cart", "control:promo-field", "operation:applyPromo"],
	allowedPaths: ["/src/checkout/**"],
};

/** The §142 ContextGraph snapshot — checkout subgraph + a billing neighbor + a catalog sibling. */
export const CHECKOUT_GRAPH: ContextGraph = {
	layers: [
		{
			id: "view:cart",
			boundedContext: "checkout",
			branch: "main",
			loadBearing: true,
		},
		{
			id: "control:promo-field",
			boundedContext: "checkout",
			branch: "main",
			loadBearing: true,
		},
		{
			id: "operation:applyPromo",
			boundedContext: "checkout",
			branch: "main",
			loadBearing: true,
		},
		{
			id: "billing:invoice-internals",
			boundedContext: "billing",
			branch: "main",
			loadBearing: true,
		},
		{
			id: "catalog:product",
			boundedContext: "catalog",
			branch: "main",
			loadBearing: true,
		},
		// a node that exists ONLY on the feature branch — must never leak onto main.
		{
			id: "view:cart-v2",
			boundedContext: "checkout",
			branch: "feature/cart-redesign",
			loadBearing: true,
		},
	],
	mirrors: [
		{ id: "promo-field.fixture", boundedContext: "checkout", red: true },
		{ id: "applyPromo.workflow", boundedContext: "checkout", red: true },
		{ id: "canPlaceOrder.property", boundedContext: "checkout", red: false },
		{ id: "billing.dunning.fixture", boundedContext: "billing", red: false },
	],
	contracts: [
		{ id: "checkout-api@hash", boundedContext: "checkout", public: true },
		{ id: "PaymentGateway@hash", boundedContext: "billing", public: true },
		{ id: "billing-internal@hash", boundedContext: "billing", public: false },
	],
	memory: [
		{
			id: "idempotency-for-payment",
			kind: "lesson",
			scope: "checkout",
			confidence: "repeated",
			stale: false,
			approved: true,
		},
		{
			id: "out-of-stock-incident",
			kind: "incident",
			scope: "checkout",
			confidence: "repeated",
			stale: false,
			approved: true,
		},
		{
			id: "old-promo-rule",
			kind: "lesson",
			scope: "checkout",
			confidence: "repeated",
			stale: true,
			approved: true,
		},
		{
			id: "refund-window",
			kind: "lesson",
			scope: "billing",
			confidence: "repeated",
			stale: false,
			approved: true,
		},
	],
	skills: ["context", "tdd"],
	tools: ["context_compile"],
};
