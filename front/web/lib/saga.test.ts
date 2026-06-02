import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CODE_INCOMPATIBLE_CONTRACT_VERSION,
	CODE_SAGA_INVARIANT_VIOLATED,
	checkCoherence,
	evaluate,
	type Heads,
	type Ref,
	runCompensation,
	type SagaInvariant,
	type Trace,
	validate,
} from "./saga";
import {
	CHECKOUT_COHERENCE_TEST,
	CHECKOUT_PAYMENT_SHIPPING,
	HEADS_COHERENT,
	HEADS_INCOMPATIBLE,
} from "./saga-data";

/**
 * Reproducibility mirror (fast-check) for the SagaInvariant evaluator projection — the front
 * twin of back/kernel/sagas's rapid property mirror. reflects=lib/saga, test_kind=property,
 * cert_language=fast-check, authority=above (the human red of KRD §49.2). It pins that the TS
 * projection decides EXACTLY as the Go evaluator: the core safety property (a captured payment
 * is satisfied IFF order_confirmed or compensation_executed; the dangling-money monster is always
 * SAGA_INVARIANT_VIOLATED), totality + determinism, and the coherence check (incompatible when a
 * consumed ref is not at head, composing S17 Resolve).
 */

const EVENT_VOCAB = [
	"order_confirmed",
	"payment_captured",
	"shipping_scheduled",
	"shipping_failed",
	"compensation_executed",
	"order_failed",
];

const traceArb: fc.Arbitrary<Trace> = fc.array(
	fc.constantFrom(...EVENT_VOCAB),
	{ maxLength: 6 },
);

describe("SagaInvariant evaluator projection (KRD §49.2)", () => {
	it("the canonical checkout-payment-shipping saga validates", () => {
		expect(validate(CHECKOUT_PAYMENT_SHIPPING)).toBe("");
	});

	it("the happy path is satisfied", () => {
		const out = evaluate(CHECKOUT_PAYMENT_SHIPPING, [
			"order_confirmed",
			"payment_captured",
			"shipping_scheduled",
		]);
		expect(out.outcome).toBe("satisfied");
	});

	it("a failed leg triggers compensation — the property holds VIA compensation (THE done case)", () => {
		const failed: Trace = [
			"order_confirmed",
			"payment_captured",
			"shipping_failed",
		];
		const comp = runCompensation(CHECKOUT_PAYMENT_SHIPPING, failed);
		expect(comp.events).toEqual([
			"refundPayment@v3",
			"cancelOrder@v2",
			"compensation_executed",
		]);
		const out = evaluate(CHECKOUT_PAYMENT_SHIPPING, comp.trace);
		expect(out.outcome).toBe("satisfied");
	});

	it("the dangling-money monster is violated / SAGA_INVARIANT_VIOLATED", () => {
		const out = evaluate(CHECKOUT_PAYMENT_SHIPPING, ["payment_captured"]);
		expect(out.outcome).toBe("violated");
		expect(out.blockReason?.code).toBe(CODE_SAGA_INVARIANT_VIOLATED);
		expect(out.blockReason?.howToFix).toContain("run_compensation_on_failure");
	});

	it("∀ trace — Evaluate is total + deterministic", () => {
		fc.assert(
			fc.property(traceArb, (tr) => {
				const a = evaluate(CHECKOUT_PAYMENT_SHIPPING, tr);
				const b = evaluate(CHECKOUT_PAYMENT_SHIPPING, tr);
				expect(a.outcome).toBe(b.outcome);
				expect(["satisfied", "violated"]).toContain(a.outcome);
			}),
		);
	});

	it("∀ trace — core safety: satisfied IFF (no payment_captured) OR order_confirmed OR compensation_executed", () => {
		fc.assert(
			fc.property(traceArb, (tr) => {
				const out = evaluate(CHECKOUT_PAYMENT_SHIPPING, tr);
				const captured = tr.includes("payment_captured");
				const wantSatisfied =
					!captured ||
					tr.includes("order_confirmed") ||
					tr.includes("compensation_executed");
				if (wantSatisfied) {
					expect(out.outcome).toBe("satisfied");
				} else {
					expect(out.outcome).toBe("violated");
					expect(out.blockReason?.code).toBe(CODE_SAGA_INVARIANT_VIOLATED);
				}
			}),
		);
	});

	it("Validate rejects local_cell, single-participant, unpinned compensation, bad cert_language", () => {
		const local = {
			...CHECKOUT_PAYMENT_SHIPPING,
			scope: "local_cell",
		} as unknown as SagaInvariant;
		expect(validate(local)).not.toBe("");

		const single: SagaInvariant = {
			...CHECKOUT_PAYMENT_SHIPPING,
			participants: CHECKOUT_PAYMENT_SHIPPING.participants.slice(0, 1),
		};
		expect(validate(single)).not.toBe("");

		const unpinned: SagaInvariant = {
			...CHECKOUT_PAYMENT_SHIPPING,
			participants: CHECKOUT_PAYMENT_SHIPPING.participants.map((p, i) =>
				i === 1
					? { ...p, compensation: [{ id: "refundPayment", version: "" }] }
					: p,
			),
		};
		expect(validate(unpinned)).not.toBe("");

		const badCert = {
			...CHECKOUT_PAYMENT_SHIPPING,
			certLanguage: "graphviz",
		} as unknown as SagaInvariant;
		expect(validate(badCert)).not.toBe("");
	});
});

describe("CoherenceTest projection (KRD §49.2)", () => {
	it("a non-head consumed contract version is incompatible / INCOMPATIBLE_CONTRACT_VERSION", () => {
		const out = checkCoherence(CHECKOUT_COHERENCE_TEST, HEADS_INCOMPATIBLE);
		expect(out.coherence).toBe("incompatible");
		expect(out.blockReason?.code).toBe(CODE_INCOMPATIBLE_CONTRACT_VERSION);
	});

	it("every consumed contract at head is coherent", () => {
		const out = checkCoherence(CHECKOUT_COHERENCE_TEST, HEADS_COHERENT);
		expect(out.coherence).toBe("coherent");
	});

	it("∀ heads — CheckCoherence is total, deterministic, incompatible iff some ref is not at head", () => {
		const idArb = fc.constantFrom(
			"order.events",
			"payment.commands",
			"shipping.events",
		);
		const verArb = fc.constantFrom("v1", "v2", "v3", "v4");
		fc.assert(
			fc.property(
				fc.array(fc.record({ id: idArb, version: verArb }), { maxLength: 4 }),
				fc.dictionary(idArb, verArb),
				(contracts: Ref[], heads: Heads) => {
					const ct = { contracts, property: "p" };
					const a = checkCoherence(ct, heads);
					const b = checkCoherence(ct, heads);
					expect(a.coherence).toBe(b.coherence);
					const anyStale = contracts.some((r) => heads[r.id] !== r.version);
					expect(a.coherence).toBe(anyStale ? "incompatible" : "coherent");
				},
			),
		);
	});
});
