import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	applyEvent,
	checkQuota,
	ingestWebhook,
	isPlan,
	type MeteredRun,
	meterProject,
	meterUsage,
	nextPlan,
	PLAN_LADDER,
	PLAN_QUOTAS,
	type Plan,
	quotaOf,
	type Usage,
	WEBHOOK_KINDS,
	type WebhookEvent,
} from "./billing";

const arbRun = (account: string) =>
	fc.record({
		account: fc.constant(account),
		project: fc.constantFrom("p1", "p2", "p3"),
		runId: fc.string({ minLength: 1, maxLength: 6 }),
		meter: fc.record({
			tokens: fc.integer({ min: 0, max: 5_000_000 }),
			ciMinutes: fc.integer({ min: 0, max: 5_000 }),
		}),
		sandboxSeconds: fc.integer({ min: 0, max: 1_000_000 }),
		deployedApps: fc.integer({ min: 0, max: 50 }),
	}) as fc.Arbitrary<MeteredRun>;

describe("S114 billing — plans", () => {
	it("the ladder is the closed four, strictly ascending", () => {
		expect(PLAN_LADDER).toEqual(["free", "pro", "scale", "enterprise"]);
		for (let i = 1; i < PLAN_LADDER.length; i++) {
			const lo = quotaOf(PLAN_LADDER[i - 1]);
			const hi = quotaOf(PLAN_LADDER[i]);
			expect(hi.maxLLMTokens).toBeGreaterThan(lo.maxLLMTokens);
			expect(hi.maxBuildLoopMinutes).toBeGreaterThan(lo.maxBuildLoopMinutes);
			expect(hi.maxSandboxHours).toBeGreaterThan(lo.maxSandboxHours);
			expect(hi.maxDeployedApps).toBeGreaterThan(lo.maxDeployedApps);
		}
	});
	it("free upgrades to pro; enterprise has no next", () => {
		expect(nextPlan("free")).toBe("pro");
		expect(nextPlan("enterprise")).toBe("");
	});
});

describe("S114 billing — metering is a deterministic count", () => {
	it("is reproducible (same runs ⇒ same usage)", () => {
		fc.assert(
			fc.property(fc.array(arbRun("acct"), { maxLength: 12 }), (runs) => {
				expect(meterUsage("acct", runs)).toEqual(meterUsage("acct", runs));
			}),
		);
	});
	it("is an exact count (sums the contributing runs)", () => {
		fc.assert(
			fc.property(fc.array(arbRun("acct"), { maxLength: 12 }), (runs) => {
				const u = meterUsage("acct", runs);
				const tok = runs.reduce((s, r) => s + r.meter.tokens, 0);
				expect(u.llmTokens).toBe(tok);
				expect(u.runCount).toBe(runs.length);
			}),
		);
	});
	it("is exactly attributable per project (per-project sums to account)", () => {
		fc.assert(
			fc.property(fc.array(arbRun("acct"), { maxLength: 12 }), (runs) => {
				const total = meterUsage("acct", runs).llmTokens;
				const sum = ["p1", "p2", "p3"].reduce(
					(s, p) => s + meterProject("acct", p, runs).llmTokens,
					0,
				);
				expect(sum).toBe(total);
			}),
		);
	});
});

describe("S114 billing — quota never fails silently", () => {
	it("over-quota always denies QUOTA_EXCEEDED with an upgrade path; under always allows", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...PLAN_LADDER),
				fc.integer({ min: 0, max: 50_000_000 }),
				(plan: Plan, tokens: number) => {
					const u: Usage = {
						account: "a",
						runCount: 1,
						llmTokens: tokens,
						buildLoopMinutes: 0,
						sandboxHours: 0,
						deployedApps: 0,
					};
					const dec = checkQuota(plan, u);
					const over = tokens > PLAN_QUOTAS[plan].maxLLMTokens;
					if (over) {
						expect(dec.verdict).toBe("deny");
						expect(dec.blockReason?.code).toBe("QUOTA_EXCEEDED");
						expect(dec.blockReason?.howToFix.length).toBeGreaterThan(0);
					} else {
						expect(dec.verdict).toBe("allow");
					}
				},
			),
		);
	});
	it("an unknown plan denies UNKNOWN_PLAN", () => {
		const dec = checkQuota("starter", {
			account: "a",
			runCount: 0,
			llmTokens: 0,
			buildLoopMinutes: 0,
			sandboxHours: 0,
			deployedApps: 0,
		});
		expect(dec.verdict).toBe("deny");
		expect(dec.blockReason?.code).toBe("UNKNOWN_PLAN");
	});
});

describe("S114 billing — inbound webhook is idempotent", () => {
	it("a replayed event is suppressed (exactly-once relative)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...WEBHOOK_KINDS),
				fc.integer({ min: 1, max: 6 }),
				(kind, reps) => {
					const e: WebhookEvent = { kind, providerId: "evt_x", account: "a" };
					if (kind === "checkout.completed" || kind === "subscription.updated")
						e.plan = "pro";
					let log: ReturnType<typeof ingestWebhook>["log"] = [];
					for (let i = 0; i < reps; i++) log = ingestWebhook(log, e).log;
					expect(log.length).toBe(1);
				},
			),
		);
	});
	it("checkout applies the bought plan; cancel returns to free; payment unchanged", () => {
		expect(
			applyEvent("free", {
				kind: "checkout.completed",
				providerId: "e",
				account: "a",
				plan: "scale",
			}),
		).toBe("scale");
		expect(
			applyEvent("scale", {
				kind: "subscription.canceled",
				providerId: "e",
				account: "a",
			}),
		).toBe("free");
		expect(
			applyEvent("pro", {
				kind: "payment.succeeded",
				providerId: "e",
				account: "a",
			}),
		).toBe("pro");
	});
	it("a malformed event is refused, never silently dropped", () => {
		expect(() =>
			ingestWebhook([], {
				kind: "not.a.kind" as WebhookEvent["kind"],
				providerId: "e",
				account: "a",
			}),
		).toThrow();
	});
	it("guards: isPlan", () => {
		expect(isPlan("pro")).toBe(true);
		expect(isPlan("gold")).toBe(false);
	});
	it("the event id is byte-identical to the Go records.Hash (cross-language parity)", () => {
		// Pinned from the Go eventID for the same event — the TS twin must content-address identically.
		const { record } = ingestWebhook([], {
			kind: "checkout.completed",
			providerId: "evt_42",
			account: "acct-4",
			plan: "pro",
		});
		expect(record.id).toBe(
			"e0162ca73a7bc1b45728292c516b4fa3a8f5c04f4673d03c82e6036f6f8df4d3",
		);
	});
});
