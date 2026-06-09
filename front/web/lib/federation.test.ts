import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	affectedCells,
	type CellViolation,
	DEMO_CONTRACTS,
	DEMO_PARTICIPANTS,
	DEMO_POLICY_CELLS,
	fanOut,
	sagaOverCells,
} from "./federation";

// S103 §51 REPRODUCIBILITY MIRROR (fast-check) — the front twin reproduces the Go federation
// composition: same input ⇒ same output, the non-affected cell ALWAYS stays green, the broken
// leg ALWAYS settles satisfied via compensation, a non-contracted pair is ALWAYS refused.

describe("sagaOverCells", () => {
	it("happy path on two contracted cells is satisfied", () => {
		const run = sagaOverCells(DEMO_PARTICIPANTS, DEMO_CONTRACTS, [
			"payment_captured",
			"order_confirmed",
		]);
		expect(run.leg).toBe("happy");
		expect(run.outcome).toBe("satisfied");
		expect(run.compensation).toHaveLength(0);
	});

	it("breaking a leg triggers compensation (satisfied via compensation)", () => {
		const run = sagaOverCells(DEMO_PARTICIPANTS, DEMO_CONTRACTS, [
			"payment_captured",
		]);
		expect(run.leg).toBe("compensated");
		expect(run.outcome).toBe("satisfied");
		expect(run.compensation).toContain("refundPayment@v3");
		expect(run.compensation[run.compensation.length - 1]).toBe(
			"compensation_executed",
		);
	});

	it("a non-contracted pair is refused (CROSS_CELL_NO_CONTRACT)", () => {
		const run = sagaOverCells(
			DEMO_PARTICIPANTS,
			[],
			["payment_captured", "order_confirmed"],
		);
		expect(run.accessBlock?.code).toBe("CROSS_CELL_NO_CONTRACT");
		expect(run.leg).toBe("violated");
	});

	it("is deterministic over random traces", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.constantFrom(
						"payment_captured",
						"order_confirmed",
						"compensation_executed",
					),
					{ maxLength: 4 },
				),
				(trace) => {
					const a = sagaOverCells(DEMO_PARTICIPANTS, DEMO_CONTRACTS, trace);
					const b = sagaOverCells(DEMO_PARTICIPANTS, DEMO_CONTRACTS, trace);
					expect(a).toEqual(b);
				},
			),
		);
	});
});

describe("fanOut", () => {
	it("a non-violating cell stays GREEN with an empty queue (§51)", () => {
		const waves = fanOut(DEMO_POLICY_CELLS, "wave-1", [
			{ cell: "order", violates: true },
			{ cell: "payment", violates: true },
			{ cell: "shipping", violates: false },
		]);
		const ship = waves.find((w) => w.cell === "shipping");
		expect(ship?.reddened).toBe(false);
		expect(ship?.queue).toHaveLength(0);
		expect(affectedCells(waves)).toEqual(["order", "payment"]);
	});

	it("never reddens a non-violating cell, regardless of the others", () => {
		fc.assert(
			fc.property(fc.boolean(), fc.boolean(), (orderV, paymentV) => {
				const cells: CellViolation[] = [
					{ cell: "order", violates: orderV },
					{ cell: "payment", violates: paymentV },
					{ cell: "shipping", violates: false },
				];
				const waves = fanOut(DEMO_POLICY_CELLS, "wave-1", cells);
				const ship = waves.find((w) => w.cell === "shipping");
				expect(ship?.reddened).toBe(false);
				expect(ship?.queue).toHaveLength(0);
			}),
		);
	});

	it("is deterministic", () => {
		const waves1 = fanOut(DEMO_POLICY_CELLS, "wave-1", [
			{ cell: "order", violates: true },
			{ cell: "shipping", violates: false },
		]);
		const waves2 = fanOut(DEMO_POLICY_CELLS, "wave-1", [
			{ cell: "order", violates: true },
			{ cell: "shipping", violates: false },
		]);
		expect(waves1).toEqual(waves2);
	});
});
