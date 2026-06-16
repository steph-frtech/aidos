"use server";

import { revalidatePath } from "next/cache";
import postgres from "postgres";
import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	type CapturedIdea,
	captureIdea,
	PROPOSES_KINDS,
	type Proposes,
} from "@/lib/capture-idea";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { inboxDecoder } from "./live";

/**
 * Server Actions for the /capture-idea Workbench panel (S64 — « Capturez votre idée »).
 *
 * THE STEP (ROADMAP S64): a free-text human intention, with the user's provenance,
 * SCOPED to the active project, becomes a REAL draft `ideas` record — the per-project
 * inbox that replaces the global /ideas fixture (S27 was read-only over a static
 * board; this writes live truth-store rows).
 *
 * THE WALL (CLAUDE.md §2): the `ideas` schema is STAGING ABOVE the line — a captured
 * idea is a CANDIDATE-truth (no version-freeze, no mirror). It is below the wall's
 * write-fence, so the Workbench may write it directly (like /projects, /store) — the
 * agent role has INSERT/SELECT/UPDATE on ideas.idea (S27) but NEVER on
 * kernel/mirrors/fitness. Promotion to a kernel truth is the /goal flow (S65/S66),
 * never a write from this screen.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the idea's id is the content hash of the SKETCH
 * (proposes + intent + provenance), computed by the PURE twin lib/capture-idea
 * (the byte-identical twin of back/kernel/ideas.Capture + records.Hash). project_id is
 * a SCOPE column, not part of identity (S54). The action only persists an
 * already-decided, deterministically-addressed row.
 *
 * THE CANONICAL DOOR (recorded OpenQuestion): the single door for an idea capture is
 * the idea-intake MCP `idea_capture`, fronted by the S58 passerelle. The Workbench here
 * writes the ideas schema directly via a server action (the below-the-line write path,
 * the same shape the gateway dispatches); reconcile through the live MCP-over-HTTP
 * gateway dispatch when S59-cutover wires the write tools (forward-dependency, does not
 * block S64). On a DB-unreachable / no-DSN situation the action returns a friendly
 * error rather than crashing; the inbox keeps its demo fallback.
 */

export interface CaptureResult {
	ok: boolean;
	/** i18n key under the "captureIdea" namespace describing the outcome. */
	messageKey: string;
	/** The content-address id produced, when a capture succeeded. */
	id?: string;
	/** The project the idea was scoped to. */
	projectId?: string;
}

export interface InboxRow extends CapturedIdea {
	projectId: string;
}

export interface InboxSnapshot {
	source: "live" | "demo";
	/** The active project the inbox is scoped to (null when none resolves). */
	activeProjectId: string | null;
	rows: InboxRow[];
}

let sql: ReturnType<typeof postgres> | null = null;
function client(): ReturnType<typeof postgres> | null {
	const dsn = process.env.POSTGRES_CONNECTION_STRING;
	if (!dsn) return null;
	if (!sql) {
		sql = postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 8 });
	}
	return sql;
}

// Demo fallback — deterministic, the same two-idea example the e2e exercises so the
// inbox is never blank when Postgres is unreachable. Both carry HUMAN provenance and
// are scoped to a demo project (the per-project inbox made visible).
const DEMO_PROJECT = "demo-project";
const DEMO_ROWS: InboxRow[] = [
	{
		...captureIdea("operation", "je veux une remise au panier", {
			source: "human",
			detail: "humain: l'utilisateur (démo)",
		}),
		projectId: DEMO_PROJECT,
	},
	{
		...captureIdea("entity", "un panier avec des lignes", {
			source: "human",
			detail: "humain: l'utilisateur (démo)",
		}),
		projectId: DEMO_PROJECT,
	},
];

function isProposes(v: string): v is Proposes {
	return (PROPOSES_KINDS as readonly string[]).includes(v);
}

