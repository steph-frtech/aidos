import { describe, expect, it } from "vitest";
import { DEMO_THRESHOLD, thresholdDecoder } from "./live";

/**
 * /mutation-score live read — the PARITY MIRROR (Vitest, the frozen front N1 slot).
 *
 * It proves the TS decoder decodes a SAMPLE of the Go mutation-runner `read_threshold`
 * output (mutationrunnersrv.thresholdOutput: `{ scope, threshold, declared }`) — the tool's
 * CONTRACT, NOT a second implementation of the threshold logic. The bar itself is computed
 * by the Go server (SELECT-only on fitness); this test only pins that the wire shape decodes
 * faithfully and that a malformed payload deterministically falls back to the demo bar.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("mutation-score live — read_threshold decoder parity", () => {
	it("decodes a Go-sample thresholdOutput (declared bar) faithfully", () => {
		// A byte-faithful sample of the Go mutationrunnersrv.thresholdOutput JSON.
		const goSample = { scope: "go", threshold: 0.8, declared: true };
		expect(thresholdDecoder(goSample)).toEqual({
			scope: "go",
			threshold: 0.8,
			declared: true,
		});
	});

	it("decodes the not-declared case (declared:false ⇒ MISSING_THRESHOLD)", () => {
		const goSample = { scope: "front", threshold: 0, declared: false };
		expect(thresholdDecoder(goSample)).toEqual({
			scope: "front",
			threshold: 0,
			declared: false,
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(thresholdDecoder(null)).toBeNull();
		expect(thresholdDecoder({ scope: "go", threshold: 0.8 })).toBeNull(); // missing declared
		expect(
			thresholdDecoder({ scope: 42, threshold: 0.8, declared: true }),
		).toBeNull(); // wrong scope type
		expect(
			thresholdDecoder({ scope: "go", threshold: "0.8", declared: true }),
		).toBeNull(); // non-numeric threshold
	});

	it("the demo bar is the declared 0.80 example (deterministic fallback)", () => {
		expect(DEMO_THRESHOLD).toEqual({
			scope: "go",
			threshold: 0.8,
			declared: true,
		});
	});
});
