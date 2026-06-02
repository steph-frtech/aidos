/**
 * The canonical entity AST examples for the /emitters panel (AIDOS step S34).
 *
 * The SAME entities the Go fixture (back/runtime/generators/example.go) pins —
 * Order (id / total / discount) and Thin (id) — reused from prior pinned artifacts.
 * The emitter coins no field beyond these (honesty). The panel projects each across
 * the three targets via the pure twin lib/emitters.ts, byte-identical to the Go
 * emitter (verified). The "head" hash of each entity is what the panel compares an
 * artifact's source_hash against to compute the deterministic / stale badge.
 *
 * READ-ONLY (the wall): the entity AST is a prior truth (S02). The panel reads it;
 * it never authors it.
 */

import { type EntitySource, sourceHash } from "./emitters";

/** Order — the worked example (id / total / discount). */
export const ENTITY_ORDER: EntitySource = {
	id: "entity-order",
	kind: "entity",
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
		{ name: "discount", type: "numeric" },
	],
};

/** Order with `discount` removed — the "changed source" (the head moved ahead). A prior
 *  artifact emitted from the full Order is now STALE relative to this head. */
export const ENTITY_ORDER_CHANGED: EntitySource = {
	id: "entity-order",
	kind: "entity",
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
	],
};

/** Thin — the minimal honest entity (only id): the emitter emits ONLY the pinned field. */
export const ENTITY_THIN: EntitySource = {
	id: "entity-thin",
	kind: "entity",
	name: "Thin",
	fields: [{ name: "id", type: "text" }],
};

/** The entities the panel projects, in a stable order. */
export const ENTITIES: EntitySource[] = [ENTITY_ORDER, ENTITY_THIN];

/** A pre-recorded ledger row: the prior Order artifact (full Order) — kept for the
 *  STALE demo. Its source_hash is the FULL Order head; once the head moves to
 *  ENTITY_ORDER_CHANGED, this artifact is stale (its source_hash != the new head). */
export const PRIOR_ORDER_SOURCE_HASH = sourceHash(ENTITY_ORDER);

/** The "current head" the panel uses for the STALE demo: the changed Order. */
export const ORDER_HEAD_AFTER_CHANGE = sourceHash(ENTITY_ORDER_CHANGED);
