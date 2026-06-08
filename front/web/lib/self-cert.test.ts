import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type Battery,
	CODE_BUILD_LOOP_SENSOR_RED,
	type SensorKind,
	type SensorVerdict,
	SENSOR_KINDS,
	certify,
	gateGreen,
	redSensors,
	toStopSensors,
} from "./self-cert";

/**
 * lib/self-cert.test.ts — the S84 REPRODUCIBILITY mirror (fast-check), the TS half of the twin.
 * It pins the determinism-first laws of the self-certification battery AND its parity with the
 * Go authority (back/runtime/buildloop/selfcert): same verdicts ⇒ same battery; the gate is the
 * seven-sensor conjunction (anti-passthrough); a red battery always carries BUILD_LOOP_SENSOR_RED;
 * flipping any single sensor red blocks an otherwise-green battery; toStopSensors is fail-closed.
 */

const genState = fc.constantFrom<"red" | "green">("red", "green");

function genVerdicts(): fc.Arbitrary<SensorVerdict[]> {
	return fc
		.record(
			Object.fromEntries(
				SENSOR_KINDS.map((k) => [k, fc.option(genState, { nil: undefined })]),
			) as Record<SensorKind, fc.Arbitrary<"red" | "green" | undefined>>,
		)
		.map((rec) => {
			const out: SensorVerdict[] = [];
			for (const k of SENSOR_KINDS) {
				const s = rec[k];
				if (s) out.push({ kind: k, state: s });
			}
			return out;
		});
}

describe("self-cert battery (S84 twin)", () => {
	it("certify is a pure function of the verdicts", () => {
		fc.assert(
			fc.property(genVerdicts(), (v) => {
				expect(certify(v)).toEqual(certify(v));
			}),
		);
	});

	it("the gate is the seven-sensor conjunction (anti-passthrough)", () => {
		fc.assert(
			fc.property(genVerdicts(), (v) => {
				const byKind = new Map(v.map((x) => [x.kind, x.state]));
				const want = SENSOR_KINDS.every((k) => byKind.get(k) === "green");
				expect(gateGreen(v)).toBe(want);
			}),
		);
	});

	it("a red battery always carries an actionable BUILD_LOOP_SENSOR_RED", () => {
		fc.assert(
			fc.property(genVerdicts(), (v) => {
				const b = certify(v);
				if (b.green) {
					expect(b.blockCode).toBeUndefined();
				} else {
					expect(b.blockCode).toBe(CODE_BUILD_LOOP_SENSOR_RED);
					expect((b.redSensors ?? []).length).toBeGreaterThan(0);
				}
			}),
		);
	});

	it("flipping any single sensor red blocks an otherwise-green battery (fault-injection)", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: SENSOR_KINDS.length - 1 }),
				(idx) => {
					const v: SensorVerdict[] = SENSOR_KINDS.map((k, i) => ({
						kind: k,
						state: i === idx ? "red" : "green",
					}));
					const b = certify(v);
					expect(b.green).toBe(false);
					expect(redSensors(b.sensors)).toEqual([SENSOR_KINDS[idx]]);
				},
			),
		);
	});

	it("a clean battery certifies green with no block", () => {
		const v: SensorVerdict[] = SENSOR_KINDS.map((k) => ({
			kind: k,
			state: "green",
		}));
		const b = certify(v);
		expect(b.green).toBe(true);
		expect(b.blockCode).toBeUndefined();
		expect(b.sensors).toHaveLength(SENSOR_KINDS.length);
	});

	it("toStopSensors is fail-closed", () => {
		fc.assert(
			fc.property(
				genVerdicts(),
				fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 5 }),
				(v, redSet) => {
					const b: Battery = certify(v);
					const stop = toStopSensors(redSet, b);
					for (const m of redSet) {
						expect(stop[m]).toBe(b.green ? "green" : "red");
					}
				},
			),
		);
	});
});
