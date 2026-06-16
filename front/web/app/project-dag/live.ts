import {
	arr,
	type Decoder,
	isObject,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /project-dag live read MODEL (the PURE part of the S59 cutover, testable in isolation).
 *
 * This module holds the never-double-typed Decoder for the dag server `dag_heads` tool + the
 * deterministic demo heads. It imports NOTHING server-only, so the parity mirror (live.test.ts)
 * can decode a Go-sample output without a server runtime. The Server Action (liveActions.ts)
 * wires panelScope + readVia around these.
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * dag_heads READS the current head ids of the version space (possibly several parallel lines,
 * §125); the DAG records ride the privileged dag writer (S24), never a screen. This module
 * only DECODES a read — it writes nothing.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The version-space logic lives in Go (back/archive/dag, authoritative); this
 * module decodes its read contract, it is NOT a second DAG implementation.
 *
 * ── THE Go CONTRACT (dagsrv.headsOutput) ─────────────────────────────────────────────
 * `{ heads: string[] }` — the current head node ids after the latest move (append-only;
 * never shrinks). The full DAG (nodes/edges) is dag_get — here we surface only the live heads.
 */

/** The decoder's structural output — the SINGLE declaration of the dag_heads shape. */
export interface HeadsData {
	heads: string[];
}

export interface LiveHeadsView extends HeadsData {
	source: Source;
}

/**
 * headsDecoder decodes the dag server `dag_heads` output `{ heads: string[] }` ONCE — never
 * double-typed. A malformed payload (non-array heads / non-string element) → null (the caller
 * falls back to the demo heads).
 */
export const headsDecoder: Decoder<HeadsData> = (raw) => {
	if (!isObject(raw)) return null;
	const heads = arr(str)(raw.heads);
	if (heads === null) return null;
	return { heads };
};

/**
 * The deterministic demo heads — a single genesis head (the canonical fresh project version
 * space: one stable line, no branch yet). No clock, no rng, no I/O.
 */
export const DEMO_HEADS: HeadsData = {
	heads: ["genesis"],
};