/**
 * inboxSnapshot reads the live per-project ideas inbox THROUGH THE GATEWAY (the S59 cutover,
 * ADR 0092 kill-twins). The DIRECT Postgres SELECT this used to run is DELETED: ADR 0092 welds
 * the live path to ONE door — the Go engine via the passerelle. The inbox now reads the
 * below-the-line `idea_list` tool of the idea-intake server, project-scoped, decoded by the PURE
 * decoder in ./live, with the deterministic demo rows preserved as the fallback. THE WALL: a
 * READ only — the captureIdeaAction write (the action gate) is unchanged; promotion is /goal.
 *
 * The active project is still resolved from the S57 cookie (the inbox is per-project): it scopes
 * BOTH the displayed activeProjectId label AND the `idea_list` project_id filter. An absent
 * active project, or any gateway miss (unreachable / undispatched / refused / malformed), yields
 * the deterministic demo rows (source: "demo") — the panel and its e2e stay autonomous.
 */
export async function inboxSnapshot(): Promise<InboxSnapshot> {
	const ctx = await activeProjectContext();
	const activeProjectId = ctx.activeId;
	if (!activeProjectId) {
		return { source: "demo", activeProjectId: DEMO_PROJECT, rows: DEMO_ROWS };
	}
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"idea_list",
		{ project_id: activeProjectId },
		inboxDecoder,
		{ rows: [] },
	);
	// A live-but-empty inbox is a legitimate state (a fresh project with no idea yet) — surface it
	// live. Only a gateway MISS (source:"demo") falls back to the demo rows so the example shows.
	if (source === "demo") {
		return { source: "demo", activeProjectId, rows: DEMO_ROWS };
	}
	return {
		source: "live",
		activeProjectId,
		rows: data.rows.map((r) => ({
			id: r.id,
			proposes: r.proposes,
			intent: r.intent,
			provenance: r.provenance,
			status: r.status,
			projectId: r.projectId || activeProjectId,
		})),
	};
}

/**
 * captureIdeaAction is the action-capable control behind the capture box (CLAUDE.md §7
 * ui-completeness): the human types a free-text intention, picks the kind it would
 * become, and submits — the action content-addresses the SKETCH (the pure twin), scopes
 * it to the ACTIVE project (never a project typed in a field — the cookie pins it, the
 * wall keys on it), and INSERTs a REAL draft `ideas` row with HUMAN provenance. Returns
 * the content-address id so the inbox re-renders with the new card.
 */
export async function captureIdeaAction(
	_prev: CaptureResult,
	formData: FormData,
): Promise<CaptureResult> {
	const intent = String(formData.get("intent") ?? "").trim();
	const proposesRaw = String(formData.get("proposes") ?? "").trim();
	const who = String(formData.get("who") ?? "").trim();
	if (!intent) {
		return { ok: false, messageKey: "captureEmpty" };
	}
	if (!isProposes(proposesRaw)) {
		return { ok: false, messageKey: "captureBadProposes" };
	}
	// The active project is the SCOPE — from the S57 cookie, never a free field. A
	// capture without an active project has nowhere to land (the inbox is per-project).
	const ctx = await activeProjectContext();
	const projectId = ctx.activeId;
	if (!projectId) {
		return { ok: false, messageKey: "captureNoProject" };
	}
	// HUMAN provenance — the user's own intention. The detail is the verbatim utterance,
	// prefixed with who when given (provenance is preserved, never invented).
	const detail = who
		? `humain: ${who} — « ${intent} »`
		: `humain: « ${intent} »`;
	const idea = captureIdea(proposesRaw, intent, { source: "human", detail });
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", projectId };
	}
	try {
		const body = {
			proposes: idea.proposes,
			intent: idea.intent,
			provenance: idea.provenance,
			status: idea.status,
		};
		await c`
			insert into ideas.idea (id, body, version, project_id)
			values (${idea.id}, ${JSON.stringify(body)}::jsonb, ${idea.id}, ${projectId})
			on conflict (id) do nothing`;
		revalidatePath("/capture-idea");
		return { ok: true, messageKey: "captureOk", id: idea.id, projectId };
	} catch (err) {
		console.warn("[/capture-idea] capture failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", projectId };
	}
}
