/**
 * The canonical §43 stable-phase cuts for the /phase-stable panel (AIDOS step S23).
 *
 * The shape reuses the fixture mirror's example artifacts (createOrder / checkout-submit /
 * createOrder.fixture) — the SAME cuts the Go fixture (back/archive/phases/phases_fixture_test.go)
 * and `aidos stable` pin. The agent coins no new target, no new business rule: these are the
 * METHOD's examples.
 *
 * THE DONE CRITERIA are visible here: the EMPTY cut is STABLE (the base case); an all-green cut is
 * STABLE; a cut with one red sensor is UNSTABLE and names the offender; a cut with one stale link is
 * UNSTABLE and names it.
 */

import type { Cut, Heads, Link, SensorStatus } from "./phase-stable";

/** A cut scenario: the cut selection, the heads, the links in the cut, the sensor snapshot. */
export interface CutCase {
	id: string;
	/** i18n key for the human label of this cut. */
	labelKey: "cutEmpty" | "cutGreen" | "cutRedSensor" | "cutStaleLink";
	cut: Cut;
	heads: Heads;
	links: Link[];
	sensors: SensorStatus[];
}

function binds(from: string, fromV: string, to: string, toV: string): Link {
	return {
		kind: "binds",
		from: { id: from, version: fromV },
		to: { id: to, version: toV },
	};
}

/** The empty cut — vacuously STABLE (the base case). */
export const EMPTY_CUT: CutCase = {
	id: "empty",
	labelKey: "cutEmpty",
	cut: {},
	heads: {},
	links: [],
	sensors: [],
};

/** An all-green cut — every link resolves and every sensor is green ⇒ STABLE. */
export const GREEN_CUT: CutCase = {
	id: "green",
	labelKey: "cutGreen",
	cut: { createOrder: "v3" },
	heads: { createOrder: "v3" },
	links: [binds("checkout-submit", "v1", "createOrder", "v3")],
	sensors: [{ id: "createOrder.fixture", pass: true }],
};

/** A cut with one red sensor ⇒ UNSTABLE (THE done criterion). */
export const RED_SENSOR_CUT: CutCase = {
	id: "red-sensor",
	labelKey: "cutRedSensor",
	cut: { createOrder: "v3" },
	heads: { createOrder: "v3" },
	links: [binds("checkout-submit", "v1", "createOrder", "v3")],
	sensors: [{ id: "createOrder.fixture", pass: false }],
};

/** A cut with one stale (off-head) link ⇒ UNSTABLE. */
export const STALE_LINK_CUT: CutCase = {
	id: "stale-link",
	labelKey: "cutStaleLink",
	cut: { createOrder: "v3" },
	heads: { createOrder: "v3" },
	links: [binds("checkout-submit", "v1", "createOrder", "v2")], // pinned off-head
	sensors: [{ id: "createOrder.fixture", pass: true }],
};

/** The canonical cuts, in stable render order. */
export const CUT_CASES: readonly CutCase[] = [
	EMPTY_CUT,
	GREEN_CUT,
	RED_SENSOR_CUT,
	STALE_LINK_CUT,
];
