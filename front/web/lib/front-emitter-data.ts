/**
 * Canonical /front-emitter demo fixture (S93) — the DETERMINISTIC fallback the panel renders
 * when the LIVE gateway read is unavailable / refused / malformed (ADR 0092 kill-twins; the
 * Go front-emitter MCP server is the SINGLE live source, this is the honest source:"demo").
 *
 * Pure data: the canonical `order` EntityModel + its `create-order` ControlModel the panel
 * toggles (blob/relation) and emits. The emit itself runs the PURE twin (lib/front-emitter),
 * which reproduces the Go frontemit bytes for the demo projection; the live path runs the same
 * spec through the Go `emit_front`/`emit_bundle`/`front_hash` tools. NEVER double-typed — the
 * EntityModel/ControlModel types are the front twin's (lib/front-emitter).
 */

import type { EntityModel } from "./front-emitter";

/** The canonical demo `order` entity (scalars + a receipt blob + a customer relation). */
export const ORDER_ENTITY: EntityModel = {
	name: "order",
	attributes: [
		{ name: "id", type: "int", identifier: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "paid", type: "bool" },
	],
	blobs: [
		{
			name: "receipt",
			allowedMime: ["image/png", "application/pdf"],
			maxBytes: 5_000_000,
			required: false,
		},
	],
	refs: [
		{
			name: "customer",
			target: "Customer",
			cardinality: "1-N",
			required: true,
		},
	],
};
