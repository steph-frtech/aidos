"use server";

import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import type { Idea, Proposes, ProvenanceSource, Status } from "@/lib/ideas";
import { IDEAS } from "@/lib/ideas-data";
import { panelScope } from "@/lib/panelScope";

/**
 * /ideas Server Actions (S59 cutover). It reads the LIVE list of candidate-truth Ideas of the
 * active project through the typed S58 gateway via the S59 SDK (the above-the-product /
 * below-the-freeze `idea_list` read of the idea-intake server), decoded with a PURE decoder,
 * with the deterministic demo board preserved as the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. Capturing / grilling / advancing an Idea rides the
 * idea-intake MCP (the `ideas` schema, ABOVE the product but BELOW the freeze — legal for the
 * agent role); a PROMOTION writes the kernel via the S20 ChangeSet path under the `aidos`
 * writer role, never a direct write from this screen. The list itself is below the freeze.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo board.
 */

/** A live Idea row — the idea_list output shape, decoded ONCE (mirrors lib/ideas.Idea). */
export interface LiveIdeasView {
	ideas: Idea[];
	source: Source;
}

// The closed value sets — the decoder rejects any out-of-set value (no coerced status/kind).
const STATUSES: readonly Status[] = [
	"draft",
	"grilled",
	"spiking",
	"harvested",
	"rejected",
];
const PROPOSES: readonly Proposes[] = [
	"control",
	"policy",
	"operation",
	"action",
	"entity",
	"product",
];
const SOURCES: readonly ProvenanceSource[] = ["human", "incident"];

function status(v: unknown): Status | null {
	return typeof v === "string" && (STATUSES as readonly string[]).includes(v)
		? (v as Status)
		: null;
}
function proposes(v: unknown): Proposes | null {
	return typeof v === "string" && (PROPOSES as readonly string[]).includes(v)
		? (v as Proposes)
		: null;
}
function provSource(v: unknown): ProvenanceSource | null {
	return typeof v === "string" && (SOURCES as readonly string[]).includes(v)
		? (v as ProvenanceSource)
		: null;
}

// The decoder is the SINGLE declaration of the live idea shape (never double-typed).
const ideaDecoder: Decoder<Idea> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const intent = str(raw.intent);
	const p = proposes(raw.proposes);
	const st = status(raw.status);
	if (id === null || intent === null || p === null || st === null) {
		return null;
	}
	if (!isObject(raw.provenance)) return null;
	const src = provSource(raw.provenance.source);
	const detail = str(raw.provenance.detail);
	if (src === null || detail === null) return null;
	const idea: Idea = {
		id,
		proposes: p,
		intent,
		provenance: { source: src, detail },
		status: st,
	};
	const rejectReason = str(raw.reject_reason);
	if (rejectReason !== null) idea.rejectReason = rejectReason;
	return idea;
};

const listDecoder: Decoder<{ ideas: Idea[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const ideas = arr(ideaDecoder)(raw.ideas);
	if (ideas === null) return null;
	return { ideas };
};

/** The deterministic demo board — the §116/§118 canonical idea-lifecycle examples. */
function demoIdeas(): { ideas: Idea[] } {
	return { ideas: IDEAS };
}

/** liveIdeas reads the active project's candidate-truth board (live → demo fallback). */
export async function liveIdeas(): Promise<LiveIdeasView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"idea_list",
		{},
		listDecoder,
		demoIdeas(),
	);
	// Never render a blank live board: an empty live list still falls back to the demo board
	// so the panel and its e2e stay autonomous (the example lifecycle is always visible).
	if (source === "live" && data.ideas.length === 0) {
		return { ideas: demoIdeas().ideas, source: "demo" };
	}
	return { ideas: data.ideas, source };
}
