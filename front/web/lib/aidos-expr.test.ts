/**
 * aidos-expr mirror — the embedded Expr evaluator twin matches back/kernel/expr +
 * back/kernel/control.EvalState (S11) over the checkout-button conditions.
 *
 *   reflects: front.aidos-expr (the embedded EvalState twin) · test_kind: property + example
 *   · cert_language: fast-check/vitest · authority: below · liveness: live
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type ExprNode, evalExpr, evalState } from "./aidos-expr";

const VISIBLE: ExprNode = {
	kind: "call",
	fn: ">",
	args: [
		{ kind: "ref", path: "$.cart.items.length" },
		{ kind: "lit", value: 0 },
	],
};
const ENABLED: ExprNode = {
	kind: "call",
	fn: "&&",
	args: [
		{ kind: "ref", path: "$.form.valid" },
		{ kind: "call", fn: "!", args: [{ kind: "ref", path: "$.submitting" }] },
	],
};

describe("aidos-expr evaluates the closed catalogue (>, length, &&, !) like Go", () => {
	it("length of an array ref", () => {
		expect(
			evalExpr({ kind: "ref", path: "$.xs.length" }, { xs: [1, 2, 3] }),
		).toBe(3);
	});

	it("a hidden button reports enabled=false without consulting enabled_when", () => {
		const st = evalState(VISIBLE, ENABLED, { cart: { items: [] } });
		expect(st).toEqual({ visible: false, enabled: false });
	});

	it("visible + invalid form ⇒ enabled=false", () => {
		const st = evalState(VISIBLE, ENABLED, {
			cart: { items: [{ id: "x" }] },
			form: { valid: false },
			submitting: false,
		});
		expect(st).toEqual({ visible: true, enabled: false });
	});

	it("visible + valid form + not submitting ⇒ enabled=true", () => {
		const st = evalState(VISIBLE, ENABLED, {
			cart: { items: [{ id: "x" }] },
			form: { valid: true },
			submitting: false,
		});
		expect(st).toEqual({ visible: true, enabled: true });
	});

	it("∀ item-count: visible iff count > 0 (the visible_when invariant)", () => {
		fc.assert(
			fc.property(fc.nat({ max: 10 }), (n) => {
				const items = Array.from({ length: n }, (_, i) => ({ id: i }));
				const st = evalState(VISIBLE, ENABLED, {
					cart: { items },
					form: { valid: true },
					submitting: false,
				});
				expect(st.visible).toBe(n > 0);
			}),
		);
	});

	it("never throws on a dangling ref — an unevaluable condition renders nothing", () => {
		const st = evalState(VISIBLE, ENABLED, {});
		expect(st.visible).toBe(false);
	});
});
