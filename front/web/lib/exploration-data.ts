/**
 * The canonical §75/§84/§118 exploration examples for the /exploration "Grill & Spike Lab" (S28).
 *
 * These mirror the Go journey tests/runtime/exploration.feature + the fixture
 * back/runtime/exploration/exploration_fixture_test.go — the METHOD's example artifacts (the "smarter
 * retries" fuzzy intention, the "promo code" sharp intention), illustrative per the S28 spec, never
 * invented business rules. The lab shows: a fuzzy intention grilled to spiking (ratchet OFF / T0); a
 * sharp intention grilled (skips spike); a bad idea rejected (traced); the spike-write list with a
 * /spike write allowed and a /kernel write blocked (SPIKE_WRITE_ESCAPES_ZONE); and the harvested
 * DRAFT-Truth proposal (no frozen version, no mirror).
 *
 * Ids are stable illustrative handles; the lab renders what the pure twin lib/exploration.ts computes.
 */

import type { Idea } from "./ideas";

/** The fuzzy idea that grills to spiking — the canonical /spike example. */
export const FUZZY_IDEA: Idea = {
	id: "idea-fuzzy-retries",
	proposes: "policy",
	intent: "something about smarter retries, not sure how",
	provenance: {
		source: "human",
		detail: "on perd des paiements sur des erreurs transitoires",
	},
	status: "draft",
};

/** The sharp idea that grills straight to grilled (skips /spike). */
export const SHARP_IDEA: Idea = {
	id: "idea-sharp-promo",
	proposes: "policy",
	intent: "checkout must accept a promo code",
	provenance: { source: "human", detail: "finalement je veux un code promo" },
	status: "draft",
};

/** The bad idea, rejected and traced. */
export const BAD_IDEA: Idea = {
	id: "idea-bad-keystroke",
	proposes: "operation",
	intent: "log every keystroke forever",
	provenance: { source: "human", detail: "garder une trace de tout" },
	status: "draft",
};

/** The spiking idea whose spike discovered the sharp intention to harvest. */
export const SPIKING_IDEA: Idea = {
	id: "idea-fuzzy-retries",
	proposes: "policy",
	intent: "something about smarter retries, not sure how",
	provenance: {
		source: "human",
		detail: "on perd des paiements sur des erreurs transitoires",
	},
	status: "spiking",
};

/** The durable lesson the spike discovered (harvested into the DRAFT-Truth proposal). */
export const SPIKE_DISCOVERY = "retry with capped exponential backoff";

/** The candidate spike writes the lab shows: one confined to /spike (allowed), one escaping (blocked). */
export const SPIKE_WRITES: { path: string }[] = [
	{ path: "/spike/retry-probe.go" },
	{ path: "/kernel/retry.policy" },
];
