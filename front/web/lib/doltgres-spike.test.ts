/**
 * S88 reproducibility mirror — TS twin (determinism-first, §8). Pins the gating
 * invariants of the spike verdict as a pure function: determinism, plain-postgres
 * always the default, doltgres opt-in iff Go, reproducible failure flips while a
 * blip does not, and the perf ceiling. Mirrors back/runtime/doltgresspike's
 * property test.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_THRESHOLDS,
	decide,
	evaluate,
	MEASURED_SPIKE,
	type Measurement,
	optInAllowed,
} from "./doltgres-spike";

const arbMeasurement = fc
	.record({
		driver: fc.constantFrom("ts-postgres" as const, "pgx" as const),
		conns: fc.integer({ min: 1, max: 256 }),
		failedRaw: fc.integer({ min: 0, max: 256 }),
		perfRatio: fc.double({ min: 0, max: 20, noNaN: true }),
		reproducible: fc.boolean(),
	})
	.map(
		(r): Measurement => ({
			driver: r.driver,
			conns: r.conns,
			failedConns: Math.min(r.failedRaw, r.conns),
			perfRatio: r.perfRatio,
			reproducible: r.reproducible,
		}),
	);

describe("S88 doltgres spike verdict", () => {
	it("is deterministic — same input → same decision id + verdict", async () => {
		await fc.assert(
			fc.asyncProperty(arbMeasurement, async (m) => {
				const d1 = await decide(m, DEFAULT_THRESHOLDS);
				const d2 = await decide(m, DEFAULT_THRESHOLDS);
				expect(d1.id).toBe(d2.id);
				expect(d1.verdict).toBe(d2.verdict);
				expect(d1.id).not.toBe("");
			}),
		);
	});

	it("default target is ALWAYS plain-postgres", async () => {
		await fc.assert(
			fc.asyncProperty(arbMeasurement, async (m) => {
				const d = await decide(m, DEFAULT_THRESHOLDS);
				expect(d.defaultTarget).toBe("plain-postgres");
				expect(optInAllowed(d, "plain-postgres")).toBe(true);
				expect(d.defaultTarget).not.toBe("doltgres");
			}),
		);
	});

	it("doltgres is opt-in iff verdict is go", async () => {
		await fc.assert(
			fc.asyncProperty(arbMeasurement, async (m) => {
				const d = await decide(m, DEFAULT_THRESHOLDS);
				expect(optInAllowed(d, "doltgres")).toBe(d.verdict === "go");
			}),
		);
	});

	it("a reproducible failure flips to no-go; a blip does not", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 2, max: 256 }),
				fc.double({
					min: 0.5,
					max: DEFAULT_THRESHOLDS.maxPerfRatio,
					noNaN: true,
				}),
				(conns, perfRatio) => {
					const base: Measurement = {
						driver: "ts-postgres",
						conns,
						failedConns: 1,
						perfRatio,
						reproducible: true,
					};
					expect(evaluate(base, DEFAULT_THRESHOLDS).verdict).toBe("no-go");
					expect(
						evaluate({ ...base, reproducible: false }, DEFAULT_THRESHOLDS)
							.verdict,
					).toBe("go");
				},
			),
		);
	});

	it("perf ratio over the declared ceiling forces no-go", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 256 }), (conns) => {
				const stable: Measurement = {
					driver: "ts-postgres",
					conns,
					failedConns: 0,
					perfRatio: DEFAULT_THRESHOLDS.maxPerfRatio + 1,
					reproducible: true,
				};
				expect(evaluate(stable, DEFAULT_THRESHOLDS).verdict).toBe("no-go");
				expect(
					evaluate(
						{ ...stable, perfRatio: DEFAULT_THRESHOLDS.maxPerfRatio },
						DEFAULT_THRESHOLDS,
					).verdict,
				).toBe("go");
			}),
		);
	});

	it("the cited ~5.2× slowdown with full stability is still a go", async () => {
		const m: Measurement = {
			driver: "ts-postgres",
			conns: 64,
			failedConns: 0,
			perfRatio: 5.2,
			reproducible: true,
		};
		expect((await decide(m)).verdict).toBe("go");
	});

	it("the measured spike run (N=64, 0 failed) is a go with plain-postgres default", async () => {
		const d = await decide(MEASURED_SPIKE);
		expect(d.verdict).toBe("go");
		expect(d.defaultTarget).toBe("plain-postgres");
		expect(optInAllowed(d, "doltgres")).toBe(true);
	});
});
