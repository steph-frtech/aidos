/**
 * web-projection-data — the worked-example sources for /web-preview: the S11
 * checkout-button control-spec + the checkout-submit action-spec it binds (KRD §24.1/
 * §24.2/§94), VERBATIM. The agent invents no view, label, condition, trigger, `on`, or
 * `invoke` — these mirror the Go anchors back/kernel/control.CheckoutButton +
 * back/kernel/action.CheckoutSubmit (S11, prior truth, read-only).
 *
 * The control-spec STATE fixture (given → {visible, enabled}) and the action-spec EVENT
 * fixture (click → invoke) are the S11 mirrors the emitted component must respect — the
 * /web-preview panel and the Playwright e2e replay these rows against the rendered DOM.
 */

import type { ActionSpec, ControlSpec } from "./web-projection";

/** The checkout-button control-spec (S11), verbatim. */
export const CHECKOUT_BUTTON: ControlSpec = {
	name: "checkout-button",
	view: "cart",
	label: "i18n(cart.checkout)",
	// visible_when: $.cart.items.length > 0
	visible_when: {
		kind: "call",
		fn: ">",
		args: [
			{ kind: "ref", path: "$.cart.items.length" },
			{ kind: "lit", value: 0 },
		],
	},
	// enabled_when: $.form.valid && !$.submitting
	enabled_when: {
		kind: "call",
		fn: "&&",
		args: [
			{ kind: "ref", path: "$.form.valid" },
			{ kind: "call", fn: "!", args: [{ kind: "ref", path: "$.submitting" }] },
		],
	},
	triggers: "checkout-submit",
};

/** The checkout-submit action-spec (S11), verbatim — the bind to operation createOrder. */
export const CHECKOUT_SUBMIT: ActionSpec = {
	name: "checkout-submit",
	on: { kind: "click", control: "checkout-button" },
	invoke: "createOrder",
	with: {
		cart: { kind: "ref", path: "$.cart" },
		user: { kind: "ref", path: "$.auth.user" },
	},
	on_success: [
		{ verb: "navigate", arg: { kind: "lit", value: "/orders/{result.id}" } },
		{ verb: "toast", arg: { kind: "lit", value: "order.created" } },
	],
	on_error: [
		{ verb: "toast.error", arg: { kind: "ref", path: "$.error.message" } },
	],
};

/** One control-spec state-fixture row (the S11 given → expected {visible, enabled}). */
export interface FixtureRow {
	id: string;
	given: Record<string, unknown>;
	wantVisible: boolean;
	wantEnabled: boolean;
}

/** The three KRD §35 checkout-button state-fixture rows, verbatim (= the Go fixture). */
export const CHECKOUT_FIXTURE: FixtureRow[] = [
	{
		id: "empty-cart-hides",
		given: { cart: { items: [] } },
		wantVisible: false,
		wantEnabled: false,
	},
	{
		id: "filled-cart-invalid-form-disabled",
		given: {
			cart: { items: [{ id: "x" }] },
			form: { valid: false },
			submitting: false,
		},
		wantVisible: true,
		wantEnabled: false,
	},
	{
		id: "filled-cart-valid-form-enabled",
		given: {
			cart: { items: [{ id: "x" }] },
			form: { valid: true },
			submitting: false,
		},
		wantVisible: true,
		wantEnabled: true,
	},
];

/** The action event fixture: a click on the enabled button declares this invoke (S11). */
export const EXPECTED_INVOKE = "createOrder";
