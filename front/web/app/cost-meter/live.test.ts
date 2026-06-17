import { describe, expect, it } from "vitest";
import { lookup } from "../../lib/gateway";
import { meterDecoder, signalDecoder } from "./live";

/**
 * /cost-meter live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 kill-twins
 * batch-2).
 *
 * It proves the TS `meterDecoder` / `signalDecoder` decode a SAMPLE of the Go cost-meter MCP tools'
 * output (costmetersrv.meterOut: cell_ref / run_count / metered_tokens / metered_ci_minutes /
 * verdict / over_axes / flagged / block_code / explanation / how_to_fix ; signalOut: trip /
 * over_axes / block_code / explanation / how_to_fix) — the tools' CONTRACT, NOT a second
 * implementation of the metering logic (the Go costmeter.MeterCell is authoritative). This test
 * pins only that the wire shape decodes faithfully (the snake_case fields, the §66.3 verdict enum,
 * the FLAT advisory triplet → a front BlockReason, an absent witness list → []) and that a malformed
 * payload deterministically falls back (the decoder returns null → readVia yields the demo verdict).
 *
 * It ALSO proves the FLIP IS NOT HOLLOW: the front registry resolves `cost_meter_cell` /
 * `cost_disjoncteur_signal` to the `cost-meter` server, so readVia wraps a real dispatched call
 * (without that registration route(tool)→unknown_tool→always source:"demo" — the cliquet's
 * readVia-frontier blind spot).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("cost-meter live — gateway registration (the flip is not hollow)", () => {
	it("resolves cost_meter_cell to the cost-meter server", () => {
		expect(lookup("cost_meter_cell")).toEqual({
			name: "cost_meter_cell",
			server: "cost-meter",
			disposition: "below_line",
		});
	});

	it("resolves cost_disjoncteur_signal to the cost-meter server", () => {
		expect(lookup("cost_disjoncteur_signal")).toEqual({
			name: "cost_disjoncteur_signal",
			server: "cost-meter",
			disposition: "below_line",
		});
	});

	it("resolves cost_validate_budget to the cost-meter server", () => {
		expect(lookup("cost_validate_budget")?.server).toBe("cost-meter");
	});
});

describe("cost-meter live — meterDecoder parity", () => {
	it("decodes a within-budget meterOut (no advisory)", () => {
		const goSample = {
			cell_ref: "checkout",
			run_count: 3,
			metered_tokens: 38000,
			metered_ci_minutes: 6,
			verdict: "within_budget",
			flagged: false,
		};
		const decoded = meterDecoder(goSample);
		expect(decoded).toEqual({
			cellMeter: {
				cellRef: "checkout",
				runCount: 3,
				meter: { tokens: 38000, turns: 0, ciMinutes: 6, wallClockSecs: 0 },
				cost: {
					llmTokens: 38000,
					ciMinutes: 6,
					mutationRuntimeSeconds: 0,
					humanReviewMinutes: 0,
				},
			},
			decision: {
				cellRef: "checkout",
				verdict: "within_budget",
				overAxes: [],
				blockReason: null,
			},
		});
	});

	it("decodes an over_budget_flagged meterOut carrying the FLAT advisory triplet", () => {
		const decoded = meterDecoder({
			cell_ref: "checkout",
			run_count: 4,
			metered_tokens: 78000,
			metered_ci_minutes: 8,
			verdict: "over_budget_flagged",
			over_axes: ["llm_tokens"],
			flagged: true,
			block_code: "HARNESS_COST_EXCEEDS_BUDGET",
			explanation: "le coût mesuré dépasse le cap déclaré sur llm_tokens",
			how_to_fix: [
				"open_value_case",
				"reduce_harness_cost",
				"raise_budget_via_goal",
			],
		});
		expect(decoded?.cellMeter.cost.llmTokens).toBe(78000);
		expect(decoded?.decision.verdict).toBe("over_budget_flagged");
		expect(decoded?.decision.overAxes).toEqual(["llm_tokens"]);
		expect(decoded?.decision.blockReason).toEqual({
			code: "HARNESS_COST_EXCEEDS_BUDGET",
			severity: "blocking",
			explanation: "le coût mesuré dépasse le cap déclaré sur llm_tokens",
			howToFix: [
				"open_value_case",
				"reduce_harness_cost",
				"raise_budget_via_goal",
			],
		});
	});

	it("decodes an over_budget_justified meterOut (over axes, no advisory)", () => {
		const decoded = meterDecoder({
			cell_ref: "checkout",
			run_count: 4,
			metered_tokens: 78000,
			metered_ci_minutes: 8,
			verdict: "over_budget_justified",
			over_axes: ["llm_tokens"],
			flagged: false,
		});
		expect(decoded?.decision.verdict).toBe("over_budget_justified");
		expect(decoded?.decision.overAxes).toEqual(["llm_tokens"]);
		expect(decoded?.decision.blockReason).toBeNull();
	});

	it("rejects a malformed meterOut payload (→ demo fallback)", () => {
		expect(meterDecoder(null)).toBeNull();
		expect(meterDecoder({})).toBeNull();
		// a missing required count → null.
		expect(
			meterDecoder({
				cell_ref: "checkout",
				run_count: 3,
				metered_tokens: 38000,
				// metered_ci_minutes missing
				verdict: "within_budget",
			}),
		).toBeNull();
		// a verdict outside the closed enum → null.
		expect(
			meterDecoder({
				cell_ref: "checkout",
				run_count: 3,
				metered_tokens: 38000,
				metered_ci_minutes: 6,
				verdict: "maybe",
			}),
		).toBeNull();
		// a non-number count → null.
		expect(
			meterDecoder({
				cell_ref: "checkout",
				run_count: "x",
				metered_tokens: 38000,
				metered_ci_minutes: 6,
				verdict: "within_budget",
			}),
		).toBeNull();
	});
});

describe("cost-meter live — signalDecoder parity", () => {
	it("decodes a tripped signalOut carrying the advisory", () => {
		const decoded = signalDecoder({
			trip: true,
			over_axes: ["llm_tokens"],
			block_code: "HARNESS_COST_EXCEEDS_BUDGET",
			explanation: "over budget without a justified value case",
			how_to_fix: ["open_value_case"],
		});
		expect(decoded?.trip).toBe(true);
		expect(decoded?.overAxes).toEqual(["llm_tokens"]);
		expect(decoded?.blockReason).toEqual({
			code: "HARNESS_COST_EXCEEDS_BUDGET",
			severity: "blocking",
			explanation: "over budget without a justified value case",
			howToFix: ["open_value_case"],
		});
	});

	it("decodes a non-tripped signalOut (no advisory, absent witnesses → [])", () => {
		const decoded = signalDecoder({ trip: false });
		expect(decoded).toEqual({ trip: false, overAxes: [], blockReason: null });
	});

	it("rejects a malformed signalOut payload (→ demo fallback)", () => {
		expect(signalDecoder(null)).toBeNull();
		expect(signalDecoder({})).toBeNull(); // no `trip`
		expect(signalDecoder({ trip: "yes" })).toBeNull(); // non-boolean trip
	});
});
