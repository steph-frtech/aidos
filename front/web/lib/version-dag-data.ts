/**
 * The canonical §120 version-DAG seed for the /version-dag panel (AIDOS step S24).
 *
 * It is the SAME graph the Go fixture (back/archive/dag/dag_fixture_test.go) and the dag MCP
 * round-trip pin: a linear human-truth trunk v0 → v1 → v2 (above the waterline) plus an evolutionary
 * variant w1 off v1 (below the waterline, §124). From this seed the panel animates the three §121
 * moves: branch (a new line off a phase), checkout-ancestor (the head jumps back to v1), rebranch
 * (a new line v2a off v1). The agent coins no new business rule — these are the METHOD's example
 * phase ids (v0/v1/v2/w1), the same ones the KRD §120 narrative uses.
 */

import type { Dag } from "./version-dag";

/**
 * SEED_DAG — the canonical §120 graph BEFORE any move: the trunk v0→v1→v2 with v2 the head, plus the
 * evolutionary variant w1 off v1 (a parallel line below the waterline, §125). Nodes carry their
 * stratum (§124): the trunk is `above` (human truth), w1 is `below` (evolutionary).
 */
export const SEED_DAG: Dag = {
	nodes: [
		{ id: "v0", parentIds: [], head: false, stratum: "above", label: "racine" },
		{
			id: "v1",
			parentIds: ["v0"],
			head: false,
			stratum: "above",
			label: "tronc",
		},
		{
			id: "v2",
			parentIds: ["v1"],
			head: true,
			stratum: "above",
			label: "tronc",
		},
		{
			id: "w1",
			parentIds: ["v1"],
			head: false,
			stratum: "below",
			label: "variante-évo",
		},
	],
	edges: [
		{ from: "v0", to: "v1", changeset: "cs-v0-v1" },
		{ from: "v1", to: "v2", changeset: "cs-v1-v2" },
		{ from: "v1", to: "w1", changeset: "cs-v1-w1" },
	],
};

/** The ancestor the canonical checkout/rebranch demo targets (the §120 backward move to v1). */
export const DEMO_ANCESTOR = "v1";

/** A reusable example ChangeSet id for a panel-initiated move (reuses an existing S20 id shape). */
export const DEMO_CHANGESET = "cs-démo";
