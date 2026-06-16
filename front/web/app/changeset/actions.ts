"use server";

import { ADD_ORDER_DISCOUNT, INVERSE_ID } from "@/lib/changeset-data";
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
 * /changeset Server Actions (S59 cutover). It reads the LIVE list of ChangeSet envelopes of
 * the active project through the typed S58 gateway via the S59 SDK (the below-the-line
 * `changeset_list` read of the closed registry), decoded with a PURE decoder, with the
 * deterministic demo fixture preserved as the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only — opening / applying / reverting a ChangeSet is a
 * truth-write owned by the CLI writer role via propose → ChangeSet → approval, never a
 * direct write from the screen. The list is below-the-line (the changeset journal).
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo list.
 */

/** A live ChangeSet envelope row — the changeset_list statusOutput shape, decoded ONCE. */
export interface LiveEnvelope {
	id: string;
	label: string;
	status: string;
	parentPhase: string;
	reverts: string | null;
}

export interface LiveEnvelopesView {
	envelopes: LiveEnvelope[];
	source: Source;
}

// The decoder is the SINGLE declaration of the live envelope shape (never double-typed).
const envelopeDecoder: Decoder<LiveEnvelope> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const label = str(raw.label);
	const status = str(raw.status);
	const parentPhase = str(raw.parent_phase);
	if (
		id === null ||
		label === null ||
		status === null ||
		parentPhase === null
	) {
		return null;
	}
	const reverts = typeof raw.reverts === "string" ? raw.reverts : null;
	return { id, label, status, parentPhase, reverts };
};

const listDecoder: Decoder<{ envelopes: LiveEnvelope[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const envelopes = arr(envelopeDecoder)(raw.envelopes);
	if (envelopes === null) return null;
	return { envelopes };
};

/** The deterministic demo list — the §98 "add order discount" envelope + its inverse. */
function demoEnvelopes(): { envelopes: LiveEnvelope[] } {
	return {
		envelopes: [
			{
				id: ADD_ORDER_DISCOUNT.id,
				label: ADD_ORDER_DISCOUNT.label,
				status: "REVERTED",
				parentPhase: ADD_ORDER_DISCOUNT.parentPhase,
				reverts: null,
			},
			{
				id: INVERSE_ID,
				label: `revert ${ADD_ORDER_DISCOUNT.label}`,
				status: "APPLIED",
				parentPhase: ADD_ORDER_DISCOUNT.parentPhase,
				reverts: ADD_ORDER_DISCOUNT.id,
			},
		],
	};
}

/** liveEnvelopes reads the active project's ChangeSet journal (live → demo fallback). */
export async function liveEnvelopes(): Promise<LiveEnvelopesView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"changeset_list",
		{},
		listDecoder,
		demoEnvelopes(),
	);
	// Never render a blank live list: an empty live journal still falls back to the demo
	// fixture so the panel and its e2e stay autonomous (the example is always visible).
	if (source === "live" && data.envelopes.length === 0) {
		return { envelopes: demoEnvelopes().envelopes, source: "demo" };
	}
	return { envelopes: data.envelopes, source };
}
