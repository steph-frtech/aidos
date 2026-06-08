"use server";

import {
	type Async,
	type BlockReason,
	blockAsync,
	DEMO_ASYNC,
	DEMO_OP_NAME,
	dispatch,
	effectId,
	newOutboxEntry,
	type OutboxEntry,
	tick,
	validateAsync,
} from "@/lib/async-operation";

/**
 * Server Actions for the /async-operation Workbench panel (S73 — « operation asynchrone /
 * planifiée + outbox »).
 *
 * THE STEP (ROADMAP-app-builder S73, EPIC 6): extend the Operation DSL with a THIRD
 * dimension — an async/scheduled node (cron / queue / webhook_out / notification) — plus
 * the transactional OUTBOX (exactly-once relative). A scheduled operation FIRES at its
 * echeance and emits its events; the outbox REPLAYS an undispatched effect after a crash
 * WITHOUT a duplicate; scheduling is DETERMINISTIC on the injected clock — the scheduler
 * is CODE, never an LLM.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it validates, schedules and
 * dispatches as VALUES over the PURE twin lib/async-operation. An async operation is a
 * SOURCE above the line; the outbox is a runtime datastore table (a seam); a truth-write
 * would go via propose → ChangeSet → approval, never from this screen.
 */

export interface ScheduleRunView {
	ok: boolean;
	/** the injected clock instant the user ticked at. */
	now: string;
	/** the operation's content-addressed effect id (the idempotency key). */
	effectId: string;
	/** the declared trigger (kind + echeance). */
	triggerKind: string;
	echeance: string;
	/** did the scheduled operation fire at this clock? */
	fired: boolean;
	firedNames: string[];
	/** the dispatch outcome (delivered / suppressed) over the crash-replay scenario. */
	delivered: number;
	suppressed: string[];
	/** the observable delivery count after a replay (must stay 1 — exactly-once relative). */
	observable: number;
	/** the refusal when the async block is malformed. */
	block?: BlockReason;
}

const demoAsync: Async = DEMO_ASYNC;

/**
 * runScheduleAction is the action-capable control behind the async surface (CLAUDE.md §7
 * ui-completeness): the user pins an injected clock instant and submits — the action TICKS
 * the schedule (does the sendReminder cron fire at this clock?), then drives the OUTBOX
 * through the crash → replay path (deliver once, then suppress the at-least-once redelivery)
 * and reports the observable count stays exactly 1. A malformed block yields its
 * ASYNC_* BlockReason. It WRITES NOTHING (the wall).
 */
export async function runScheduleAction(
	_prev: ScheduleRunView,
	formData: FormData,
): Promise<ScheduleRunView> {
	const now = String(formData.get("now") ?? "").trim();

	const eid = effectId(demoAsync.effects[0]);
	const base: ScheduleRunView = {
		ok: true,
		now,
		effectId: eid,
		triggerKind: demoAsync.trigger.kind,
		echeance: demoAsync.trigger.at ?? "",
		fired: false,
		firedNames: [],
		delivered: 0,
		suppressed: [],
		observable: 0,
	};

	// Guard the closed grammar first (a malformed block is refused, never coerced).
	const cause = validateAsync(demoAsync);
	if (cause) {
		return { ...base, block: blockAsync(cause) };
	}

	// Tick the schedule against the injected clock.
	const firedNames = tick(
		[{ name: DEMO_OP_NAME, trigger: demoAsync.trigger }],
		now,
	);
	const fired = firedNames.includes(DEMO_OP_NAME);

	// Drive the outbox crash → replay path:
	//   1) the effect is written PENDING (the state-write transaction),
	//   2) the dispatcher runs (delivers once — at-least-once after a crash),
	//   3) the at-least-once REDELIVERY re-presents the same id → suppressed (no duplicate).
	const dispatched = new Set<string>();
	const entry = newOutboxEntry(demoAsync.effects[0]);
	const first = dispatch([entry], dispatched);
	const replay: OutboxEntry = {
		id: entry.id,
		effect: demoAsync.effects[0],
		status: "pending",
	};
	const second = dispatch([replay], dispatched);
	const observable = first.delivered + second.delivered;

	return {
		...base,
		fired,
		firedNames,
		delivered: first.delivered,
		suppressed: second.suppressed,
		observable,
	};
}
