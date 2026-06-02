/**
 * The canonical §122 semantic-merge triples for the /semantic-merge panel (AIDOS step S25).
 *
 * These are the SAME three cases the Go fixture (back/archive/merge/merge_fixture_test.go) pins —
 * the METHOD's example artifacts (refund, cart, pay-button, amount-field, promo-banner, help-link),
 * reused from prior pinned steps, never invented business rules:
 *
 *   - refund — THE done criterion: a textually-clean refund EU/US pair (disjoint deltas, git would
 *     auto-merge) with a RED merged-cut mirror ⇒ CONFLICT, refund ∈ conflicting_mirrors, BLOCKED.
 *   - cart   — two DISJOINT-line control changes (pay-button / amount-field) that break the SAME
 *     emergent invariant cart.own_mirror ⇒ CONFLICT (red git never sees).
 *   - view   — a free-space promo-banner / help-link pair ⇒ CLEAN (a candidate stable phase, S23).
 *
 * The panel renders the verdict mergeSemantic computes over each triple — it RE-COMPUTES nothing in
 * the front-end beyond the deterministic twin lib/semantic-merge.ts (the Go decider is authoritative).
 */

import type { Base, Branch } from "./semantic-merge";

/** One named example triple the panel can pick + run. */
export interface MergeExample {
	id: string;
	/** A short human label (rendered FR/EN via the page's labels). */
	titleKey: "refund" | "cart" | "view";
	base: Base;
	left: Branch;
	right: Branch;
}

export const EXAMPLES: MergeExample[] = [
	{
		// THE done criterion — clean text, red mirror, BLOCKED.
		id: "refund",
		titleKey: "refund",
		base: {
			id: "v0",
			cut: { refund: "v1" },
			sensors: [{ id: "refund", pass: true }],
		},
		left: {
			ancestor: "v0",
			deltas: { "refund-eu": "v2-EU" },
			addedSensors: [{ id: "refund", pass: false }],
		},
		right: {
			ancestor: "v0",
			deltas: { "refund-us": "v2-US" },
			addedSensors: [],
		},
	},
	{
		// Two disjoint-line changes breaking the same emergent invariant — CONFLICT git never sees.
		id: "cart",
		titleKey: "cart",
		base: {
			id: "cart-v0",
			cut: { cart: "v1" },
			sensors: [{ id: "cart.own_mirror", pass: true }],
		},
		left: {
			ancestor: "cart-v0",
			deltas: { "pay-button": "v2" },
			addedSensors: [{ id: "cart.own_mirror", pass: false }],
		},
		right: {
			ancestor: "cart-v0",
			deltas: { "amount-field": "v2" },
			addedSensors: [],
		},
	},
	{
		// Free-space additions, fully-green merged cut — CLEAN (a candidate stable phase).
		id: "view",
		titleKey: "view",
		base: {
			id: "view-v0",
			cut: { view: "v1" },
			sensors: [{ id: "view.own_mirror", pass: true }],
		},
		left: {
			ancestor: "view-v0",
			deltas: { "promo-banner": "v2" },
			addedSensors: [{ id: "promo-banner.mirror", pass: true }],
		},
		right: {
			ancestor: "view-v0",
			deltas: { "help-link": "v2" },
			addedSensors: [{ id: "help-link.mirror", pass: true }],
		},
	},
];

/** The authority that resolves a merge conflict (an override, S16) — the method's example role. */
export const OVERRIDE_AUTHORITY = "human (above the waterline)";
