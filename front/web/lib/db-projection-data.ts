/**
 * The pinned Order entity sources for /db-projection (S37) — the agent-side SELECT-only
 * mirror of the kernel entity. Byte-faithful to the Go examples (db.ExampleOrderPrior /
 * ExampleOrderNew / ExampleOrderNarrowed). The agent coins no field beyond these.
 */

import type { Change, DataTruthScope, EntitySource } from "./db-projection";

/** Order @prior — the S35 Order (id, total, discount). The diff baseline. */
export const ORDER_PRIOR: EntitySource = {
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
		{ name: "discount", type: "numeric" },
	],
};

/** Order @new — Order + an ADDITIVE column add (+ coupon: text). The expand case. */
export const ORDER_NEW: EntitySource = {
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
		{ name: "discount", type: "numeric" },
		{ name: "coupon", type: "text" },
	],
};

/** Order @narrowed — Order with `discount` DROPPED. The expand→backfill→contract case. */
export const ORDER_NARROWED: EntitySource = {
	name: "Order",
	fields: [
		{ name: "id", type: "text" },
		{ name: "total", type: "numeric" },
	],
};

/** A historical-impact change with NO declared migration — REQUIRES MIGRATION. */
export const HISTORICAL_CHANGE: Change = {
	change_type: "override",
	entity: "Order",
	applies_to: ["existing_records", "historical_records"],
};

/** The §44.3 DataTruthScope that UNBLOCKS the historical-impact change. */
export const DECLARED_SCOPE: DataTruthScope = {
	applies_to: ["existing_records", "historical_records"],
	migration: { required: true, strategy: "expand_contract" },
	audit: { preserve_old_truth: true },
};

/** A change touching only new_records — no migration needed. */
export const NEW_ONLY_CHANGE: Change = {
	change_type: "add",
	entity: "Order",
	applies_to: ["new_records"],
};
