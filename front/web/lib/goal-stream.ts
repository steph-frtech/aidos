/**
 * goal-stream.ts — the S60 LIVE projection of the open goal's red set / RedWorkQueue /
 * real sensor state, streamed through the typed S58 gateway via the S59 SDK.
 *
 * S60 (app-builder EPIC 2) closes the last read-only gap of the /goal verticale: until
 * now the panel computed its stop verdict from the static twin (lib/goal-data). S60 reads
 * the LIVE open goal of the active project — its red set, the RedWorkQueue rows (§49.4),
 * and the real per-mirror sensor verdicts — from the gateway's below-the-line read tools
 * (changeset / mirror-runner), decoded with a PURE decoder, and tagged
 * `source: "live" | "demo"` exactly like S59. The deterministic demo fixture
 * (lib/goal-data + lib/red-wave-data) stays the fallback when no gateway is reachable.
 *
 * ── THE DONE CRITERION (streamed red set == computed red set) ─────────────────────────
 * The red set this module streams for a KNOWN goal is, byte-for-byte, the red set the
 * engine computes — because the decoder reads the goal's `redSet` field straight from the
 * gateway and the demo fallback is the SAME `ORDER_DISCOUNT_GOAL.redSet` the goal twin
 * (lib/goal.ts) uses. There is no re-derivation, no coercion: a malformed payload is
 * rejected (decoder → null) and the read falls back to the deterministic twin. The
 * reproducibility mirror lib/goal-stream.test.ts pins same-input → same-output.
 *
 * ── NEVER DOUBLE-TYPED (S59) ─────────────────────────────────────────────────────────
 * The streamed snapshot shape is declared EXACTLY ONCE as a `Decoder<GoalStream>` (below);
 * the static type is `GoalStream`, an interface that the decoder is checked against — no
 * parallel re-declaration of the wire shape. The decoder is the single runtime+type
 * source for the payload.
 *
 * ── DETERMINISM-FIRST (CLAUDE.md §6/§8) ──────────────────────────────────────────────
 * Pure total decode: same JSON → same verdict, zero LLM. The transport (readVia) is the
 * only impure surface. The screen never writes truth — opening/closing a goal is a
 * truth-write owned by the CLI writer role via propose → ChangeSet (the wall, §2).
 */

import { arr, type Decoder, isObject, readVia, str } from "./gateway-sdk";
import { ORDER_DISCOUNT_GOAL, STOP_RED } from "./goal-data";
import type { Scope } from "./projectWall";
import type { Reason, Status } from "./red-wave";

/** A streamed RedWorkQueue row (§49.4) — the live wave item for the open goal. */
export interface RedWorkRow {
	target: string;
	reason: Reason;
	status: Status;
}

/** One streamed sensor verdict for a red-set mirror (the real liveness, not a fixture). */
export interface SensorRow {
	mirror: string;
	verdict: "green" | "red";
}

/** The live snapshot of the open goal the /goal-stream panel renders. */
export interface GoalStream {
	goalId: string;
	/** the red set — the failing mirror refs that ARE the goal (§56). */
	redSet: string[];
	/** the RedWorkQueue rows (§49.4) for the wave the goal opened. */
	queue: RedWorkRow[];
	/** the real per-mirror sensor verdicts. */
	sensors: SensorRow[];
}

// ── The streamed-snapshot decoder, declared EXACTLY ONCE (never double-typed) ──────────

const REASONS: readonly Reason[] = ["version_stale", "failed_test", "incident"];
const STATUSES: readonly Status[] = ["open", "claimed", "blocked", "resolved"];

const reason = (v: unknown): Reason | null => {
	const s = str(v);
	return s !== null && (REASONS as readonly string[]).includes(s)
		? (s as Reason)
		: null;
};
const status = (v: unknown): Status | null => {
	const s = str(v);
	return s !== null && (STATUSES as readonly string[]).includes(s)
		? (s as Status)
		: null;
};
const verdict = (v: unknown): "green" | "red" | null => {
	const s = str(v);
	return s === "green" || s === "red" ? s : null;
};

const rowDecoder: Decoder<RedWorkRow> = (raw) => {
	if (!isObject(raw)) return null;
	const target = str(raw.target);
	const r = reason(raw.reason);
	const st = status(raw.status);
	if (target === null || r === null || st === null) return null;
	return { target, reason: r, status: st };
};

const sensorDecoder: Decoder<SensorRow> = (raw) => {
	if (!isObject(raw)) return null;
	const mirror = str(raw.mirror);
	const ver = verdict(raw.verdict);
	if (mirror === null || ver === null) return null;
	return { mirror, verdict: ver };
};

/**
 * goalStreamDecoder — the SINGLE declaration of the streamed snapshot shape. Pure, total:
 * a malformed payload (missing field, wrong type, non-string id, an out-of-set reason or
 * status) is REJECTED (→ null) so the read falls back to the deterministic twin.
 */
export const goalStreamDecoder: Decoder<GoalStream> = (raw) => {
	if (!isObject(raw)) return null;
	const goalId = str(raw.goalId);
	if (goalId === null) return null;
	const redSet = arr(str)(raw.redSet);
	if (redSet === null) return null;
	const queue = arr(rowDecoder)(raw.queue);
	if (queue === null) return null;
	const sensors = arr(sensorDecoder)(raw.sensors);
	if (sensors === null) return null;
	return { goalId, redSet, queue, sensors };
};

/**
 * demoGoalStream — the deterministic fallback. It reuses the SAME pinned goal twin
 * (ORDER_DISCOUNT_GOAL) so the demo red set EQUALS the computed red set (the done
 * criterion holds even offline), the queue derives one open/version_stale row per red-set
 * mirror, and the sensors are the STOP_RED verdicts. No new id, no new rule is coined.
 */
export function demoGoalStream(): GoalStream {
	return {
		goalId: ORDER_DISCOUNT_GOAL.id,
		redSet: [...ORDER_DISCOUNT_GOAL.redSet],
		queue: ORDER_DISCOUNT_GOAL.redSet.map((target) => ({
			target,
			reason: "version_stale" as Reason,
			status: "open" as Status,
		})),
		sensors: ORDER_DISCOUNT_GOAL.redSet.map((mirror) => ({
			mirror,
			verdict: STOP_RED.sensors[mirror] === "green" ? "green" : "red",
		})),
	};
}

/**
 * streamGoal reads the LIVE open goal of the active project through the typed SDK
 * (the below-the-line `changeset_status` read — a real tool of the closed S58 registry,
 * which reports the open DRAFT changeset + its red set) and decodes it; on ANY failure
 * (no endpoint, transport error, malformed/rejected payload, or — faithful to the closed
 * registry — an unexposed tool) it returns the deterministic demo snapshot, tagged
 * `source`. It NEVER throws and NEVER returns a half-decoded value.
 */
export async function streamGoal(
	scope: Scope,
	opts: { endpoint?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ data: GoalStream; source: "live" | "demo" }> {
	return readVia(
		scope,
		"changeset_status",
		{},
		goalStreamDecoder,
		demoGoalStream(),
		opts,
	);
}
