import {
	type CapturedIdea,
	PROPOSES_KINDS,
	type Proposes,
	type Status,
} from "../../lib/capture-idea";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /capture-idea live INBOX read MODEL (the PURE part of the S59 cutover, testable in isolation
 * — ADR 0092 kill-twins batch).
 *
 * This module holds the never-double-typed Decoder for the idea-intake `idea_list` tool. It
 * imports NO server-only surface, so the parity mirror (live.test.ts) can decode a Go-sample
 * output without a server runtime. The Server Action (actions.ts → inboxSnapshot) wires
 * panelScope + readVia around it.
 *
 * ── THE TWIN-READ THIS KILLS (ADR 0092) ──────────────────────────────────────────────
 * The /capture-idea inbox used to read the `ideas.idea` table with a DIRECT Postgres SELECT
 * inside actions.ts — a read path that bypasses the gateway (and so the wall the passerelle
 * applies server-side). ADR 0092 welds the live path to ONE door: the Go engine via the
 * passerelle. This module is the live read's decoder; actions.ts now routes the inbox through
 * `readVia(idea_list)`. The direct-Postgres SELECT is DELETED; the `captureIdeaAction` write
 * (the action gate above the line) is KEPT untouched, and the demo fixture stays as the
 * deterministic fallback (`source: "demo"`).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * idea_list is a below-the-line READ of the `ideas` staging schema (candidate-truths, no freeze,
 * no mirror). A READ only — promotion to a kernel truth is the /goal flow, never this screen.
 *
 * ── DETERMINISM-FIRST (§6/§8) ────────────────────────────────────────────────────────
 * The decoder is a pure total function; a malformed payload is rejected (→ demo fallback),
 * never coerced. The ideas store is Go (back/kernel/ideas + the idea-intake MCP, authoritative);
 * this module decodes its list contract, it is NOT a second ideas store.
 *
 * ── THE Go CONTRACT (ideaintakesrv.listOutput) ───────────────────────────────────────
 * `{ ideas: [{ id, proposes, intent, source, detail, status, reject_reason?, project_id? }] }`.
 */

/** A live inbox row — the ideaOutput shape mapped onto the panel's InboxRow (mirrors actions.ts). */
export interface LiveInboxRow {
	id: string;
	proposes: Proposes;
	intent: string;
	provenance: { source: "human" | "incident"; detail: string };
	status: Status;
	projectId: string;
}

export interface LiveInboxData {
	rows: LiveInboxRow[];
}

const PROPOSES_SET = new Set<string>(PROPOSES_KINDS);
const STATUS_SET = new Set<string>([
	"draft",
	"grilled",
	"spiking",
	"harvested",
	"rejected",
]);

function proposesOf(v: unknown): Proposes | null {
	return typeof v === "string" && PROPOSES_SET.has(v) ? (v as Proposes) : null;
}

function statusOf(v: unknown): Status | null {
	return typeof v === "string" && STATUS_SET.has(v) ? (v as Status) : null;
}

const rowDecoder: Decoder<LiveInboxRow> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const intent = str(raw.intent);
	const detail = str(raw.detail);
	const p = proposesOf(raw.proposes);
	const st = statusOf(raw.status);
	if (
		id === null ||
		intent === null ||
		detail === null ||
		p === null ||
		st === null
	) {
		return null;
	}
	const source = raw.source === "incident" ? "incident" : "human";
	// project_id is omitempty (the __system__ seed) — default to "".
	const projectId = raw.project_id === undefined ? "" : str(raw.project_id);
	if (projectId === null) return null;
	return {
		id,
		proposes: p,
		intent,
		provenance: { source, detail },
		status: st,
		projectId,
	};
};

/**
 * inboxDecoder decodes the idea-intake `idea_list` output `{ ideas: [...] }`
 * (ideaintakesrv.listOutput) ONCE — never double-typed. A malformed payload → null (the caller
 * falls back to the demo rows). An absent `ideas` (omitted when empty) defaults to [].
 */
export const inboxDecoder: Decoder<LiveInboxData> = (raw) => {
	if (!isObject(raw)) return null;
	const rows = raw.ideas === undefined ? [] : arr(rowDecoder)(raw.ideas);
	if (rows === null) return null;
	return { rows };
};

/** The shared InboxRow type the panel renders — re-derived from the live row + CapturedIdea. */
export type InboxRowShape = CapturedIdea & { projectId: string };
