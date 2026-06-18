// Relative import (NOT the @/ alias): app/mirror-watch/ is 2 levels deep, and Vitest does not
// resolve the @/ tsconfig path — only a real relative specifier loads in the parity mirror.
import {
	arr,
	type Decoded,
	type Decoder,
	isObject,
	str,
} from "../../lib/gateway-sdk";

/**
 * /mirror-watch LIVE decoder — the PURE `Decoder<RunView>` for the dispatched `watch_run`
 * tool of the Go mirror-watch MCP server (S69; ADR 0092 — the moteur Go is the SINGLE live
 * source). It is the ONLY declaration of the `watch_run` response shape on the front (never
 * double-typed: the static `RunView` is INFERRED from the decoder via `Decoded<>`).
 *
 * ── THE Go CONTRACT (mirrorwatchsrv.runOutput) ───────────────────────────────────────
 *   { ok, error?, mirror_id?, runner?, final?, red, events?:[{phase,runner,status,detail}] }
 * `final` is the liveness verdict ("alive"=green | "dead"=red); `red` is the boolean the
 * panel paints on. Each event carries the ordered phase (queued → materialized → running →
 * verdict) + the runner + the per-step status + a human detail. We decode EXACTLY the fields
 * the panel renders — a malformed payload is REJECTED (the decoder returns null) and the
 * Server Action falls back to the deterministic twin demo (`source:"demo"`).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * watch_run RUNS a materialized, above-the-line mirror against a code-probe and returns the
 * live red/green stream as a VALUE — it writes NOTHING (freezing a mirror stays the propose →
 * ChangeSet → approval path of S68/S20). This module only DECODES that below-the-line read.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function: same JSON → same verdict, zero LLM. The run logic is
 * the authoritative Go RunStream; this decodes its contract, it is NOT a second run engine.
 */

/** One ordered event of the live run stream — projected from a Go runEventOut. */
export interface RunEventView {
	phase: string;
	runner: string;
	status: string;
	detail: string;
}

const eventDecoder: Decoder<RunEventView> = (raw) => {
	if (!isObject(raw)) return null;
	const phase = str(raw.phase);
	const runner = str(raw.runner);
	const status = str(raw.status);
	const detail = str(raw.detail);
	if (phase === null || runner === null || status === null || detail === null) {
		return null;
	}
	return { phase, runner, status, detail };
};

/**
 * runDecoder decodes the `watch_run` output. `ok` MUST be true and the run MUST carry a
 * runner (a refused / errored run is rejected → demo fallback). `red` is read as a strict
 * boolean; `events` (when present) decode through the closed element decoder.
 */
export const runDecoder = (raw: unknown) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const runner = str(raw.runner);
	if (runner === null) return null;
	if (typeof raw.red !== "boolean") return null;
	const mirrorId = str(raw.mirror_id) ?? "";
	const final = str(raw.final) ?? "";
	let events: RunEventView[] = [];
	if (raw.events !== undefined && raw.events !== null) {
		const decoded = arr(eventDecoder)(raw.events);
		if (decoded === null) return null;
		events = decoded;
	}
	return { mirrorId, runner, final, red: raw.red, events };
};

/** RunView — the static type INFERRED from runDecoder (the never-double-typed hinge). */
export type RunView = NonNullable<Decoded<typeof runDecoder>>;
