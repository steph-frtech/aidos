/**
 * The KRD §114 worked "cart" example + the fire/admission rows for the /red-propagation panel
 * (AIDOS step S19).
 *
 * The shape is the §114 worked example: view "cart" composes three controls —
 * checkout-button (load-bearing), promo-field (load-bearing), help-link (cosmetic) — with a
 * DECLARED activation_threshold of 1. The refs reuse layer ids in the spirit of S11's pinned
 * control artifacts; the agent coins no new truth as fact: these are CANDIDATE rows (the FORM of
 * composes edges + a threshold, no freeze) used to exercise the weighted fire + the admission
 * discipline. Weights/thresholds are EXAMPLE-ONLY; a real project's are human-declared above the
 * line (honesty rule — never guessed, never learned).
 *
 * THE DONE CRITERIA are visible here: the help-link (cosmetic) change leaves the cart aggregate
 * GREEN (activation 0 < threshold 1); the checkout-button (load-bearing) change reddens it
 * (activation 1 ≥ 1); a `critical` weight declared WITHOUT evidence is REJECTED; WITH evidence it
 * is accepted.
 */

import type { Graph, Link, Weight } from "./red-propagation";

/** The §114 composition: view "cart" { activation_threshold: 1 } composes three controls. */
export const CART_PARENT_ID = "cart";

const EDGES: readonly Link[] = [
	{
		parent: { id: "cart", version: "v1" },
		child: { id: "checkout-button", version: "v1" },
		weight: "load-bearing",
	},
	{
		parent: { id: "cart", version: "v1" },
		child: { id: "promo-field", version: "v1" },
		weight: "load-bearing",
	},
	{
		parent: { id: "cart", version: "v1" },
		child: { id: "help-link", version: "v1" },
		weight: "cosmetic",
	},
];

/** buildCartGraph — the §114 "cart" composition with the named children marked changed. */
export function buildCartGraph(changed: readonly string[]): Graph {
	return {
		parents: {
			cart: { layerId: "cart", version: "v1", activationThreshold: 1 },
		},
		edges: EDGES,
		changed,
	};
}

/** The edges, in stable render order (for the weighted tree). */
export const CART_EDGES = EDGES;

/** A fire scenario row: a changed-set against the cart graph (§114). */
export interface FireRow {
	id: string;
	/** the i18n key for the human label of this changed-set */
	labelKey: "fireCosmetic" | "fireLoadBearing" | "fireNone" | "fireMixed";
	changed: readonly string[];
}

/** The §114 fire scenario rows — the cosmetic one is GREEN (done), the load-bearing one is RED. */
export const FIRE_ROWS: readonly FireRow[] = [
	{ id: "cosmetic", labelKey: "fireCosmetic", changed: ["help-link"] },
	{
		id: "load-bearing",
		labelKey: "fireLoadBearing",
		changed: ["checkout-button"],
	},
	{ id: "none", labelKey: "fireNone", changed: [] },
	{
		id: "mixed",
		labelKey: "fireMixed",
		changed: ["help-link", "checkout-button"],
	},
];

/** An admission row: a declared weight + (optional) evidence against ValidateWeight. */
export interface AdmissionRow {
	id: string;
	weight: Weight;
	weightEvidence?: string;
}

/** The admission rows — the critical-without-evidence one is REJECTED (done), with-evidence accepted. */
export const ADMISSION_ROWS: readonly AdmissionRow[] = [
	{ id: "cosmetic", weight: "cosmetic" },
	{ id: "load-bearing", weight: "load-bearing" },
	{ id: "critical-no-evidence", weight: "critical" },
	{
		id: "critical-with-evidence",
		weight: "critical",
		weightEvidence: "INC-2026-014",
	},
];
