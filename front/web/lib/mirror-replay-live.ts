import { arr, type Decoder, isObject, type Source, str } from "./gateway-sdk";

/**
 * mirror-runner `mirror_replay` live read MODEL — the SHARED, PURE part of the S59 cutover,
 * testable in isolation and used by BOTH the /mirror-health and /mirror-watch panels.
 *
 * NEVER DOUBLE-TYPED (the S59 hinge): the `mirror_replay` response shape is declared EXACTLY
 * ONCE here, as the Decoder; every panel that surfaces the live replay imports this single
 * decoder + demo — no panel re-declares the shape. It imports NOTHING server-only, so the
 * parity mirror (mirror-replay-live.test.ts) can decode a Go-sample output without a server
 * runtime. Each panel's Server Action wires panelScope + readVia around these.
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * mirror_replay replays the living mirrors and reports each one's LAST RECORDED status; it
 * writes only the append-only run-log (runtime.mirror_runs, BELOW the waterline), never
 * truth (kernel/mirrors/fitness). This module only DECODES that read.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The replay logic lives in Go (the authoritative Replayer); this module
 * decodes its contract, it is NOT a second completeness/replay implementation.
 *
 * ── THE Go CONTRACT (mirrorrunnersrv.replayOutput) ───────────────────────────────────
 * `{ run_id, results: ratchet.RunRecord[], verdict }`. ratchet.RunRecord carries NO json
 * tags, so its fields marshal with Go's PascalCase names (RunID, MirrorID, Status, …);
 * Status is "green"|"red"; verdict is "ALLOWED"|"REJECTED". We project each row to the
 * fields the panel renders (mirror id + status + regressed) — never the full RunRecord.
 */

/** One replayed mirror, projected from a ratchet.RunRecord. */
export interface ReplayRow {
	mirrorId: string;
	status: "green" | "red";
	regressed: boolean;
}

/** The decoder's structural output — the SINGLE declaration of the replay shape. */
export interface ReplayData {
	runId: string;
	verdict: string;
	results: ReplayRow[];
}

export interface LiveReplayView extends ReplayData {
	source: Source;
}

/** A status field decodes only the closed set "green"|"red"; anything else → null. */
function statusOf(v: unknown): "green" | "red" | null {
	return v === "green" || v === "red" ? v : null;
}

// rowDecoder decodes ONE ratchet.RunRecord (PascalCase Go field names, no json tags) to the
// projected ReplayRow. The status MUST be in the closed set (never coerced).
const rowDecoder: Decoder<ReplayRow> = (raw) => {
	if (!isObject(raw)) return null;
	const mirrorId = str(raw.MirrorID);
	if (mirrorId === null) return null;
	const status = statusOf(raw.Status);
	if (status === null) return null;
	if (typeof raw.Regressed !== "boolean") return null;
	return { mirrorId, status, regressed: raw.Regressed };
};

/**
 * replayDecoder decodes the mirror-runner `mirror_replay` output ONCE — never double-typed.
 * `results` is omitted (null) when no mirror replayed — treated as the empty set. A malformed
 * payload (bad verdict / unparseable row) → null (the caller falls back to the demo replay).
 */
export const replayDecoder: Decoder<ReplayData> = (raw) => {
	if (!isObject(raw)) return null;
	const runId = str(raw.run_id);
	if (runId === null) return null;
	const verdict = str(raw.verdict);
	if (verdict === null) return null;
	let results: ReplayRow[] = [];
	if (raw.results != null) {
		const rows = arr(rowDecoder)(raw.results);
		if (rows === null) return null;
		results = rows;
	}
	return { runId, verdict, results };
};

/**
 * The deterministic demo replay — the canonical green baseline for the demo cut (the same
 * five bicephalous bodies the /mirror-health completeness section inventories), all green,
 * verdict ALLOWED. No clock, no rng, no I/O.
 */
export const DEMO_REPLAY: ReplayData = {
	runId: "demo:replay",
	verdict: "ALLOWED",
	results: [
		{ mirrorId: "checkout-button.fixture", status: "green", regressed: false },
		{ mirrorId: "place-order.fixture", status: "green", regressed: false },
		{ mirrorId: "order.schema", status: "green", regressed: false },
		{ mirrorId: "cart-view.e2e", status: "green", regressed: false },
	],
};
