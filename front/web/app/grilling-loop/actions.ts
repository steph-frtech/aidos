"use server";

import { revalidatePath } from "next/cache";
import postgres from "postgres";
import { activeProjectContext } from "@/lib/activeProjectServer";
import { PROPOSES_KINDS, type Proposes } from "@/lib/capture-idea";
import type { GrillVerdict } from "@/lib/exploration";
import { readVia } from "@/lib/gateway-sdk";
import {
	type Intention,
	knownVerdict,
	route,
	type VerdictRecord,
} from "@/lib/grilling-loop";
import { demoRoute, routeArgs } from "@/lib/grilling-loop-data";
import { panelScope } from "@/lib/panelScope";
import { routeDecoder } from "./live";

/**
 * Server Actions for the /grilling-loop Workbench panel (S65 — the in-product grilling loop).
 *
 * THE STEP (ROADMAP S65): a conversational surface that EXECUTES the /grill verdict — a human
 * grills an INTENTION (prose intent + ≤ 5 candidate scenarios) and routes it on the closed
 * three-value verdict (sharp → grilled ; fuzzy → spiking ; bad → rejected, traced), recording
 * the verdict + provenance. The routing is DETERMINISTIC and AUTHORITATIVE (the pure twin
 * lib/grilling-loop.route, byte-identical to back/runtime/grillingloop.Route, reusing
 * routeVerdict (S28) + captureIdea (S64)). The LLM is the barricaded exception for the DIALOGUE
 * only; a verdict it suggests is re-checked against the verdict schema (verifyLlmVerdict) before
 * it can route — the code never defers to the model.
 *
 * THE WALL (CLAUDE.md §2): the `ideas` schema is STAGING ABOVE the line — the routed idea is a
 * CANDIDATE-truth (no version-freeze, no mirror), written below the wall's write-fence (the agent
 * role has INSERT/SELECT/UPDATE on ideas.idea, S27). Promotion to a kernel truth is the /goal flow
 * (S66), never a write from this screen. On a DB-unreachable / no-DSN / no-active-project situation
 * the action returns a friendly error rather than crashing.
 *
 * THE CANONICAL DOOR (recorded OpenQuestion): the canonical door for an idea transition is the
 * idea-intake MCP (idea_capture then idea_grill/idea_spike/idea_reject), fronted by the S58
 * passerelle. This screen writes the routed status directly via a server action (the below-the-line
 * write path, the same shape the gateway dispatches); reconcile through the MCP-over-HTTP gateway
 * when S59-cutover wires the write tools (forward-dependency, does not block S65).
 */

export interface InboxRow {
	id: string;
	proposes: Proposes;
	intent: string;
	status: string;
	source: string;
	detail: string;
	rejectReason?: string;
	projectId: string;
}

export interface InboxSnapshot {
	source: "live" | "demo";
	activeProjectId: string | null;
	rows: InboxRow[];
}

