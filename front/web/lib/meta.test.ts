import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	CANONICAL_SENSORS,
	fauxHash,
	type Harness,
	PROTECTED_SCHEMAS,
	type ProtectedSchema,
	run,
	sensorsFired,
} from "./meta";
import { FITNESS_BASELINE_HASH, FITNESS_BASELINE_ROWS } from "./meta-data";

const at = "2026-06-01T00:00:00Z";

function healthy(): Harness {
	return {
		sensors: [...CANONICAL_SENSORS],
		mutedSensors: [],
		breachedSchemas: [],
		fitnessRows: FITNESS_BASELINE_ROWS,
		baselineHash: FITNESS_BASELINE_HASH,
	};
}

describe("meta self-test twin (S39)", () => {
	it("a healthy harness is green: all sensors fired, wall refused, fitness unchanged", () => {
		const { report, block } = run(healthy(), at);
		expect(block).toBeNull();
		expect(report.verdict).toBe("green");
		expect(sensorsFired(report)).toBe(5);
		expect(report.wallProbe.attempts.every((a) => a.refused)).toBe(true);
		expect(report.fitnessProbe.unchanged).toBe(true);
		// the wall is probed on kernel, mirrors AND fitness
		expect(report.wallProbe.attempts.map((a) => a.schema)).toEqual([
			"kernel",
			"mirrors",
			"fitness",
		]);
	});

	it("a muted sensor reddens with MUTED_SENSOR", () => {
		const h = { ...healthy(), mutedSensors: ["archtest"] };
		const { report, block } = run(h, at);
		expect(report.verdict).toBe("red");
		expect(block?.code).toBe("MUTED_SENSOR");
		expect(block?.howToFix.length).toBeGreaterThan(0);
	});

	it("a breached wall reddens with WALL_BREACHED", () => {
		const h: Harness = { ...healthy(), breachedSchemas: ["kernel"] };
		const { report, block } = run(h, at);
		expect(report.verdict).toBe("red");
		expect(block?.code).toBe("WALL_BREACHED");
		expect(
			report.wallProbe.attempts.find((a) => a.schema === "kernel")?.refused,
		).toBe(false);
	});

	it("a mutated fitness reddens with FITNESS_MUTATED", () => {
		const h = { ...healthy(), fitnessRows: '{"def":"mutated"}' };
		const { report, block } = run(h, at);
		expect(report.verdict).toBe("red");
		expect(block?.code).toBe("FITNESS_MUTATED");
		expect(report.fitnessProbe.unchanged).toBe(false);
	});

	it("determinism: run(h,t) == run(h,t)", () => {
		fc.assert(
			fc.property(
				fc.subarray([...CANONICAL_SENSORS], { minLength: 1 }),
				fc.boolean(),
				fc.boolean(),
				(sensors, anyMuted, fitnessMutated) => {
					const h: Harness = {
						sensors,
						mutedSensors: anyMuted ? [sensors[0]] : [],
						breachedSchemas: [],
						fitnessRows: fitnessMutated ? '{"x":1}' : FITNESS_BASELINE_ROWS,
						baselineHash: FITNESS_BASELINE_HASH,
					};
					expect(run(h, at)).toEqual(run(h, at));
				},
			),
		);
	});

	it("∀ any muted sensor ⇒ red", () => {
		fc.assert(
			fc.property(
				fc.subarray([...CANONICAL_SENSORS], { minLength: 1 }),
				(sensors) => {
					const h: Harness = {
						sensors,
						mutedSensors: [sensors[0]],
						breachedSchemas: [],
						fitnessRows: FITNESS_BASELINE_ROWS,
						baselineHash: FITNESS_BASELINE_HASH,
					};
					expect(run(h, at).report.verdict).toBe("red");
				},
			),
		);
	});

	it("∀ any accepted above-the-line write ⇒ red", () => {
		fc.assert(
			fc.property(
				fc.constantFrom<ProtectedSchema>(...PROTECTED_SCHEMAS),
				(schema) => {
					const h: Harness = { ...healthy(), breachedSchemas: [schema] };
					expect(run(h, at).report.verdict).toBe("red");
				},
			),
		);
	});

	it("∀ fitness rows != baseline ⇒ unchanged false ∧ red", () => {
		fc.assert(
			fc.property(fc.string({ minLength: 1 }), (salt) => {
				const rows = `{"def":"mutated","salt":${JSON.stringify(salt)}}`;
				if (fauxHash(rows) === FITNESS_BASELINE_HASH) return; // skip improbable collision
				const h: Harness = { ...healthy(), fitnessRows: rows };
				const { report } = run(h, at);
				expect(report.fitnessProbe.unchanged).toBe(false);
				expect(report.verdict).toBe("red");
			}),
		);
	});

	it("the twin matches the seeded healthy baseline hash (read-only on fitness)", () => {
		expect(fauxHash(FITNESS_BASELINE_ROWS)).toBe(FITNESS_BASELINE_HASH);
	});
});
