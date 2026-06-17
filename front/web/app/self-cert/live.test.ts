import { describe, expect, it } from "vitest";
import { batteryDecoder } from "./live";

/**
 * /self-cert live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 batch-4A).
 *
 * It proves the TS batteryDecoder decodes a SAMPLE of the Go self-cert MCP `selfcert_certify` output
 * (selfcertsrv certifyOutput, snake_case block_code/red_sensors) — the tool's CONTRACT, NOT a second
 * implementation of the battery logic (the Go selfcert.Certify is authoritative; the judge is the
 * deterministic mirror, never the LLM). It pins only that the wire shape decodes faithfully (the green
 * fold, the BUILD_LOOP_SENSOR_RED block, the red-sensor list) and that a malformed payload
 * deterministically falls back to the demo battery (the decoder returns null).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM. THE WALL (§2): WroteKernel always
 * false (the certify folds a verdict set into a VALUE).
 */
describe("self-cert live — batteryDecoder parity", () => {
	it("decodes a Go-sample full-green certifyOutput", () => {
		const goSample = {
			green: true,
			sensors: [
				{ kind: "types", state: "green" },
				{ kind: "lint", state: "green" },
				{ kind: "unit", state: "green" },
				{ kind: "fixture", state: "green" },
				{ kind: "property", state: "green" },
				{ kind: "pact", state: "green" },
				{ kind: "archfit", state: "green" },
			],
		};
		const b = batteryDecoder(goSample);
		expect(b).not.toBeNull();
		expect(b?.green).toBe(true);
		expect(b?.sensors).toHaveLength(7);
		expect(b?.blockCode).toBeUndefined();
	});

	it("decodes a Go-sample red certifyOutput (BUILD_LOOP_SENSOR_RED + red_sensors)", () => {
		const goSample = {
			green: false,
			sensors: [
				{ kind: "types", state: "green" },
				{ kind: "lint", state: "green" },
				{ kind: "unit", state: "green" },
				{ kind: "fixture", state: "green" },
				{ kind: "property", state: "green" },
				{
					kind: "pact",
					state: "red",
					detail: "pact: provider verification failed",
				},
				{ kind: "archfit", state: "green" },
			],
			red_sensors: ["pact"],
			block_code: "BUILD_LOOP_SENSOR_RED",
			explanation: "a sensor is red",
			how_to_fix: ["fix the Pact contract"],
		};
		const b = batteryDecoder(goSample);
		expect(b).not.toBeNull();
		expect(b?.green).toBe(false);
		expect(b?.blockCode).toBe("BUILD_LOOP_SENSOR_RED");
		expect(b?.redSensors).toEqual(["pact"]);
		expect(b?.sensors.find((s) => s.kind === "pact")?.detail).toBe(
			"pact: provider verification failed",
		);
	});

	it("a malformed payload returns null (deterministic demo fallback)", () => {
		expect(batteryDecoder({ green: "yes" })).toBeNull();
		expect(batteryDecoder({ green: true, sensors: "nope" })).toBeNull();
		expect(batteryDecoder(null)).toBeNull();
		expect(
			batteryDecoder({
				green: true,
				sensors: [{ kind: "ghost", state: "green" }],
			}),
		).toBeNull();
	});
});