export interface RouteResult {
	ok: boolean;
	/** i18n key under the "grillingLoop.messages" namespace describing the outcome. */
	messageKey: string;
	/** The content-address id produced, when a routing succeeded. */
	id?: string;
	/** The verdict that routed the idea. */
	verdict?: GrillVerdict;
	/** The routed lifecycle status (grilled | spiking | rejected). */
	status?: VerdictRecord["idea"]["status"];
	/** The project the idea was scoped to. */
	projectId?: string;
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

function isProposes(v: string): v is Proposes {
	return (PROPOSES_KINDS as readonly string[]).includes(v);
}

// Demo fallback — deterministic routed-idea examples (one per verdict lane) so the
// inbox is never blank when Postgres is unreachable. Built through the SAME pure twin
// the action uses, so the demo cards carry real content-address ids + routed statuses.
const DEMO_PROJECT = "demo-project";
const DEMO_ROWS: InboxRow[] = (
	[
		{
			v: "sharp" as GrillVerdict,
			intent: "je veux un code promo pour les habitués",
			reason: "",
		},
		{
			v: "fuzzy" as GrillVerdict,
			intent: "quelque chose autour de retries plus malins",
			reason: "",
		},
		{
			v: "bad" as GrillVerdict,
			intent: "réécrire tout le panier en une nuit",
			reason: "hors périmètre, doublon d'une policy existante",
		},
	] as const
).map(({ v, intent, reason }) => {
	const rec = route(
		v === "fuzzy" ? "operation" : "policy",
		{ intent, scenarios: [] },
		v,
		`humain: démo — « ${intent} »`,
		reason,
	);
	return {
		id: rec.idea.id,
		proposes: rec.idea.proposes,
		intent: rec.idea.intent,
		status: rec.idea.status,
		source: rec.idea.provenance.source,
		detail: rec.idea.provenance.detail,
		...(rec.idea.rejectReason ? { rejectReason: rec.idea.rejectReason } : {}),
		projectId: DEMO_PROJECT,
	};
});

/**
 * inboxSnapshot reads the live per-project ideas that have been ROUTED past draft
 * (grilled | spiking | rejected) — the trace of grilling decisions for the active
 * project. Falls back to the deterministic demo on any failure. THE WALL: a read.
 */
export async function inboxSnapshot(): Promise<InboxSnapshot> {
	const ctx = await activeProjectContext();
	const activeProjectId = ctx.activeId;
	const c = client();
	if (!c || !activeProjectId) {
		return {
			source: "demo",
			activeProjectId: activeProjectId ?? DEMO_PROJECT,
			rows: DEMO_ROWS,
		};
	}
	try {
		const rows = await c<
			{ id: string; body: Record<string, unknown>; project_id: string }[]
		>`select id, body, project_id
		  from ideas.idea
		  where project_id = ${activeProjectId}
		    and body->>'status' in ('grilled','spiking','rejected')
		  order by id`;
		return {
			source: "live",
			activeProjectId,
			rows: rows.map((r) => {
				const prov = (r.body.provenance ?? {}) as Record<string, string>;
				return {
					id: r.id,
					proposes: r.body.proposes as Proposes,
					intent: String(r.body.intent ?? ""),
					status: String(r.body.status ?? ""),
					source: String(prov.source ?? "human"),
					detail: String(prov.detail ?? ""),
					rejectReason: r.body.reject_reason
						? String(r.body.reject_reason)
						: undefined,
					projectId: r.project_id,
				};
			}),
		};
	} catch (err) {
		console.warn("[/grilling-loop] inbox failed:", (err as Error).message);
		return { source: "demo", activeProjectId, rows: DEMO_ROWS };
	}
}

/**
 * routeIntentionAction is the action-capable control behind the grilling surface (CLAUDE.md §7
 * ui-completeness): the human types an intention + up to five scenarios, picks the kind it would
 * become, NAMES the verdict (sharp | fuzzy | bad), and submits — the action validates the intention
 * (≤ 5 scenarios), content-addresses the sketch (the pure twin), routes it DETERMINISTICALLY on the
 * verdict (the code is the authority), and persists the routed `ideas` row with HUMAN provenance and
 * the recorded verdict + (for bad) the traced reason. Returns the id + verdict + status so the panel
 * shows the routed lane.
 */
export async function routeIntentionAction(
	_prev: RouteResult,
	formData: FormData,
): Promise<RouteResult> {
	const intent = String(formData.get("intent") ?? "").trim();
	const proposesRaw = String(formData.get("proposes") ?? "").trim();
	const verdictRaw = String(formData.get("verdict") ?? "").trim();
	const reason = String(formData.get("reason") ?? "").trim();
	const who = String(formData.get("who") ?? "").trim();
	// Up to five scenario lines, submitted one-per-line in a textarea; blanks dropped.
	const scenarios = String(formData.get("scenarios") ?? "")
		.split("\n")
		.map((s) => s.trim())
		.filter((s) => s !== "");

	if (!intent) return { ok: false, messageKey: "intentEmpty" };
	if (!isProposes(proposesRaw)) return { ok: false, messageKey: "badProposes" };
	// The verdict schema gate is AUTHORITATIVE: an off-schema verdict routes nothing.
	if (!knownVerdict(verdictRaw)) return { ok: false, messageKey: "badVerdict" };
	if (scenarios.length > 5)
		return { ok: false, messageKey: "tooManyScenarios" };
	if (verdictRaw === "bad" && !reason) {
		return { ok: false, messageKey: "rejectNeedsReason" };
	}

	const ctx = await activeProjectContext();
	const projectId = ctx.activeId;
	if (!projectId) return { ok: false, messageKey: "noProject" };

	const detail = who
		? `humain: ${who} — « ${intent} »`
		: `humain: « ${intent} »`;
	const intention: Intention = { intent, scenarios };

	// THE FLIP (ADR 0092 batch-4B): the routed VerdictRecord is computed LIVE by the Go grilling-loop MCP
	// server through the passerelle (`grill_route` — the deterministic, authoritative routing), with the
	// twin `route` (via demoRoute) as the deterministic fallback. The pre-flight gates above already
	// guarantee a valid intention/verdict, so demoRoute will not throw; readVia degrades to it on any
	// gateway-unreachable / undispatched / malformed answer (tagged source, never silently mis-routed).
	let rec: VerdictRecord;
	try {
		const scope = await panelScope();
		const { data } = await readVia<VerdictRecord>(
			scope,
			"grill_route",
			routeArgs(proposesRaw, intention, verdictRaw, detail, reason),
			routeDecoder,
			demoRoute(proposesRaw, intention, verdictRaw, detail, reason),
		);
		rec = data;
	} catch (err) {
		console.warn("[/grilling-loop] route failed:", (err as Error).message);
		return { ok: false, messageKey: "tooManyScenarios", projectId };
	}

	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", projectId };
	}
	try {
		const body = {
			proposes: rec.idea.proposes,
			intent: rec.idea.intent,
			provenance: rec.idea.provenance,
			status: rec.idea.status,
			...(rec.idea.rejectReason
				? { reject_reason: rec.idea.rejectReason }
				: {}),
		};
		// Upsert the routed candidate: the same sketch re-grilled keeps its content-address id;
		// on conflict we advance the status to the routed lane (the verdict re-route is idempotent
		// per id within a project).
		await c`
			insert into ideas.idea (id, body, version, project_id)
			values (${rec.idea.id}, ${JSON.stringify(body)}::jsonb, ${rec.idea.id}, ${projectId})
			on conflict (id) do update set body = excluded.body`;
		revalidatePath("/grilling-loop");
		return {
			ok: true,
			messageKey: "routeOk",
			id: rec.idea.id,
			verdict: rec.verdict,
			status: rec.idea.status,
			projectId,
		};
	} catch (err) {
		console.warn("[/grilling-loop] persist failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", projectId };
	}
}
