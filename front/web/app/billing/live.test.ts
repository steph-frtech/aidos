import { describe, expect, it } from "vitest";
import {
	ingestDecoder,
	pactDecoder,
	plansDecoder,
	quotaDecoder,
	usageDecoder,
} from "./live";

/**
 * /billing live reads — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092 kill-twins
 * batch).
 *
 * It proves the TS decoders decode a SAMPLE of the Go billing MCP tools' output (billingsrv:
 * plansOutput / meterOutput / checkQuotaOutput / ingestOutput / pactVerifyOutput, with snake_case
 * fields) — the tools' CONTRACT, NOT a second implementation of the billing logic (the Go billing
 * runtime is authoritative). This test pins only that the wire shapes decode faithfully (the
 * `plans[{plan,quota,next}]` rows, the `usage` wrapper, the quota allow/deny + flat advisory
 * triplet, the ingest log + plan transition, the Pact pass/interactions) and that a malformed
 * payload deterministically falls back to the demo snapshot (decoder returns null).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("billing live — plansDecoder parity", () => {
	it("decodes a Go-sample plansOutput (the closed ladder + declared quotas + upgrade target)", () => {
		const goSample = {
			plans: [
				{
					plan: "free",
					quota: {
						max_llm_tokens: 100_000,
						max_build_loop_minutes: 60,
						max_sandbox_hours: 5,
						max_deployed_apps: 1,
					},
					next: "pro",
				},
				{
					plan: "enterprise",
					quota: {
						max_llm_tokens: 1_000_000_000,
						max_build_loop_minutes: 1_000_000,
						max_sandbox_hours: 100_000,
						max_deployed_apps: 10_000,
					},
					// next omitted at the top of the ladder (omitempty Go-side).
				},
			],
		};
		const decoded = plansDecoder(goSample);
		expect(decoded).toEqual([
			{
				plan: "free",
				quota: {
					maxLLMTokens: 100_000,
					maxBuildLoopMinutes: 60,
					maxSandboxHours: 5,
					maxDeployedApps: 1,
				},
				next: "pro",
			},
			{
				plan: "enterprise",
				quota: {
					maxLLMTokens: 1_000_000_000,
					maxBuildLoopMinutes: 1_000_000,
					maxSandboxHours: 100_000,
					maxDeployedApps: 10_000,
				},
				next: "",
			},
		]);
	});

	it("rejects a malformed plans payload (→ demo fallback)", () => {
		expect(plansDecoder(null)).toBeNull();
		expect(plansDecoder({})).toBeNull(); // no plans array
		// an unknown plan name → null.
		expect(
			plansDecoder({
				plans: [{ plan: "platinum", quota: {}, next: "" }],
			}),
		).toBeNull();
		// a missing quota count → null.
		expect(
			plansDecoder({
				plans: [
					{
						plan: "free",
						quota: { max_llm_tokens: 1, max_build_loop_minutes: 1 },
						next: "pro",
					},
				],
			}),
		).toBeNull();
	});
});

describe("billing live — usageDecoder parity", () => {
	it("decodes a Go-sample meterOutput ({ usage })", () => {
		const decoded = usageDecoder({
			usage: {
				account: "acct-1",
				run_count: 2,
				llm_tokens: 230_000,
				build_loop_minutes: 9,
				sandbox_hours: 0,
				deployed_apps: 0,
			},
		});
		expect(decoded).toEqual({
			account: "acct-1",
			runCount: 2,
			llmTokens: 230_000,
			buildLoopMinutes: 9,
			sandboxHours: 0,
			deployedApps: 0,
		});
	});

	it("rejects a malformed usage payload (→ demo fallback)", () => {
		expect(usageDecoder(null)).toBeNull();
		expect(usageDecoder({})).toBeNull(); // no usage
		expect(
			usageDecoder({
				usage: { account: "x", run_count: 1, llm_tokens: "lots" },
			}),
		).toBeNull(); // non-number count
	});
});

describe("billing live — quotaDecoder parity", () => {
	it("decodes an ALLOW (within quota)", () => {
		expect(quotaDecoder({ verdict: "allow" })).toEqual({ verdict: "allow" });
	});

	it("decodes a DENY carrying over-axes + the upgrade path + the flat advisory triplet", () => {
		const decoded = quotaDecoder({
			verdict: "deny",
			over_axes: ["llm_tokens"],
			upgrade_to: "pro",
			code: "QUOTA_EXCEEDED",
			explanation: "le quota du plan « free » est dépassé sur llm_tokens",
			how_to_fix: ["réduisez la consommation", "passez au plan « pro »"],
		});
		expect(decoded).toEqual({
			verdict: "deny",
			overAxes: ["llm_tokens"],
			upgradeTo: "pro",
			blockReason: {
				code: "QUOTA_EXCEEDED",
				severity: "blocking",
				explanation: "le quota du plan « free » est dépassé sur llm_tokens",
				howToFix: ["réduisez la consommation", "passez au plan « pro »"],
			},
		});
	});

	it("decodes a DENY at the top of the ladder (no upgrade target)", () => {
		const decoded = quotaDecoder({
			verdict: "deny",
			over_axes: ["llm_tokens"],
			code: "QUOTA_EXCEEDED",
			explanation: "…",
			how_to_fix: ["contactez le support"],
		});
		expect(decoded?.upgradeTo).toBe("");
	});

	it("rejects a malformed quota payload (→ demo fallback)", () => {
		expect(quotaDecoder(null)).toBeNull();
		expect(quotaDecoder({ verdict: "maybe" })).toBeNull(); // unknown verdict
	});
});

describe("billing live — ingestDecoder parity", () => {
	it("decodes a Go-sample ingestOutput (accepted, the log + the plan transition)", () => {
		const decoded = ingestDecoder({
			accepted: true,
			duplicate: false,
			event_id: "abc123",
			applied_to: "pro",
			next_plan: "pro",
			log: [
				{
					id: "abc123",
					event: {
						kind: "checkout.completed",
						provider_id: "evt_demo",
						account: "acct-1",
						plan: "pro",
					},
					applied_to: "pro",
				},
			],
		});
		expect(decoded?.accepted).toBe(true);
		expect(decoded?.eventId).toBe("abc123");
		expect(decoded?.nextPlan).toBe("pro");
		expect(decoded?.log).toHaveLength(1);
		expect(decoded?.log[0]).toEqual({
			id: "abc123",
			event: {
				kind: "checkout.completed",
				providerId: "evt_demo",
				account: "acct-1",
				plan: "pro",
			},
			appliedTo: "pro",
		});
	});

	it("decodes a DUPLICATE replay (idempotent — log length unchanged)", () => {
		const decoded = ingestDecoder({
			accepted: true,
			duplicate: true,
			event_id: "abc123",
			next_plan: "pro",
			log: [
				{
					id: "abc123",
					event: {
						kind: "payment.succeeded",
						provider_id: "evt_demo",
						account: "acct-1",
						plan: "",
					},
				},
			],
		});
		expect(decoded?.duplicate).toBe(true);
	});

	it("decodes a REFUSED malformed event (accepted:false + code)", () => {
		const decoded = ingestDecoder({
			accepted: false,
			duplicate: false,
			log: [],
			code: "INVALID_WEBHOOK",
			explanation: "l'événement entrant est mal formé",
		});
		expect(decoded?.accepted).toBe(false);
		expect(decoded?.code).toBe("INVALID_WEBHOOK");
		expect(decoded?.log).toEqual([]);
	});

	it("rejects a malformed ingest payload (→ demo fallback)", () => {
		expect(ingestDecoder(null)).toBeNull();
		expect(ingestDecoder({})).toBeNull(); // no accepted boolean
		expect(ingestDecoder({ accepted: "yes", log: [] })).toBeNull();
		// a malformed log entry → null.
		expect(
			ingestDecoder({ accepted: true, log: [{ id: 1, event: {} }] }),
		).toBeNull();
	});
});

describe("billing live — pactDecoder parity", () => {
	it("decodes a Go-sample pactVerifyOutput (pass + provider + interactions)", () => {
		const decoded = pactDecoder({
			pass: true,
			provider: "stripe",
			reason: "all interactions honoured the contract",
			interactions: [
				"checkout.completed is acknowledged",
				"a malformed event is refused",
			],
		});
		expect(decoded).toEqual({
			pass: true,
			provider: "stripe",
			reason: "all interactions honoured the contract",
			interactions: [
				"checkout.completed is acknowledged",
				"a malformed event is refused",
			],
		});
	});

	it("rejects a malformed pact payload (→ demo fallback)", () => {
		expect(pactDecoder(null)).toBeNull();
		expect(pactDecoder({})).toBeNull(); // no pass boolean
	});
});
