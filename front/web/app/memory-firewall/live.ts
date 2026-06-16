import {
	arr,
	type Decoder,
	isObject,
	num,
	type Source,
	str,
} from "../../lib/gateway-sdk";

/**
 * /memory-firewall live RECALL read MODEL (the PURE part of the S59 cutover, testable in
 * isolation — ADR 0092 kill-twins batch).
 *
 * This module holds the never-double-typed Decoder for the memory server `memory_recall` tool
 * + the deterministic demo hits. It imports NOTHING server-only, so the parity mirror
 * (live.test.ts) can decode a Go-sample output without a server runtime. The Server Action
 * (liveActions.ts) wires panelScope + readVia around these.
 *
 * ── WHY THIS READ ON THIS PANEL ──────────────────────────────────────────────────────
 * The panel renders the MemoryFirewall GATE (§119.1): the action-capable MemoryFirewallPanel
 * runs the pure twin (toKernel/propose/viaIdea) to prove the direct Memory → Kernel edge is
 * ALWAYS blocked — that worked example STAYS (the gate above the line). This adds the LIVE recall
 * of the memories the firewall governs (the `brain` store, below the waterline): the recalled
 * items + their taint/confidence/score, the carburant the firewall lets PROPOSE but never
 * DECLARE. Surfacing it makes the firewall's input visible (strictly additive cutover, the proven
 * mutation-score / project-dag pattern).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * memory_recall is a below-the-line READ of the `brain` store; recalling/appending memory is
 * below the waterline (the agent reads/appends), but a memory NEVER reaches the kernel except via
 * the firewall flow. This module only DECODES a read — it writes nothing. "La mémoire propose ;
 * le noyau déclare le vrai."
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The brain backend is Go (back/archive/brain + pgvector, authoritative); this
 * module decodes its recall contract, it is NOT a second memory store.
 *
 * ── THE Go CONTRACT (memorysrv.recallOutput) ─────────────────────────────────────────
 * `{ hits: [{ id, kind, content, provenance, taint: string[], branch, confidence, score }] }`
 * — ordered by score descending. `taint` is the firewall's provenance-quality markers
 * (unverified|stale|user_claim|incident_derived|external_source).
 */

/** A recalled memory hit — the memorysrv.hitOut shape, decoded ONCE (never double-typed). */
export interface RecallHit {
	id: string;
	kind: string;
	content: string;
	provenance: string;
	taint: string[];
	branch: string;
	confidence: number;
	score: number;
}

/** The decoder's structural output — the SINGLE declaration of the recall shape. */
export interface RecallData {
	hits: RecallHit[];
}

export interface LiveRecallView extends RecallData {
	source: Source;
}

const hitDecoder: Decoder<RecallHit> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const kind = str(raw.kind);
	const content = str(raw.content);
	const provenance = str(raw.provenance);
	const branch = str(raw.branch);
	const confidence = num(raw.confidence);
	const score = num(raw.score);
	if (
		id === null ||
		kind === null ||
		content === null ||
		provenance === null ||
		branch === null ||
		confidence === null ||
		score === null
	) {
		return null;
	}
	// taint is a string[] (the firewall markers); an absent/empty list defaults to [].
	const taint = raw.taint === undefined ? [] : arr(str)(raw.taint);
	if (taint === null) return null;
	return { id, kind, content, provenance, taint, branch, confidence, score };
};

/**
 * recallDecoder decodes the memory server `memory_recall` output `{ hits: [...] }`
 * (memorysrv.recallOutput) ONCE — never double-typed. A malformed payload (non-array hits / bad
 * hit) → null (the caller falls back to the demo hits). An absent `hits` (omitted by the Go
 * encoder when empty) defaults to [].
 */
export const recallDecoder: Decoder<RecallData> = (raw) => {
	if (!isObject(raw)) return null;
	const hits = raw.hits === undefined ? [] : arr(hitDecoder)(raw.hits);
	if (hits === null) return null;
	return { hits };
};

/**
 * The deterministic demo hits — the canonical firewall carburant: a tainted user-claim memory
 * (proposes, never declares) and an incident-derived one. No clock, no rng, no I/O.
 */
export const DEMO_RECALL: RecallData = {
	hits: [
		{
			id: "mem-tva-eu",
			kind: "semantic",
			content: "la TVA EU s'applique par pays de livraison",
			provenance: "human",
			taint: ["user_claim", "unverified"],
			branch: "main",
			confidence: 0.7,
			score: 0.92,
		},
		{
			id: "mem-incident-42",
			kind: "episodic",
			content: "le total checkout a doublé la remise une fois (#42)",
			provenance: "incident #42",
			taint: ["incident_derived"],
			branch: "main",
			confidence: 0.5,
			score: 0.81,
		},
	],
};
