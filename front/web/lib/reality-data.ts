/**
 * Seed data for /incidents-to-ideas (AIDOS step S43) — the canonical fixture incident plus a
 * budget-breach incident whose signal does NOT pin a `proposes` kind (the OpenQuestion case).
 *
 * These mirror the Go fixture (back/runtime/reality/reality_fixture_test.go): the
 * out-of-stock-during-checkout incident (createOrder 30% fail) pins proposes=operation; the
 * latency-budget incident leaves proposes unset → OpenQuestion. The panel runs the SAME pure
 * lib/reality functions over these, so the screen matches the engine.
 */

import type { Incident } from "@/lib/reality";

/** THE canonical incident — createOrder fails 30%; an operation signal pins proposes=operation. */
export const OUT_OF_STOCK_INCIDENT: Incident = {
	id: "incident-out-of-stock-during-checkout",
	ref: "#1043",
	signal: {
		operation: "createOrder",
		error: "30% fail",
		recurrence: 312,
	},
	causeSketch: "item goes out-of-stock between add-to-cart and pay",
	taint: ["incident_derived"],
	linkedBranches: ["main"],
};

/** A budget-breach incident with NO operation — the signal does not pin a kind (OpenQuestion). */
export const LATENCY_BUDGET_INCIDENT: Incident = {
	id: "incident-checkout-latency-budget",
	ref: "#2099",
	signal: {
		operation: "",
		error: "p99 latency budget breached: 1.8s > 1.0s",
		recurrence: 47,
	},
	causeSketch: "checkout fan-out grew unbounded after the catalog merge",
	taint: ["incident_derived"],
	linkedBranches: ["main"],
};

export const SEED_INCIDENTS: Incident[] = [
	OUT_OF_STOCK_INCIDENT,
	LATENCY_BUDGET_INCIDENT,
];
