import { describe, expect, it } from "vitest";
import type { ConsoleInput, StablePhaseRequest } from "../../lib/build-console";
import {
	demoProject,
	demoStable,
	gatewayProjectArgs,
	gatewayStableArgs,
} from "../../lib/build-console-data";
import { projectDecoder, stableDecoder } from "./live";

/**
 * /build-console live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch-2).
 *
 * It proves the TS `projectDecoder` / `stableDecoder` decode a SAMPLE of the Go build-console
 * tools' outputs (buildconsolesrv.projectOutput / recordStableOutput — snake_case fields) — the
 * tools' CONTRACT, NOT a second implementation of the projection logic (the Go
 * buildconsole.Project / RecordStablePhase is authoritative). This test pins only that the wire
 * shapes decode faithfully (the snake_case identity/counts, the attempts/sensors witnesses, the
 * stable verdict + the refusal block code/how-to-fix) and that a malformed payload deterministically
 * falls back to the demo view. It also asserts the gateway-arg projections carry NO json.RawMessage
 * body (the S59 scar): writes/links/sensors ride as arrays of objects.
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("build-console live — projectDecoder parity", () => {
	it("decodes a Go-sample projectOutput (green, faithful)", () => {
		const goSample = {
			run_id: "run-checkout-1",
			goal: "goal-order-checkout",
			result: "green",
			attempts: [{ index: 1, diff_hash: "diff-1", authorised: true }],
			sensors: [{ id: "Order.checkout.feature", green: true }],
			ci_minutes_spent: 4,
			ci_minutes_cap: 30,
			llm_tokens_spent: 12000,
			llm_tokens_cap: 100000,
			over_budget_axes: [],
			verdict: "green",
			breaker_tripped: false,
			approval_pending_count: 2,
			approval_pending_ids: ["prop-1", "prop-2"],
			faithful_projection: true,
		};
		const decoded = projectDecoder(goSample);
		expect(decoded).toEqual({
			runId: "run-checkout-1",
			goal: "goal-order-checkout",
			result: "green",
			attempts: [{ index: 1, diffHash: "diff-1", authorised: true }],
			sensors: [{ id: "Order.checkout.feature", green: true }],
			ciSpent: 4,
			ciCap: 30,
			tokensSpent: 12000,
			tokensCap: 100000,
			overBudgetAxes: [],
			verdict: "green",
			breakerTripped: false,
			pendingCount: 2,
			pendingIds: ["prop-1", "prop-2"],
			faithfulProjection: true,
		});
	});

	it("tolerates absent omitempty witnesses (no attempts/sensors/pending)", () => {
		const decoded = projectDecoder({
			run_id: "r",
			goal: "g",
			result: "still_red",
			ci_minutes_spent: 0,
			ci_minutes_cap: 0,
			llm_tokens_spent: 0,
			llm_tokens_cap: 0,
			verdict: "no_progress",
			breaker_tripped: true,
			faithful_projection: false,
		});
		expect(decoded?.attempts).toEqual([]);
		expect(decoded?.sensors).toEqual([]);
		expect(decoded?.pendingIds).toEqual([]);
		expect(decoded?.pendingCount).toBe(0);
		expect(decoded?.breakerTripped).toBe(true);
		expect(decoded?.faithfulProjection).toBe(false);
	});

	it("rejects a malformed projectOutput (→ demo fallback)", () => {
		expect(projectDecoder(null)).toBeNull();
		expect(projectDecoder({})).toBeNull();
		// a missing required count → null.
		expect(
			projectDecoder({
				run_id: "r",
				goal: "g",
				result: "green",
				ci_minutes_spent: 0,
				ci_minutes_cap: 0,
				llm_tokens_spent: 0,
				// llm_tokens_cap missing
				verdict: "green",
			}),
		).toBeNull();
		// a missing required string (verdict) → null.
		expect(
			projectDecoder({
				run_id: "r",
				goal: "g",
				result: "green",
				ci_minutes_spent: 0,
				ci_minutes_cap: 0,
				llm_tokens_spent: 0,
				llm_tokens_cap: 0,
			}),
		).toBeNull();
	});
});

describe("build-console live — stableDecoder parity", () => {
	it("decodes a Go-sample recordStableOutput (stable, recorded)", () => {
		const decoded = stableDecoder({
			stable: true,
			recorded: true,
			node_id: "phase-abc123",
			parent_ids: ["genesis"],
			reasons: [],
		});
		expect(decoded).toEqual({
			stable: true,
			recorded: true,
			nodeId: "phase-abc123",
			parentIds: ["genesis"],
			reasons: [],
			blockCode: undefined,
			explanation: undefined,
			howToFix: [],
		});
	});

	it("decodes a refused recordStableOutput (inconsistent cut)", () => {
		const decoded = stableDecoder({
			stable: false,
			recorded: false,
			reasons: ["createOrder.fixture"],
			block_code: "STABLE_PHASE_INCONSISTENT_CUT",
			explanation: "the cut is not coherent",
			how_to_fix: [
				"Rendez chaque miroir vert d'abord.",
				"Relancez aidos stable.",
			],
		});
		expect(decoded?.stable).toBe(false);
		expect(decoded?.recorded).toBe(false);
		expect(decoded?.blockCode).toBe("STABLE_PHASE_INCONSISTENT_CUT");
		expect(decoded?.reasons).toEqual(["createOrder.fixture"]);
		expect(decoded?.howToFix).toHaveLength(2);
		expect(decoded?.nodeId).toBeUndefined();
	});

	it("rejects a malformed recordStableOutput (→ demo fallback)", () => {
		expect(stableDecoder(null)).toBeNull();
		// missing required booleans → null.
		expect(stableDecoder({ stable: true })).toBeNull();
		expect(stableDecoder({ recorded: false })).toBeNull();
		// wrong type for a required bool → null.
		expect(stableDecoder({ stable: "yes", recorded: false })).toBeNull();
	});
});

describe("build-console live — gateway-arg projection (no RawMessage body)", () => {
	it("projects the console input to the Go projectInput snake_case (writes as objects)", () => {
		const input: ConsoleInput = {
			runId: "run-1",
			goal: "g",
			result: "green",
			writes: [{ diffHash: "diff-1", authorised: true }],
			diffHashes: ["diff-1"],
			greenMirrors: ["m1"],
			verdict: "green",
			ciMinutesSpent: 4,
			ciMinutesCap: 30,
			llmTokensSpent: 12000,
			llmTokensCap: 100000,
			overBudgetAxes: [],
			pending: ["prop-1"],
		};
		const args = gatewayProjectArgs(input);
		expect(args.run_id).toBe("run-1");
		expect(args.max_ci_minutes).toBe(30);
		expect(args.max_llm_tokens_per_goal).toBe(100000);
		expect(args.spent_ci_minutes).toBe(4);
		// the writes ride as an array of OBJECTS, never a json.RawMessage byte-array (the S59 scar).
		expect(args.writes).toEqual([{ diff_hash: "diff-1", authorised: true }]);
		expect(Array.isArray(args.diff_hashes)).toBe(true);
	});

	it("projects the §43 cut to the Go recordStableInput snake_case (links/sensors as objects)", () => {
		const req: StablePhaseRequest = {
			projectId: "shop",
			cut: { createOrder: "v3" },
			heads: { createOrder: "v3" },
			links: [
				{
					fromId: "checkout",
					fromVersion: "v1",
					toId: "createOrder",
					toVersion: "v3",
				},
			],
			sensors: [{ id: "createOrder.fixture", pass: true }],
			label: "checkout-stable",
		};
		const args = gatewayStableArgs(req);
		expect(args.project_slug).toBe("shop");
		expect(args.cut).toEqual({ createOrder: "v3" });
		expect(args.links).toEqual([
			{
				from_id: "checkout",
				from_version: "v1",
				to_id: "createOrder",
				to_version: "v3",
			},
		]);
		expect(args.sensors).toEqual([{ id: "createOrder.fixture", pass: true }]);
	});
});

describe("build-console live — demo fallback ≡ the live contract shape (twin behind source:demo)", () => {
	it("the demo project view decodes to the same shape the live read returns", () => {
		const input: ConsoleInput = {
			runId: "run-checkout-1",
			goal: "goal-order-checkout",
			result: "green",
			writes: [{ diffHash: "diff-1", authorised: true }],
			diffHashes: ["diff-1"],
			greenMirrors: ["Order.checkout.feature"],
			verdict: "green",
			ciMinutesSpent: 4,
			ciMinutesCap: 30,
			llmTokensSpent: 12000,
			llmTokensCap: 100000,
			overBudgetAxes: [],
			pending: ["prop-2", "prop-1"],
		};
		const demo = demoProject(input);
		// the demo view has the exact ProjectView shape the live decoder produces.
		expect(demo.runId).toBe("run-checkout-1");
		expect(demo.faithfulProjection).toBe(true);
		expect(demo.attempts).toEqual([
			{ index: 1, diffHash: "diff-1", authorised: true },
		]);
		// the approval ids are sorted (the twin authority's contract).
		expect(demo.pendingIds).toEqual(["prop-1", "prop-2"]);
		expect(demo.pendingCount).toBe(2);
	});

	it("the demo stable view refuses an inconsistent cut (no node from a red mirror)", () => {
		const req: StablePhaseRequest = {
			projectId: "shop",
			cut: { createOrder: "v3" },
			heads: { createOrder: "v3" },
			links: [],
			sensors: [{ id: "createOrder.fixture", pass: false }],
			label: "checkout-stable",
		};
		const demo = demoStable(req);
		expect(demo.stable).toBe(false);
		expect(demo.recorded).toBe(false);
		expect(demo.blockCode).toBe("STABLE_PHASE_INCONSISTENT_CUT");
		expect(demo.reasons).toContain("createOrder.fixture");
	});
});
