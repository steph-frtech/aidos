/**
 * Reproducibility mirror for the demo-checkout twin (S46) — fast-check + Vitest. It
 * pins the SAME invariants as the Go slice's rapid property (back/runtime/checkout):
 * the ordered event list is exactly the seven loop events; runSlice is content-
 * idempotent (same cart ⇒ same events + same order); N line items ⇒ N persisted (no
 * phantom, no dropped item); an empty cart ⇒ a block, never an invented order.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Cart,
	exampleCart,
	type LineItem,
	runSlice,
	SLICE_EVENTS,
} from "./demo-checkout";

const lineItem = fc.record<LineItem>({
	product: fc.string({ minLength: 1, maxLength: 8 }),
	quantity: fc.integer({ min: 1, max: 99 }),
});

const nonEmptyCart = fc.record<Cart>({
	id: fc.string({ minLength: 1, maxLength: 8 }),
	items: fc.array(lineItem, { minLength: 1, maxLength: 6 }),
});

describe("demo-checkout slice twin", () => {
	it("emits exactly the seven ordered loop events", () => {
		expect(SLICE_EVENTS).toEqual([
			"IdeaIntaken",
			"GoalOpened",
			"ChangeSetApplied",
			"MirrorLive",
			"ArtifactsEmitted",
			"OrderPlaced",
			"PhaseSealed",
		]);
	});

	it("the worked cart has exactly 2 line items", () => {
		expect(exampleCart().items).toHaveLength(2);
	});

	it("is content-idempotent: same cart ⇒ same events and order", () => {
		fc.assert(
			fc.property(nonEmptyCart, (cart) => {
				const a = runSlice(cart);
				const b = runSlice(cart);
				expect(a).toEqual(b);
			}),
		);
	});

	it("N line items in ⇒ N persisted, verbatim (no phantom, no dropped item)", () => {
		fc.assert(
			fc.property(nonEmptyCart, (cart) => {
				const r = runSlice(cart);
				expect(r.kind).toBe("green");
				if (r.kind === "green") {
					expect(r.order.items).toEqual(cart.items);
				}
			}),
		);
	});

	it("an empty cart blocks — never an invented order", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1, maxLength: 8 }), (id) => {
				const r = runSlice({ id, items: [] });
				expect(r.kind).toBe("blocked");
			}),
		);
	});
});
