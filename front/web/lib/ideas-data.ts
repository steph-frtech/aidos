/**
 * The canonical §116/§118 idea-lifecycle examples for the /ideas board (AIDOS step S27).
 *
 * These mirror the Go fixture back/kernel/ideas/ideas_fixture_test.go — the METHOD's example
 * artifacts ("order-discount-idea" and friends), illustrative per the S27 spec, never invented
 * business rules. The board shows the lifecycle made visible: a captured draft with intent +
 * provenance and the "no mirror yet" marker; the badge advancing grilled → spiking → harvested; the
 * blocked promotion of a harvested idea WITHOUT a mirror (NO_MIRROR_NO_KERNEL, idea stays harvested);
 * the Promoted path WITH a mirror (provenance back-link); a rejected idea kept in the rejected lane.
 *
 * Ids here are stable illustrative handles (not recomputed hashes) — the board renders the lifecycle
 * the pure twin lib/ideas.ts computes over them; the Go content-hash is authoritative for real rows.
 */

import type { Idea } from "./ideas";

/** The canonical board: one idea per lifecycle status, all sharing the discount intention thread. */
export const IDEAS: Idea[] = [
	{
		id: "idea-draft-1",
		proposes: "policy",
		intent: "give regulars a discount",
		provenance: { source: "human", detail: "finalement je veux une remise" },
		status: "draft",
	},
	{
		id: "idea-grilled-1",
		proposes: "operation",
		intent: "recompute the cart total when a coupon is applied",
		provenance: { source: "human", detail: "le total doit suivre le coupon" },
		status: "grilled",
	},
	{
		id: "idea-spiking-1",
		proposes: "operation",
		intent: "explore a fuzzy fraud-score heuristic before committing",
		provenance: { source: "incident", detail: "#1487" },
		status: "spiking",
	},
	{
		// THE done case: a harvested idea, promotable only WITH a mirror.
		id: "idea-harvested-1",
		proposes: "policy",
		intent: "regulars (>=5 orders) get 10% off",
		provenance: {
			source: "human",
			detail: "finalement je veux une remise pour les habitués",
		},
		status: "harvested",
	},
	{
		id: "idea-rejected-1",
		proposes: "policy",
		intent: "blanket discount for everyone",
		provenance: { source: "human", detail: "remise pour tout le monde" },
		status: "rejected",
		rejectReason: "duplicates existing policy",
	},
];

/** The mirror reference the human supplies at /goal for the harvested idea (the legal promotion). */
export const HARVESTED_MIRROR_REF = "mirror:order-discount-red-bdd";

/** The harvested idea the board uses to demonstrate both promotion paths (blocked vs Promoted). */
export const HARVESTED_IDEA: Idea = IDEAS.find(
	(i) => i.status === "harvested",
) as Idea;
