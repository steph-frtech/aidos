/**
 * The canonical entity AST example for the /entity-map panel (AIDOS step S35).
 *
 * The SAME Order entity the Go example pins (back/kernel/entities/example.go) — the
 * agent coins no attribute beyond these (honesty). The panel projects it across the
 * three targets via the pure twin lib/entity-source.ts, byte-identical to the Go
 * emitters (verified on all three Order artifacts). The "head" hash is what the panel
 * compares an artifact's source_hash against to compute the deterministic / stale badge.
 *
 * READ-ONLY (the wall): the entity AST is a SOURCE truth above the line. The panel
 * reads it; it never authors it.
 */

import type { Entity } from "./entity-source";

/** Order — the worked example (id / customer / total / discount / placed_at), SOURCE ORDER. */
export const ENTITY_ORDER: Entity = {
	name: "Order",
	attributes: [
		{ name: "id", type: "int", required: true, identifier: true },
		{ name: "customer", type: "string", required: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "discount", type: "decimal", required: false },
		{ name: "placed_at", type: "timestamptz", required: true },
	],
};

/** Order with `discount` removed — the "changed source" (the head moved ahead). A prior
 *  artifact emitted from the full Order is now STALE relative to this head. Used by the
 *  panel's "MOVE THE HEAD → stale" action to show the staleness inequality. */
export const ENTITY_ORDER_CHANGED: Entity = {
	name: "Order",
	attributes: [
		{ name: "id", type: "int", required: true, identifier: true },
		{ name: "customer", type: "string", required: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "placed_at", type: "timestamptz", required: true },
	],
};
