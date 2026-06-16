"use server";

import {
	arr,
	type Decoder,
	isObject,
	num,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /incidents-to-ideas live read (S59 cutover). It reads the LIVE incidents board of the
 * active project through the typed S58 gateway via the S59 SDK — the below-the-line
 * `incident_list` read of the dispatched telemetry-reader server (the external-loop board,
 * S43/S27) — decoded with a PURE decoder, with the deterministic demo fixture preserved as
 * the fallback (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only. An incident is REALITY, never a truth (no version,
 * no mirror); the incidents.* board is below the waterline. The only outward edge is /learn
 * → a DRAFT idea (provenance incident:#NNNN), never a kernel write — that stays the human's
 * idea → mirror → /goal → approval path. No truth-write ever originates from this screen.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback are pure; a malformed /
 * undispatched / refused gateway answer deterministically yields the demo board.
 */

/** A live incident row — the incident_list incidentOutput shape, decoded ONCE. */
export interface LiveIncident {
	id: string;
	ref: string;
	operation: string;
	error: string;
	recurrence: number;
	causeSketch: string;
	taint: string[];
	ideaId: string | null;
}

export interface LiveIncidentsView {
	incidents: LiveIncident[];
	source: Source;
}

// The decoder is the SINGLE declaration of the live incident shape (never double-typed).
const incidentDecoder: Decoder<LiveIncident> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const ref = str(raw.ref);
	const operation = str(raw.operation);
	const error = str(raw.error);
	const recurrence = num(raw.recurrence);
	const causeSketch = str(raw.cause_sketch);
	const taint = arr(str)(raw.taint);
	if (
		id === null ||
		ref === null ||
		operation === null ||
		error === null ||
		recurrence === null ||
		causeSketch === null ||
		taint === null
	) {
		return null;
	}
	const ideaId = typeof raw.idea_id === "string" ? raw.idea_id : null;
	return { id, ref, operation, error, recurrence, causeSketch, taint, ideaId };
};

const listDecoder: Decoder<{ incidents: LiveIncident[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const incidents = arr(incidentDecoder)(raw.incidents);
	if (incidents === null) return null;
	return { incidents };
};

/** The deterministic demo board — the canonical out-of-stock createOrder incident. */
function demoIncidents(): { incidents: LiveIncident[] } {
	return {
		incidents: [
			{
				id: "inc-0042",
				ref: "incident:#0042",
				operation: "createOrder",
				error: "30 % des appels échouent (rupture de stock)",
				recurrence: 7,
				causeSketch:
					"hypothèse : le panier n'invalide pas un article devenu indisponible",
				taint: ["incident_derived"],
				ideaId: null,
			},
		],
	};
}

/** liveIncidents reads the active project's incidents board (live → demo fallback). */
export async function liveIncidents(): Promise<LiveIncidentsView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"incident_list",
		{},
		listDecoder,
		demoIncidents(),
	);
	// Never render a blank live board: an empty live board still falls back to the demo
	// fixture so the panel and its e2e stay autonomous (the example is always visible).
	if (source === "live" && data.incidents.length === 0) {
		return { incidents: demoIncidents().incidents, source: "demo" };
	}
	return { incidents: data.incidents, source };
}
