import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gate, type MutationReport, score } from "./mutation";
import { DECLARED_THRESHOLD, SCENARIOS } from "./mutation-data";

function report(killed: number, total: number): MutationReport {
	return {
		scope: "go",
		runner: "gremlins",
		killed,
		survived: total - killed,
		timedOut: 0,
		notCovered: 0,
		total,
		survivingMutants:
			total - killed > 0
				? [{ file: "x.go", line: 1, operator: "M", gap: "hole" }]
				: [],
	};
}

describe("the mutation gate twin (mirror of Go Gate — ADR 0030)", () => {
	it("THE done criterion: 40% blocks, 80% passes at the 0.80 bar", () => {
		const blocked = gate(report(40, 100), DECLARED_THRESHOLD);
		expect(blocked.verdict).toBe("block");
		expect(blocked.score).toBe(0.4);
		expect(blocked.survivingMutants.length).toBeGreaterThan(0);

		const passed = gate(report(80, 100), DECLARED_THRESHOLD);
		expect(passed.verdict).toBe("pass");
		expect(passed.score).toBe(0.8);
	});

	it("a missing threshold blocks with MISSING_THRESHOLD (never a self-chosen bar)", () => {
		const g = gate(report(99, 100), null);
		expect(g.verdict).toBe("block");
		expect(g.blockReason?.code).toBe("MISSING_THRESHOLD");
		expect(g.blockReason?.howToFix.length).toBeGreaterThan(0);
	});

	it("an empty/no-coverable-mutant report blocks (never a silent 1.0)", () => {
		const g = gate(
			{
				scope: "go",
				runner: "gremlins",
				killed: 0,
				survived: 0,
				timedOut: 0,
				notCovered: 5,
				total: 5,
				survivingMutants: [],
			},
			DECLARED_THRESHOLD,
		);
		expect(g.verdict).toBe("block");
		expect(g.blockReason?.code).toBe("UNPARSABLE_REPORT");
	});

	it("every seeded scenario gates deterministically", () => {
		for (const s of SCENARIOS) {
			const a = gate(s.report, s.threshold);
			const b = gate(s.report, s.threshold);
			expect(a.verdict).toBe(b.verdict);
			expect(a.score).toBe(b.score);
		}
	});

	// fast-check invariants (mirror the Go rapid property).
	it("∀ report, ∀ bar: pass ⇔ score ≥ bar (no third verdict)", () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 200 }),
				fc.nat({ max: 200 }),
				fc.float({ min: 0, max: 1, noNaN: true }),
				(killed, survived, bar) => {
					const total = killed + survived;
					const g = gate(report(killed, total), bar);
					const s = score(report(killed, total));
					if (s === null) {
						expect(g.verdict).toBe("block");
						return;
					}
					expect(g.verdict).toBe(s >= bar ? "pass" : "block");
				},
			),
		);
	});

	it("∀ report: score ∈ [0,1]", () => {
		fc.assert(
			fc.property(fc.nat({ max: 200 }), fc.nat({ max: 200 }), (k, s) => {
				const v = score(report(k, k + s));
				if (v !== null) {
					expect(v).toBeGreaterThanOrEqual(0);
					expect(v).toBeLessThanOrEqual(1);
				}
			}),
		);
	});

	it("monotone: killing more never turns pass→block", () => {
		fc.assert(
			fc.property(
				fc.nat({ max: 100 }),
				fc.integer({ min: 1, max: 100 }),
				fc.float({ min: 0, max: 1, noNaN: true }),
				(killed, survived, bar) => {
					const total = killed + survived;
					const before = gate(report(killed, total), bar);
					const after = gate(report(killed + 1, total), bar);
					if (before.verdict === "pass") {
						expect(after.verdict).toBe("pass");
					}
				},
			),
		);
	});
});
