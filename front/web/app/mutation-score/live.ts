import {
	type Decoder,
	isObject,
	num,
	type Source,
	str,
} from "../../lib/gateway-sdk";
import { DECLARED_THRESHOLD } from "../../lib/mutation-data";

/**
 * /mutation-score live read MODEL (the PURE part of the S59 cutover, testable in isolation).
 *
 * This module holds the never-double-typed Decoder for the mutation-runner `read_threshold`
 * tool + the deterministic demo bar. It imports NOTHING server-only (no cookies / next), so
 * the parity mirror (live.test.ts) can decode a Go-sample output without a server runtime.
 * The Server Action (liveActions.ts) wires panelScope + readVia around these.
 *
 * THE WALL (CLAUDE.md §2): read_threshold reads the bar SELECT-only from `fitness`; the agent
 * is graded by it, never authors it. This module only DECODES a read — it writes nothing.
 * DETERMINISM-FIRST (§6/§8): the decoder is a pure total function; a malformed payload is
 * rejected (→ demo fallback), never coerced.
 */

export interface LiveThresholdView {
	scope: string;
	threshold: number;
	declared: boolean;
	source: Source;
}

/** The decoder's structural output — the SINGLE declaration of the read_threshold shape. */
export interface ThresholdData {
	scope: string;
	threshold: number;
	declared: boolean;
}

/**
 * thresholdDecoder decodes the mutation-runner `read_threshold` output
 * `{ scope, threshold, declared }` (mutationrunnersrv.thresholdOutput) ONCE — never
 * double-typed. `declared:false` ⇒ no bar declared in fitness; the gate would block with
 * MISSING_THRESHOLD. A malformed payload → null (the caller falls back to the demo bar).
 */
export const thresholdDecoder: Decoder<ThresholdData> = (raw) => {
	if (!isObject(raw)) return null;
	const scope = str(raw.scope);
	if (scope === null) return null;
	const threshold = num(raw.threshold);
	if (threshold === null) return null;
	if (typeof raw.declared !== "boolean") return null;
	return { scope, threshold, declared: raw.declared };
};

/** The deterministic demo bar — the canonical declared example (0.80, scope "go"). */
export const DEMO_THRESHOLD: ThresholdData = {
	scope: "go",
	threshold: DECLARED_THRESHOLD,
	declared: true,
};
