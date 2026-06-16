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
import { BRAIN_MEMORY, type MemoryItem } from "@/lib/workbench-graph-data";

/**
 * /brain Server Actions (S59 cutover). It reads the LIVE MemoryItems of the active project's
 * brain through the typed S58 gateway via the S59 SDK (the below-the-line `memory_recall` read
 * of the memory server — episodic/semantic/procedural items + their firewall taint), decoded
 * with a PURE decoder, with the deterministic demo memory preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only — recalling is a below-the-line read of the `brain`
 * schema (the memory-firewall's verdicts are RENDERED). A memory WRITE never originates here;
 * it rides the memory firewall ViaIdea (never ToKernel). The brain schema is below the line.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo memory.
 */

/** A live MemoryItem view — the memory_recall output shape, decoded ONCE. */
export interface LiveBrainView {
	memory: MemoryItem[];
	source: Source;
}

// The closed MemoryItem kinds — the decoder rejects any out-of-set value (no coerced kind).
const KINDS: readonly MemoryItem["kind"][] = [
	"episodic",
	"semantic",
	"procedural",
];

function kind(v: unknown): MemoryItem["kind"] | null {
	return typeof v === "string" && (KINDS as readonly string[]).includes(v)
		? (v as MemoryItem["kind"])
		: null;
}

// The decoder is the SINGLE declaration of the live memory shape (never double-typed).
const memoryDecoder: Decoder<MemoryItem> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const summary = str(raw.summary);
	const taint = str(raw.taint);
	const k = kind(raw.kind);
	if (id === null || summary === null || taint === null || k === null) {
		return null;
	}
	return { id, kind: k, summary, taint };
};

const recallDecoder: Decoder<{ memory: MemoryItem[] }> = (raw) => {
	if (!isObject(raw)) return null;
	// memory_recall answers with a `memory` (or `items`) list of MemoryItems.
	const list = isObject(raw) ? (raw.memory ?? raw.items) : null;
	const memory = arr(memoryDecoder)(list);
	if (memory === null) return null;
	return { memory };
};

/** The deterministic demo memory — the §30/§31 canonical MemoryItem examples. */
function demoMemory(): { memory: MemoryItem[] } {
	return { memory: [...BRAIN_MEMORY] };
}

/** liveBrain reads the active project's brain MemoryItems (live → demo fallback). */
export async function liveBrain(): Promise<LiveBrainView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"memory_recall",
		{},
		recallDecoder,
		demoMemory(),
	);
	// Never render a blank live brain: an empty live recall still falls back to the demo
	// memory so the panel and its e2e stay autonomous (the example items stay visible).
	if (source === "live" && data.memory.length === 0) {
		return { memory: demoMemory().memory, source: "demo" };
	}
	return { memory: data.memory, source };
}
