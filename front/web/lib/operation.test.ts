import { describe, expect, it } from "vitest";
import {
	CREATE_ORDER,
	createOrderHappyTrace,
	HAPPY_CART,
	HAPPY_STATE,
	isStepKind,
	type MockDeps,
	pipeline,
	run,
	STEP_KINDS,
} from "./operation";

/**
 * Reproducibility mirror (Vitest): reflects=lib/operation,
 * test_kind=fixture, liveness=live, authority=below.
 *
 * Pins the /operation projection against the Go fixture (back/kernel/operation):
 *   - the verb set matches the Go stepKinds registry;
 *   - createOrder is the §93 anchor (the six-step pipeline, emits the two events);
 *   - the createOrder/happy trace: events [OrderCreated, CartCleared], status
 *     "pending", total 15, authorize ran BEFORE any mutate ⇒ PASS;
 *   - an authorize DENY short-circuits: no events, no mutate.
 * It is a MEANS-test toward the human red fixture, never a self-graded truth.
 */

describe("Operation DSL projection (lib/operation)", () => {
	it("exposes the six verbs in canonical order, matching the Go stepKinds", () => {
		expect([...STEP_KINDS]).toEqual([
			"validate",
			"authorize",
			"read",
			"mutate",
			"branch",
			"return",
		]);
		expect(isStepKind("authorize")).toBe(true);
		expect(isStepKind("frobnicate")).toBe(false);
	});

	it("createOrder anchor is the §93 six-step pipeline emitting the two events", () => {
		expect(CREATE_ORDER.name).toBe("createOrder");
		expect(CREATE_ORDER.input).toBe("CreateOrderInput");
		expect(CREATE_ORDER.emits).toEqual(["OrderCreated", "CartCleared"]);
		const chips = pipeline(CREATE_ORDER);
		expect(chips.map((c) => c.kind)).toEqual([
			"validate",
			"authorize",
			"read",
			"mutate",
			"mutate",
			"return",
		]);
	});

	it("createOrder/happy: events [OrderCreated, CartCleared], status pending, total 15, authorize before mutate ⇒ PASS", () => {
		const t = createOrderHappyTrace();
		expect(t.events).toEqual(["OrderCreated", "CartCleared"]);
		expect(t.status).toBe("pending");
		expect(t.total).toBe(15);
		expect(t.authorizeBeforeMutate).toBe(true);
		expect(t.pass).toBe(true);
	});

	it("authorize DENY short-circuits: no events, mutate never called", () => {
		const deps: MockDeps = {
			authorizeAllow: false,
			cart: { id: "c1", userId: "u1", items: [] },
			calls: [],
		};
		const res = run(CREATE_ORDER, HAPPY_STATE, deps);
		expect(res.denied).toBe(true);
		expect(res.events).toEqual([]);
		expect(res.calls).not.toContain("mutate");
	});

	it("is deterministic: same inputs ⇒ identical trace", () => {
		const a = createOrderHappyTrace();
		const b = createOrderHappyTrace();
		expect(a).toEqual(b);
	});

	it("the happy cart sums to 15", () => {
		const total = HAPPY_CART.items.reduce((s, i) => s + i.price, 0);
		expect(total).toBe(15);
	});
});
