/**
 * The pinned createOrder + Order sources for /api-projection (S36) — the agent-side
 * SELECT-only mirror of the kernel operation + entity. Byte-faithful to the Go examples
 * (generators.ExampleCreateOrderOp + entities.Order). The agent coins no step/attribute
 * beyond these; the authoritative rows live in the kernel, read here for the screen.
 */

import type { Entity, Operation } from "./api-projection";

/** The Order entity SOURCE (= entities.Order), attributes in source order. */
export const ORDER_ENTITY: Entity = {
	name: "Order",
	attributes: [
		{ name: "id", type: "int", required: true, identifier: true },
		{ name: "customer", type: "string", required: true },
		{ name: "total", type: "decimal", required: true },
		{ name: "discount", type: "decimal", required: false },
		{ name: "placed_at", type: "timestamptz", required: true },
	],
};

/** The createOrder operation SOURCE (= generators.ExampleCreateOrderOp). */
export const CREATE_ORDER_OP: Operation = {
	name: "createOrder",
	input: "CreateOrderInput",
	emits: ["OrderPlaced"],
	steps: [
		{ kind: "validate", schema: "CreateOrderInput" },
		{ kind: "authorize", policy: "canPlaceOrder" },
		{
			kind: "mutate",
			entity: "Order",
			op: "create",
			as: "$.order",
			data_keys: ["customer", "total"],
		},
		{ kind: "return", ref: "$.order" },
	],
};

/**
 * The AUTHORITATIVE Go hashes (back/runtime/generators) the twin must reproduce
 * byte-identically — the cross-language equality anchor (the same role as S35's
 * entityId 5f39ec78…). Computed by the Go emitter; the twin's sourceHash/output_hash
 * must equal these.
 */
export const GO_SOURCE_HASH =
	"1c2492192bd64975cfbb71079ee3f432e2bfb3cbb0b44f070c603fc8182d970e";
export const GO_OUTPUT_HASH =
	"35daca1e8766a4f8ed47ade9da59fcbb78aee3921f63c8a98b2db2fdd360d35a";
