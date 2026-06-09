import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deriveDoc, type Kernel } from "./derivedoc";

/**
 * FK06 reproducibility mirror (TS twin) — the byte-identity property: same kernel ⇒
 * byte-identical s9, invariant under input ordering. Mirrors the Go rapid property.
 */

const checkout: Kernel = {
	kernelId: "checkout-slice",
	operations: [
		{
			name: "createOrder",
			input: "CreateOrderInput",
			steps: [
				{ kind: "validate" },
				{ kind: "authorize", policy: "canCheckout" },
				{ kind: "read", entity: "Cart" },
				{ kind: "mutate", entity: "Order" },
				{ kind: "mutate", entity: "Cart" },
				{ kind: "return" },
			],
			emits: ["OrderCreated", "CartCleared"],
		},
	],
	controls: [{ name: "checkout-button", triggers: "checkout-submit" }],
	actions: [
		{
			name: "checkout-submit",
			invoke: "createOrder",
			onControl: "checkout-button",
		},
	],
};

const arbName = fc.constantFrom("createOrder", "clearCart", "refund");
const arbOp = fc.record({
	name: arbName,
	input: fc.constantFrom("CreateOrderInput", "ClearCartInput"),
	emits: fc.constantFrom<string[]>(
		["OrderCreated", "CartCleared"],
		["CartCleared", "OrderCreated"],
		["Refunded"],
	),
});
const arbKernel: fc.Arbitrary<Kernel> = fc.record<Kernel>({
	kernelId: fc.constantFrom("k1", "k2"),
	operations: fc.array(arbOp, { maxLength: 3 }),
	controls: fc.array(
		fc.record({
			name: fc.constantFrom("checkout-button", "cancel-button"),
			triggers: fc.constantFrom("checkout-submit", "cancel-flow"),
		}),
		{ maxLength: 3 },
	),
	actions: fc.array(
		fc.record({
			name: fc.constantFrom("checkout-submit", "cancel-flow"),
			invoke: fc.constantFrom("createOrder", "clearCart"),
			onControl: fc.constant("checkout-button"),
		}),
		{ maxLength: 3 },
	),
});

describe("deriveDoc (FK06)", () => {
	it("is byte-identical for the same kernel", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				expect(deriveDoc(k).bytes).toBe(deriveDoc(k).bytes);
			}),
		);
	});

	it("is invariant under input ordering", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const rev: Kernel = {
					kernelId: k.kernelId,
					operations: [...(k.operations ?? [])].reverse(),
					controls: [...(k.controls ?? [])].reverse(),
					actions: [...(k.actions ?? [])].reverse(),
				};
				expect(deriveDoc(rev).bytes).toBe(deriveDoc(k).bytes);
			}),
		);
	});

	it("structures s9 into concepts, behaviors, errors", () => {
		const { s9 } = deriveDoc(checkout);
		expect(s9.concepts).toContain("operation:createOrder");
		expect(s9.concepts).toContain("control:checkout-button");
		expect(s9.concepts).toContain("entity:Order");
		expect(s9.concepts).toContain("event:OrderCreated");
		expect(s9.concepts).toContain("policy:canCheckout");
		expect(s9.behaviors.map((b) => b.id)).toContain(
			"binding:checkout-button->checkout-submit->createOrder",
		);
		expect(s9.errors).toContain("operation:createOrder:ErrAuthorizationDenied");
		expect(s9.errors).toContain("control:checkout-button:ErrOrphanTrigger");
	});

	it("sorts every section", () => {
		const { s9 } = deriveDoc(checkout);
		const sorted = (xs: string[]) =>
			[...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
		expect(s9.concepts).toEqual(sorted(s9.concepts));
		expect(s9.errors).toEqual(sorted(s9.errors));
		expect(s9.behaviors.map((b) => b.id)).toEqual(
			sorted(s9.behaviors.map((b) => b.id)),
		);
	});

	it("derives a well-formed empty s9 for an empty kernel", () => {
		const { s9 } = deriveDoc({ kernelId: "empty" });
		expect(s9).toEqual({
			kernel_id: "empty",
			concepts: [],
			behaviors: [],
			errors: [],
		});
	});
});
