/**
 * The async-operation twin — the Workbench /async-operation source (AIDOS step S73).
 *
 * The DECLARED projection of the Go package back/kernel/operation async.go: the SAME
 * async/scheduled extension of the Operation DSL — a THIRD dimension (cron / queue /
 * webhook_out / notification) WITH the transactional OUTBOX pattern (exactly-once
 * relative). Without it an emitted app can do no background work, no reminders, no
 * outbound webhooks (ROADMAP S73).
 *
 * THE DONE-CRITERIA (S73):
 *   - a SCHEDULED operation FIRES at its echeance and emits its events (tick over an
 *     INJECTED clock — before the echeance: nothing; at/after: fires);
 *   - the OUTBOX REPLAYS an undispatched effect after a crash WITHOUT a duplicate
 *     (at-least-once delivery + idempotent dispatch ⇒ exactly-once relative);
 *   - SCHEDULING is DETERMINISTIC on the injected clock — same (schedule, now) ⇒ same
 *     fired set; the scheduler is CODE, never an LLM.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no real clock
 * (it is INJECTED), no rng, no I/O, no LLM — so a schedule TICKS to the same fired set as
 * the Go Tick, and an effect content-addresses to the same id as the Go EffectID (the
 * idempotency key). The Go output is the AUTHORITATIVE truth; this twin reproduces it.
 *
 * READ-ONLY (the wall): /async-operation PROJECTS, SCHEDULES and DISPATCHES as VALUES; it
 * never writes truth. An async operation is a SOURCE above the line; the outbox is a
 * runtime datastore table (a seam); truth-writes go via propose → ChangeSet → approval.
 */

import { createHash } from "node:crypto";

/** The closed async trigger set (S73) — invented by neither agent nor LLM. */
export const TRIGGER_KINDS = [
	"cron",
	"queue",
	"webhook_out",
	"notification",
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

/** isTriggerKind reports whether k is one of the four async trigger kinds. */
export function isTriggerKind(k: string): k is TriggerKind {
	return (TRIGGER_KINDS as readonly string[]).includes(k);
}

/** AsyncTrigger declares HOW an operation runs out of band. */
export interface AsyncTrigger {
	kind: TriggerKind;
	/** RFC3339 echeance for a cron trigger; empty otherwise. */
	at?: string;
}

/** Effect is one side-effect an async operation performs (written to the outbox). */
export interface Effect {
	kind: TriggerKind;
	target: string;
	payload: Record<string, unknown>;
}

/** Async is the optional async block of an Operation: trigger + declared effects. */
export interface Async {
	trigger: AsyncTrigger;
	effects: Effect[];
}

/** ScheduledOp pairs an operation name with its cron trigger for the scheduler. */
export interface ScheduledOp {
	name: string;
	trigger: AsyncTrigger;
}

/** The closed outbox lifecycle. */
export type OutboxStatus = "pending" | "dispatched";

/** One row of the transactional outbox. */
export interface OutboxEntry {
	id: string;
	effect: Effect;
	status: OutboxStatus;
}

/** A BlockReason — the actionable refusal shape (KRD §44.5), mirroring the Go shape. */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	how_to_fix: string[];
}

// ── Canonicalisation (byte-equal to the Go records.Canonicalize) ────────────────

/**
 * canonicalize sorts object keys recursively and drops insignificant whitespace —
 * byte-identical to the Go records.Canonicalize, so EffectID below matches Go EffectID.
 */
