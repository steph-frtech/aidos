/**
 * The canonical §42 red-wave examples for the /red-wave panel (AIDOS step S22).
 *
 * The shape reuses the fixture mirror's example artifacts (Order / Order.schema.fixture /
 * api/db/types / submit-btn / createOrder / checkout-view / label-btn) — the SAME graphs the Go
 * fixture (back/runtime/redwave/redwave_fixture_test.go) pins. The agent coins no new target, no
 * new business rule: these are the METHOD's examples. The wave is EXACTLY the set of stale links
 * (§42), ordered mirror-first (§42/§98). "Load-bearing" is the declared composes weight (S18/S19
 * §112; ADR 0020).
 *
 * THE DONE CRITERIA are visible here: an Order entity bump reddens its mirror FIRST then
 * api/db/types (part 1); a load-bearing submit-btn bump reddens checkout-view (part 2); a cosmetic
 * label-btn bump does NOT redden checkout-view (the negative).
 */

import type { Edge, Heads } from "./red-wave";

/** A bump scenario: the bumped source, the link graph it reddens, the heads after the bump. */
export interface BumpCase {
	id: string;
	/** i18n key for the human label of this bump. */
	labelKey: "bumpEntity" | "bumpLoadBearing" | "bumpCosmetic";
	bumped: string[];
	edges: Edge[];
	heads: Heads;
	/** the bump's content hash — the wave_id this bump opens (example only). */
	waveId: string;
}

function e(
	kind: Edge["link"]["kind"],
	from: string,
	to: string,
	loadBearing: boolean,
	layer: Edge["layer"],
): Edge {
	return {
		link: {
			kind,
			from: { id: from, version: "v1" },
			to: { id: to, version: "v1" },
		},
		loadBearing,
		layer,
	};
}

/** Fixture A — the canonical entity bump (mirror-first then api/db/types). */
export const ORDER_BUMP: BumpCase = {
	id: "Order",
	labelKey: "bumpEntity",
	bumped: ["Order"],
	edges: [
		e("mirrors", "Order.schema.fixture", "Order", true, "mirror"),
		e("derives_from", "api", "Order", true, "projection"),
		e("derives_from", "db", "Order", true, "projection"),
		e("derives_from", "types", "Order", true, "projection"),
	],
	heads: { Order: "v2" },
	waveId: "bump-Order-v2",
};

/** Fixture B — a load-bearing button bump reddens its view. */
export const SUBMIT_BTN_BUMP: BumpCase = {
	id: "submit-btn",
	labelKey: "bumpLoadBearing",
	bumped: ["submit-btn"],
	edges: [e("derives_from", "checkout-view", "submit-btn", true, "button")],
	heads: { "submit-btn": "v2" },
	waveId: "bump-submit-btn-v2",
};

/** Fixture C — a cosmetic button bump does NOT redden its view (the negative). */
export const LABEL_BTN_BUMP: BumpCase = {
	id: "label-btn",
	labelKey: "bumpCosmetic",
	bumped: ["label-btn"],
	edges: [e("derives_from", "checkout-view", "label-btn", false, "button")],
	heads: { "label-btn": "v2" },
	waveId: "bump-label-btn-v2",
};

/** The canonical bumps, in stable render order. */
export const BUMP_CASES: readonly BumpCase[] = [
	ORDER_BUMP,
	SUBMIT_BTN_BUMP,
	LABEL_BTN_BUMP,
];
