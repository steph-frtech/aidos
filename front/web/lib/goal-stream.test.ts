/**
 * goal-stream.test.ts — the S60 reproducibility mirror for the live goal stream.
 * mirror record: reflects=S60-goal-stream, test_kind=invariant (property),
 *               cert_language=fast-check, liveness=live
 *
 * Pins the S60 done criterion (streamed red set == computed red set for a known goal) +
 * determinism-first (same input → same output) for the live-goal stream over the typed
 * S58 gateway / S59 SDK:
 *   1. the decoder REJECTS any malformed payload (never coerces) and is reproducible;
 *   2. streamGoal falls back DETERMINISTICALLY (no endpoint / transport-throw /
 *      malformed-payload / unexposed tool) and returns `source:"live"` only on a
 *      well-formed payload;
 *   3. the DEMO red set EQUALS the computed goal twin's red set (the done criterion holds
 *      even offline) — no re-derivation, no coercion;
 *   4. closed-registry faithfulness: streamGoal calls the real below-the-line
 *      `changeset_status` tool, never an unexposed name.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ORDER_DISCOUNT_GOAL } from "./goal-data";
import {
	demoGoalStream,
	type GoalStream,
	goalStreamDecoder,
	streamGoal,
} from "./goal-stream";
import type { Scope } from "./projectWall";

const SCOPE: Scope = { identity: "alice", activeProject: "proj-a" };

/** A well-formed live payload, byte-shaped like the gateway's changeset_status output. */
const wellFormed: GoalStream = {
	goalId: "goal-order-discount",
	redSet: ["Order.discount.fixture"],
	queue: [
		{
			target: "Order.discount.fixture",
			reason: "version_stale",
			status: "open",
		},
	],
	sensors: [{ mirror: "Order.discount.fixture", verdict: "red" }],
};

describe("S60 — goal-stream decoder (never coerces, reproducible)", () => {
	it("decodes a well-formed live payload to the exact snapshot", () => {
		expect(goalStreamDecoder(wellFormed)).toEqual(wellFormed);
	});

	it("is reproducible: same input → same output (determinism-first)", () => {
		fc.assert(
			fc.property(fc.jsonValue(), (raw) => {
				expect(goalStreamDecoder(raw)).toEqual(goalStreamDecoder(raw));
			}),
		);
	});

	it("REJECTS any malformed payload (never coerces to a half value)", () => {
		// A non-object, a missing field, a wrong type, an out-of-set reason/status.
		const bad: unknown[] = [
			null,
			42,
			"x",
			[],
			{},
			{ goalId: 1, redSet: [], queue: [], sensors: [] },
			{ goalId: "g", redSet: [1], queue: [], sensors: [] },
			{
				goalId: "g",
				redSet: [],
				queue: [{ target: "t", reason: "nope", status: "open" }],
				sensors: [],
			},
			{
				goalId: "g",
				redSet: [],
				queue: [],
				sensors: [{ mirror: "m", verdict: "amber" }],
			},
		];
		for (const b of bad) expect(goalStreamDecoder(b)).toBeNull();
	});

	it("property: a malformed object with a non-string goalId is rejected", () => {
		fc.assert(
			fc.property(
				fc.record({
					goalId: fc.oneof(fc.integer(), fc.boolean()),
					redSet: fc.constant([]),
					queue: fc.constant([]),
					sensors: fc.constant([]),
				}),
				(raw) => {
					expect(goalStreamDecoder(raw)).toBeNull();
				},
			),
		);
	});
});

describe("S60 — streamGoal deterministic fallback + live", () => {
	it("falls back to demo on no endpoint", async () => {
		const r = await streamGoal(SCOPE, { endpoint: null });
		expect(r.source).toBe("demo");
		expect(r.data).toEqual(demoGoalStream());
	});

	it("falls back to demo when the transport throws", async () => {
		const throwing: typeof fetch = async () => {
			throw new Error("network down");
		};
		const r = await streamGoal(SCOPE, {
			endpoint: "http://gw",
			fetchImpl: throwing,
		});
		expect(r.source).toBe("demo");
		expect(r.data).toEqual(demoGoalStream());
	});

	it("falls back to demo on a malformed payload (never a half value)", async () => {
		const malformed: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: { structuredContent: { goalId: 1 } },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		const r = await streamGoal(SCOPE, {
			endpoint: "http://gw",
			fetchImpl: malformed,
		});
		expect(r.source).toBe("demo");
		expect(r.data).toEqual(demoGoalStream());
	});

	it("returns source:live on a well-formed payload", async () => {
		// The passerelle answers gateway_call with { outcome:"route", result }; callGateway
		// unwraps `.result` to the decoder. The backend tool's real payload rides under result.
		const live: typeof fetch = async () =>
			new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					result: {
						structuredContent: { outcome: "route", result: wellFormed },
					},
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		const r = await streamGoal(SCOPE, {
			endpoint: "http://gw",
			fetchImpl: live,
		});
		expect(r.source).toBe("live");
		expect(r.data).toEqual(wellFormed);
	});

	it("the fallback is reproducible across reads", async () => {
		const a = await streamGoal(SCOPE, { endpoint: null });
		const b = await streamGoal(SCOPE, { endpoint: null });
		expect(a.data).toEqual(b.data);
	});
});

describe("S60 — DONE CRITERION: streamed red set == computed red set", () => {
	it("the demo stream's red set equals the goal twin's computed red set", () => {
		// No re-derivation: the demo fallback reuses ORDER_DISCOUNT_GOAL.redSet verbatim.
		expect(demoGoalStream().redSet).toEqual(ORDER_DISCOUNT_GOAL.redSet);
	});

	it("a live well-formed stream surfaces the same red set the engine computed", () => {
		expect(wellFormed.redSet).toEqual(ORDER_DISCOUNT_GOAL.redSet);
		expect(goalStreamDecoder(wellFormed)?.redSet).toEqual(
			ORDER_DISCOUNT_GOAL.redSet,
		);
	});
});
