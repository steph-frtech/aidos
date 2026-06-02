import { describe, expect, it } from "vitest";
import {
	CHECKOUT_BUTTON,
	CHECKOUT_SUBMIT,
	controlTrace,
	evalState,
	planAction,
	stateFixtureRows,
} from "./control";

/**
 * Reproducibility mirror for the /control projection (S11). It pins the front
 * EvalState / planAction against the Go fixtures (back/kernel/control,
 * back/kernel/action): the three state-fixture rows (visible=false empty cart,
 * enabled=false invalid form, enabled=true valid form) and the bind
 * (click("checkout-button") → invoke operation "createOrder"). Determinism-first
 * (CLAUDE.md §6/§8): same input ⇒ same output.
 */

describe("checkout-button control-spec (state fixture)", () => {
	it("hides the button for an empty cart (visible=false)", () => {
		const s = evalState({ cart: { items: [] } });
		expect(s.visible).toBe(false);
		expect(s.enabled).toBe(false); // hidden ⇒ enabled not meaningful
	});

	it("shows but disables the button for an invalid form (enabled=false)", () => {
		const s = evalState({
			cart: { items: [{ id: "x" }] },
			form: { valid: false },
			submitting: false,
		});
		expect(s.visible).toBe(true);
		expect(s.enabled).toBe(false);
	});

	it("enables the button for a filled cart and a valid form (enabled=true)", () => {
		const s = evalState({
			cart: { items: [{ id: "x" }] },
			form: { valid: true },
			submitting: false,
		});
		expect(s.visible).toBe(true);
		expect(s.enabled).toBe(true);
	});

	it("never produces an enabled-but-hidden button", () => {
		const rows = stateFixtureRows();
		for (const r of rows) {
			if (r.state.enabled) expect(r.state.visible).toBe(true);
		}
	});

	it("is deterministic — same given yields the same state", () => {
		const given = {
			cart: { items: [{ id: "x" }] },
			form: { valid: true },
			submitting: false,
		};
		expect(evalState(given)).toEqual(evalState(given));
	});

	it("triggers the checkout-submit action (control→action link)", () => {
		expect(CHECKOUT_BUTTON.triggers).toBe("checkout-submit");
	});
});

describe("checkout-submit action-spec (event fixture)", () => {
	it("binds click(checkout-button) to operation createOrder", () => {
		const plan = planAction(CHECKOUT_SUBMIT, "checkout-button");
		expect(plan).not.toBeNull();
		expect(plan?.invoke).toBe("createOrder");
	});

	it("carries the with{ cart, user } args", () => {
		const plan = planAction(CHECKOUT_SUBMIT, "checkout-button");
		expect(plan?.args.sort()).toEqual(["cart", "user"]);
	});

	it("lists on_success [navigate, toast] and on_error [toast.error]", () => {
		const plan = planAction(CHECKOUT_SUBMIT, "checkout-button");
		expect(plan?.onSuccess.map((e) => e.verb)).toEqual(["navigate", "toast"]);
		expect(plan?.onError.map((e) => e.verb)).toEqual(["toast.error"]);
	});

	it("does not fire for a foreign event (a click on another control)", () => {
		expect(planAction(CHECKOUT_SUBMIT, "some-other-button")).toBeNull();
	});
});

describe("controlTrace verdict", () => {
	it("computes PASS — the three rows match and the action binds createOrder", () => {
		expect(controlTrace().pass).toBe(true);
	});
});
