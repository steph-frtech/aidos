import { describe, expect, it } from "vitest";
import {
	demoTerminate,
	gatewayTerminateArgs,
	type TerminationForm,
} from "../../lib/build-loop-data";
import { decisionDecoder } from "./live";

/**
 * /build-loop live terminate read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * batch-2 kill-twins flip).
 *
 * It proves the TS `decisionDecoder` decodes a SAMPLE of the Go build-loop `buildloop_terminate`
 * tool output (buildloopsrv.terminateOutput: `{ verdict, block_code?, explanation?, how_to_fix?,
 * over_budget_axes? }`) — the tool's CONTRACT, NOT a second implementation of the termination logic
 * (the Go buildloop.Terminate is authoritative). This test pins only that the wire shape decodes
 * faithfully (the closed verdict set, the absent block_code → "", the absent over_budget_axes → [],
 * the over-budget witness list) and that a malformed payload deterministically falls back to the
 * demo Decision.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

const baseForm: TerminationForm = {
	redSet: ["m1", "m2"],
	greenSensors: ["m1", "m2"],
	priorBroken: false,
	mutation: 0.9,
	mutationFloor: 0.7,
	monsters: [],
	history: [
		{ diffHash: "d1", greenMirrors: ["m1"] },
		{ diffHash: "d2", greenMirrors: ["m1", "m2"] },
	],
	maxIterations: 50,
	stagnationWindow: 3,
	maxLlmTokens: 0,
	spentLlmTokens: 0,
	valueCaseJustified: false,
};

describe("build-loop live — terminate decoder parity", () => {
	it("decodes a Go-sample terminateOutput (green termination)", () => {
		const goSample = {
			verdict: "green",
			over_budget_axes: [],
		};
		expect(decisionDecoder(goSample)).toEqual({
			verdict: "green",
			blockCode: "",
			overBudgetAxes: [],
		});
	});

	it("decodes a no_progress halt with the block code + over-budget axes", () => {
		const goSample = {
			verdict: "no_progress",
			block_code: "BUILD_LOOP_NO_PROGRESS",
			explanation: "the build spent without advancing",
			how_to_fix: ["narrow the red set", "raise the budget with a ValueCase"],
			over_budget_axes: ["llm_tokens"],
		};
		const decoded = decisionDecoder(goSample);
		expect(decoded?.verdict).toBe("no_progress");
		expect(decoded?.blockCode).toBe("BUILD_LOOP_NO_PROGRESS");
		expect(decoded?.overBudgetAxes).toEqual(["llm_tokens"]);
	});

	it("decodes a continue verdict with an absent block_code + axes", () => {
		// the Go output omits block_code / over_budget_axes when continuing (omitempty).
		const decoded = decisionDecoder({ verdict: "continue" });
		expect(decoded).toEqual({
			verdict: "continue",
			blockCode: "",
			overBudgetAxes: [],
		});
	});

	it("rejects a malformed payload (→ demo fallback)", () => {
		expect(decisionDecoder(null)).toBeNull();
		expect(decisionDecoder({})).toBeNull(); // no verdict
		// a verdict outside the closed set → null.
		expect(decisionDecoder({ verdict: "halted" })).toBeNull();
		// a non-string block_code → null.
		expect(decisionDecoder({ verdict: "green", block_code: 1 })).toBeNull();
		// a non-string element in over_budget_axes → null.
		expect(
			decisionDecoder({ verdict: "no_progress", over_budget_axes: [3] }),
		).toBeNull();
	});

	it("the demo Decision matches the decoded green termination (twin ≡ the live contract shape)", () => {
		// The demo fixture is the twin terminate() of the console form; it yields the SAME Decision
		// shape the live read returns — the twin sits behind source:"demo", identical in shape to the
		// Go-authoritative live Decision.
		const demo = demoTerminate(baseForm);
		expect(demo).toEqual({
			verdict: "green",
			blockCode: "",
			overBudgetAxes: [],
		});
	});

	it("projects the form to the Go terminateInput arg shape (snake_case + nested history)", () => {
		// the gateway-arg projection carries the snake_case fields + the history's {diff_hash,
		// green_mirrors} the Go buildloop_terminate tool decodes.
		const args = gatewayTerminateArgs(baseForm);
		expect(args.red_set).toEqual(["m1", "m2"]);
		expect(args.green_sensors).toEqual(["m1", "m2"]);
		expect(args.history).toEqual([
			{ diff_hash: "d1", green_mirrors: ["m1"] },
			{ diff_hash: "d2", green_mirrors: ["m1", "m2"] },
		]);
		expect(args.stagnation_window).toBe(3);
		expect(args.max_llm_tokens_per_goal).toBe(0);
	});
});
