import { describe, expect, it } from "vitest";
import {
	type Async,
	blockAsync,
	DEMO_ASYNC,
	dispatch,
	due,
	effectId,
	newOutboxEntry,
	type OutboxEntry,
	tick,
	validateAsync,
} from "./async-operation";

/**
 * The async-operation TS twin (S73) — the Vitest mirror that the projection reproduces the
 * Go operation.async authoritative truth: scheduling is deterministic on the injected clock,
 * the effect id is content-addressed BYTE-EQUAL to Go EffectID, and the outbox dispatches
 * exactly-once-relative (a replay is suppressed, no observable duplicate).
 */

// The Go-computed anchor effect id (operation.EffectID(SendReminder().Effects[0])).
const GO_ANCHOR_EFFECT_ID =
	"3587dff209c7f0c5cdc916ee3648ba89f1adc1e10a0b0f7ac6e3a4437074a210";

describe("effectId — content-addressed, byte-equal to Go", () => {
	it("matches the Go EffectID for the sendReminder anchor", () => {
		expect(effectId(DEMO_ASYNC.effects[0])).toBe(GO_ANCHOR_EFFECT_ID);
	});

	it("is order-stable on payload keys (same logical effect → same id)", () => {
		const a = {
			kind: "notification" as const,
			target: "u@e.com",
			payload: { x: "1", y: "2" },
		};
		const b = {
			kind: "notification" as const,
			target: "u@e.com",
			payload: { y: "2", x: "1" },
		};
		expect(effectId(a)).toBe(effectId(b));
	});
});

describe("tick — deterministic on the injected clock", () => {
	const sched = [{ name: "sendReminder", trigger: DEMO_ASYNC.trigger }];

	it("does not fire before the echeance", () => {
		expect(tick(sched, "2026-06-08T08:59:59Z")).toEqual([]);
	});

	it("fires exactly once at the echeance", () => {
		expect(tick(sched, "2026-06-08T09:00:00Z")).toEqual(["sendReminder"]);
	});

	it("is a pure function — same (schedule, now) → same fired set", () => {
		const a = tick(sched, "2026-06-08T10:00:00Z");
		const b = tick(sched, "2026-06-08T10:00:00Z");
		expect(a).toEqual(b);
	});

	it("due is exactly now ≥ echeance", () => {
		expect(due("2026-06-08T09:00:00Z", "2026-06-08T08:59:59Z")).toBe(false);
		expect(due("2026-06-08T09:00:00Z", "2026-06-08T09:00:00Z")).toBe(true);
		expect(due("2026-06-08T09:00:00Z", "2026-06-08T09:00:01Z")).toBe(true);
	});

	it("a non-cron trigger never fires on a tick", () => {
		const queue = [{ name: "bgJob", trigger: { kind: "queue" as const } }];
		expect(tick(queue, "2030-01-01T00:00:00Z")).toEqual([]);
	});
});

describe("dispatch — exactly-once relative", () => {
	it("replays an undispatched effect after a crash, delivering once", () => {
		const entry = newOutboxEntry(DEMO_ASYNC.effects[0]);
		const dispatched = new Set<string>();
		const res = dispatch([entry], dispatched);
		expect(res.delivered).toBe(1);
		expect(dispatched.has(entry.id)).toBe(true);
	});

	it("suppresses an already-dispatched replay (no observable duplicate)", () => {
		const entry = newOutboxEntry(DEMO_ASYNC.effects[0]);
		const dispatched = new Set<string>([entry.id]);
		const replay: OutboxEntry = {
			id: entry.id,
			effect: DEMO_ASYNC.effects[0],
			status: "pending",
		};
		const res = dispatch([replay], dispatched);
		expect(res.delivered).toBe(0);
		expect(res.suppressed).toEqual([entry.id]);
	});

	it("delivers each distinct effect exactly once over repeated runs", () => {
		const entry = newOutboxEntry(DEMO_ASYNC.effects[0]);
		const dispatched = new Set<string>();
		let total = 0;
		for (let r = 0; r < 4; r++) {
			total += dispatch(
				[{ id: entry.id, effect: entry.effect, status: "pending" }],
				dispatched,
			).delivered;
		}
		expect(total).toBe(1);
	});
});

describe("validateAsync — the closed grammar", () => {
	it("accepts the conforming sendReminder anchor", () => {
		expect(validateAsync(DEMO_ASYNC)).toBeNull();
	});

	it("refuses an unknown trigger kind with an actionable BlockReason", () => {
		const bad = {
			trigger: { kind: "frobnicate" as unknown as "cron" },
			effects: [],
		} as Async;
		const cause = validateAsync(bad);
		expect(cause).not.toBeNull();
		const br = blockAsync(cause as string);
		expect(br.code).toBe("ASYNC_UNKNOWN_TRIGGER_KIND");
		expect(br.how_to_fix.length).toBeGreaterThan(0);
	});

	it("refuses a cron trigger with no echeance", () => {
		const bad: Async = { trigger: { kind: "cron" }, effects: [] };
		const cause = validateAsync(bad);
		expect(cause).not.toBeNull();
		expect(blockAsync(cause as string).code).toBe(
			"ASYNC_CRON_MISSING_ECHEANCE",
		);
	});
});
