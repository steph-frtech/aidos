import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_TEMPORAL_INVARIANT_VIOLATED,
	evaluate,
	type Observation,
	type TemporalInvariant,
	validate,
} from "./temporal";
import { CHECKOUT_CONFIRM_WITHIN_5M, EVALUATION_ROWS } from "./temporal-data";

/**
 * Reproducibility mirror (fast-check) for the TemporalInvariant evaluator projection — the front
 * twin of back/kernel/temporal's rapid property mirror. reflects=lib/temporal, test_kind=property,
 * cert_language=fast-check, authority=above (the human red of KRD §49.3). It pins that the TS
 * projection decides EXACTLY as the Go evaluator: the tolerance band applied exactly once
 * (one-sided), totality + determinism (no Date.now()), and the clock-required rule on validate.
 */

const inv: TemporalInvariant = CHECKOUT_CONFIRM_WITHIN_5M;
const BOUND = inv.boundSeconds; // 300
const TOL = inv.toleranceSeconds; // 10

describe("TemporalInvariant evaluator projection (KRD §49.3)", () => {
	it("the canonical checkout-confirm-within-5m invariant validates", () => {
		expect(validate(inv)).toBe("");
	});

	it("4m58s is held (inside the bound)", () => {
		const out = evaluate(inv, {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 4 * 60 + 58,
		});
		expect(out.verdict).toBe("held");
	});

	it("5m04s is held (inside tolerance — NOT a flake)", () => {
		const out = evaluate(inv, {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 5 * 60 + 4,
		});
		expect(out.verdict).toBe("held");
	});

	it("5m20s is violated / TEMPORAL_INVARIANT_VIOLATED (THE done case)", () => {
		const out = evaluate(inv, {
			eventOrder: ["payment_captured", "order_confirmed"],
			elapsedSeconds: 5 * 60 + 20,
		});
		expect(out.verdict).toBe("violated");
		expect(out.blockReason?.code).toBe(CODE_TEMPORAL_INVARIANT_VIOLATED);
		expect(out.blockReason?.howToFix).toContain(
			"confirm_within_5m_or_compensate",
		);
	});

	it("order_confirmed before payment_captured is violated (ordre des événements)", () => {
		const out = evaluate(inv, {
			eventOrder: ["order_confirmed", "payment_captured"],
			elapsedSeconds: 60,
		});
		expect(out.verdict).toBe("violated");
		expect(out.blockReason?.code).toBe(CODE_TEMPORAL_INVARIANT_VIOLATED);
	});

	it("a missing clock is rejected (the load-bearing §49.3 rule)", () => {
		expect(validate({ ...inv, clock: "" as never })).not.toBe("");
	});

	// ∀ — the tolerance band is applied exactly once, one-sided; held IFF elapsed ≤ bound + tol.
	it("the tolerance band: held IFF elapsed ≤ bound + tolerance (in order)", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 600 }), (elapsed) => {
				const obs: Observation = {
					eventOrder: ["payment_captured", "order_confirmed"],
					elapsedSeconds: elapsed,
				};
				const out = evaluate(inv, obs);
				const wantHeld = elapsed <= BOUND + TOL;
				expect(out.verdict).toBe(wantHeld ? "held" : "violated");
			}),
		);
	});

	// ∀ — Evaluate is total + deterministic (same input ⇒ same verdict, no wall clock read).
	it("evaluate is total and deterministic", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 600 }), (elapsed) => {
				const obs: Observation = {
					eventOrder: ["payment_captured", "order_confirmed"],
					elapsedSeconds: elapsed,
				};
				const a = evaluate(inv, obs);
				const b = evaluate(inv, obs);
				expect(a.verdict).toBe(b.verdict);
				expect(["held", "violated"]).toContain(a.verdict);
			}),
		);
	});

	it("the four fixture rows compute the expected verdicts", () => {
		const verdicts = EVALUATION_ROWS.map(
			(r) => evaluate(inv, r.observation).verdict,
		);
		expect(verdicts).toEqual(["held", "held", "violated", "violated"]);
	});
});