function canonicalize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(canonicalize).join(",")}]`;
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
	return `{${parts.join(",")}}`;
}

/**
 * effectId is the CONTENT-ADDRESSED idempotency key of an effect — the SHA-256 of its
 * canonical body, byte-equal to the Go operation.EffectID (records.Hash/Canonicalize).
 * Two byte-identical effects share an id, so a replay collides with its prior dispatch.
 */
export function effectId(e: Effect): string {
	const body = { kind: e.kind, target: e.target, payload: e.payload };
	return createHash("sha256").update(canonicalize(body)).digest("hex");
}

// ── Validation (the closed grammar) ─────────────────────────────────────────────

/** validateAsync returns null for a well-formed async block, or a typed error string. */
export function validateAsync(a: Async): string | null {
	if (!isTriggerKind(a.trigger.kind)) {
		return `unknown async trigger kind: ${a.trigger.kind}`;
	}
	if (a.trigger.kind === "cron" && !a.trigger.at) {
		return "cron trigger missing echeance";
	}
	for (const e of a.effects) {
		if (!isTriggerKind(e.kind)) {
			return `unknown async trigger kind: effect ${e.kind}`;
		}
	}
	return null;
}

/** blockAsync turns a validation cause into an actionable BlockReason (the wall). */
export function blockAsync(cause: string): BlockReason {
	let code = "ASYNC_INVALID_TRIGGER";
	if (cause.includes("unknown async trigger kind"))
		code = "ASYNC_UNKNOWN_TRIGGER_KIND";
	else if (cause.includes("missing echeance"))
		code = "ASYNC_CRON_MISSING_ECHEANCE";
	return {
		code,
		severity: "blocking",
		explanation: `Le bloc async/planifié de l'operation est mal formé : ${cause}.`,
		how_to_fix: [
			"trigger.kind : choisissez un kind dans l'ensemble fermé { cron, queue, webhook_out, notification } — jamais inventé.",
			"cron.at : pour un trigger cron, déclarez une échéance RFC3339 (l'horloge injectée la compare).",
			"rerun aidos check : rejouez la fixture async une fois le bloc corrigé — le scheduler est du code, jamais un LLM.",
		],
	};
}

// ── The scheduler (pure on the injected clock) ──────────────────────────────────

/** due reports whether an echeance has arrived relative to now (now ≥ echeance). */
export function due(echeance: string, now: string): boolean {
	const et = Date.parse(echeance);
	const nt = Date.parse(now);
	if (Number.isNaN(et) || Number.isNaN(nt)) {
		return false;
	}
	return nt >= et;
}

/**
 * tick returns the SORTED names of the cron operations due at the injected now — a PURE
 * function of (schedule, now), byte-equal to the Go Tick. The clock is INJECTED (the
 * `now` arg): no real clock, no rng, no LLM (determinism-first).
 */
export function tick(scheduled: ScheduledOp[], now: string): string[] {
	const fired: string[] = [];
	for (const s of scheduled) {
		if (s.trigger.kind !== "cron") continue;
		if (s.trigger.at && due(s.trigger.at, now)) {
			fired.push(s.name);
		}
	}
	return fired.sort();
}

// ── The transactional outbox (exactly-once relative) ────────────────────────────

/** newOutboxEntry builds a PENDING, content-addressed entry from an effect. */
export function newOutboxEntry(e: Effect): OutboxEntry {
	return { id: effectId(e), effect: e, status: "pending" };
}

/** The result of a dispatch run. */
export interface DispatchResult {
	/** effects actually delivered this run. */
	delivered: number;
	/** ids recognised as already-dispatched (the suppressed replays). */
	suppressed: string[];
}

/**
 * dispatch runs the dispatcher over a snapshot of PENDING entries + the already-dispatched
 * id set, exactly-once RELATIVE: a PENDING entry whose id is NOT dispatched is delivered;
 * one whose id IS dispatched (the at-least-once redelivery) is SUPPRESSED. Pure — it
 * touches no real datastore, no real sink (the wall). Mirrors the Go operation.Dispatch.
 */
export function dispatch(
	pending: OutboxEntry[],
	dispatched: Set<string>,
): DispatchResult {
	let delivered = 0;
	const suppressed: string[] = [];
	for (const entry of pending) {
		if (entry.status !== "pending") continue;
		if (dispatched.has(entry.id)) {
			suppressed.push(entry.id);
			continue;
		}
		// Deliver (a real sink would SMTP/HTTP; here we count) and mark dispatched.
		dispatched.add(entry.id);
		delivered += 1;
	}
	return { delivered, suppressed };
}

/** isBlocked narrows a BlockReason from a value union. */
export function isBlocked(v: unknown): v is BlockReason {
	return (
		typeof v === "object" &&
		v !== null &&
		"how_to_fix" in v &&
		Array.isArray((v as BlockReason).how_to_fix)
	);
}

// ── The demo fixtures the panel drives ──────────────────────────────────────────

/** The S73 sendReminder anchor (cron trigger + a notification effect). */
export const DEMO_ASYNC: Async = {
	trigger: { kind: "cron", at: "2026-06-08T09:00:00Z" },
	effects: [
		{
			kind: "notification",
			target: "user@example.com",
			payload: { subject: "Reminder", body: "Your task is due" },
		},
	],
};

export const DEMO_OP_NAME = "sendReminder";
