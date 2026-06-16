"use server";

import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /version-dag Server Actions (S59 cutover). It reads the LIVE current heads of the active
 * project's version-DAG through the typed S58 gateway via the S59 SDK (the below-the-line
 * `dag_heads` read of the closed registry), decoded with a PURE decoder, with a
 * deterministic demo head set preserved as the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only — recording a DAG node/edge is owned by the `aidos`
 * writer role through the dag MCP, never a direct write from the screen.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo heads.
 */

export interface LiveHeadsView {
	heads: string[];
	source: Source;
}

// dag_heads → { heads:[string] }, decoded ONCE (never double-typed).
const headsDecoder: Decoder<{ heads: string[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const heads = arr(str)(raw.heads);
	if (heads === null) return null;
	return { heads };
};

/** The deterministic demo heads — the canonical §120 graph's two parallel lines. */
const DEMO_HEADS = ["v2", "w1"];

/** liveHeads reads the active project's DAG heads (live → demo fallback). */
export async function liveHeads(): Promise<LiveHeadsView> {
	const scope = await panelScope();
	const { data, source } = await readVia(scope, "dag_heads", {}, headsDecoder, {
		heads: DEMO_HEADS,
	});
	// Never render a blank live head set: an empty live DAG still falls back to the demo
	// heads so the panel and its e2e stay autonomous.
	if (source === "live" && data.heads.length === 0) {
		return { heads: DEMO_HEADS, source: "demo" };
	}
	return { heads: data.heads, source };
}
