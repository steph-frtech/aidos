"use server";

import { revalidatePath } from "next/cache";
import postgres from "postgres";
import { arr, type Decoder, isObject, readVia, str } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	canCreate,
	canonicalBody,
	contentAddress,
	isValidSlug,
	type Lifecycle,
	newProject,
	type Project,
} from "@/lib/project";

/**
 * Server Actions for the /projects Workbench panel (S53).
 *
 * A project is BELOW the wall (CLAUDE.md §2): the `projects` schema is not
 * kernel/mirrors/fitness; it is content-addressed and append-only, so the
 * Workbench may write it directly (like /store). These actions replicate the
 * project store path exactly (see back/mcp/project/store.go + back/kernel/project):
 *
 *   create   — content-address the project, gate slug-unique-per-owner, INSERT the
 *              project row + its per-project DAG root in one transaction.
 *   archive  — append a NEW lifecycle=archived row, close the prior head's
 *              superseded_by (the head moves; nothing dropped).
 *   restore  — append a NEW lifecycle=active row.
 *   delete   — SOFT delete: append a NEW lifecycle=deleted row (the row is KEPT,
 *              append-only). The hard GDPR delete is S116. No SQL DELETE ever.
 *
 * OpenQuestion (recorded): the canonical single door for project writes is the
 * `project` MCP server (ADR 0009). The Workbench here writes the projects schema
 * directly via a server action; reconcile via the HTTP/API gateway at S58.
 *
 * On a DB-unreachable / no-DSN situation, these return a friendly error rather
 * than crashing; the read path keeps its demo fallback.
 */

export interface ActionResult {
	ok: boolean;
	/** i18n key under the "projects" namespace describing the outcome. */
	messageKey: string;
	/** The content-address id produced/targeted, when relevant. */
	id?: string;
	/** The slug targeted, when relevant. */
	slug?: string;
}

export interface ProjectSnapshot {
	source: "live" | "demo";
	projects: (Project & { rootNodeId: string })[];
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

// Demo fallback — deterministic, used when Postgres is unreachable. It is the same
// two-project example the e2e exercises so the panel is never blank.
const DEMO: Project[] = [
	newProject("alpha-shop", "Alpha Shop", "owner-1", "2026-06-07T09:00:00Z"),
	newProject("beta-crm", "Beta CRM", "owner-2", "2026-06-07T09:00:00Z"),
];

function rootNodeIdLabel(p: Project): string {
	return `project:${p.slug}@${p.id}`;
}

// project_list → { projects:[{id,slug,name,owner_ref,created_at,lifecycle,root_node_id}] },
// decoded ONCE through the gateway SDK (never double-typed). The S59 cutover read path.
const projectWireDecoder: Decoder<Project & { rootNodeId: string }> = (raw) => {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const slug = str(raw.slug);
	const name = str(raw.name);
	const ownerRef = str(raw.owner_ref);
	const createdAt = str(raw.created_at);
	const lifecycle = str(raw.lifecycle);
	const rootNodeId = str(raw.root_node_id);
	if (
		id === null ||
		slug === null ||
		name === null ||
		ownerRef === null ||
		createdAt === null ||
		lifecycle === null ||
		rootNodeId === null
	) {
		return null;
	}
	return {
		id,
		slug,
		name,
		ownerRef,
		createdAt,
		lifecycle: lifecycle as Lifecycle,
		rootNodeId,
	};
};
const projectListDecoder: Decoder<{
	projects: (Project & { rootNodeId: string })[];
}> = (raw) => {
	if (!isObject(raw)) return null;
	const projects = arr(projectWireDecoder)(raw.projects);
	if (projects === null) return null;
	return { projects };
};

/**
 * snapshotViaGateway reads the active project's head projects through the S58 gateway
 * (project_list, below the line) — the S59 cutover read path. On ANY miss (no endpoint,
 * transport error, malformed / undispatched / refused answer, or an empty live list) it
 * returns null so the caller falls back to the direct content-store read. THE WALL (§2):
 * a read only.
 */
async function snapshotViaGateway(): Promise<ProjectSnapshot | null> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"project_list",
		{},
		projectListDecoder,
		{ projects: [] },
	);
	if (source !== "live" || data.projects.length === 0) return null;
	return { source: "live", projects: data.projects };
}

/** snapshot reads the live head projects, falling back to the demo deterministically. */
export async function snapshot(): Promise<ProjectSnapshot> {
	// S59 cutover: read LIVE through the gateway first (project_list via the passerelle).
	const viaGateway = await snapshotViaGateway();
	if (viaGateway) return viaGateway;
	const c = client();
	if (!c) {
		return {
			source: "demo",
			projects: DEMO.map((p) => ({ ...p, rootNodeId: rootNodeIdLabel(p) })),
		};
	}
	try {
		const rows = await c<
			{ id: string; body: Record<string, string> }[]
		>`select id, body from projects.project where superseded_by is null order by id`;
		return {
			source: "live",
			projects: rows.map((r) => {
				const p: Project = {
					id: r.id,
					slug: r.body.slug,
					name: r.body.name,
					ownerRef: r.body.owner_ref,
					createdAt: r.body.created_at,
					lifecycle: r.body.lifecycle as Lifecycle,
				};
				return { ...p, rootNodeId: rootNodeIdLabel(p) };
			}),
		};
	} catch (err) {
		console.warn("[/projects] snapshot failed:", (err as Error).message);
		return {
			source: "demo",
			projects: DEMO.map((p) => ({ ...p, rootNodeId: rootNodeIdLabel(p) })),
		};
	}
}

async function liveHeads(c: ReturnType<typeof postgres>): Promise<Project[]> {
	const rows = await c<
		{ id: string; body: Record<string, string> }[]
	>`select id, body from projects.project where superseded_by is null`;
	return rows.map((r) => ({
		id: r.id,
		slug: r.body.slug,
		name: r.body.name,
		ownerRef: r.body.owner_ref,
		createdAt: r.body.created_at,
		lifecycle: r.body.lifecycle as Lifecycle,
	}));
}

export async function createProjectAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const slug = String(formData.get("slug") ?? "").trim();
	const name = String(formData.get("name") ?? "").trim();
	const owner = String(formData.get("owner") ?? "").trim();
	if (!slug || !name || !owner) {
		return { ok: false, messageKey: "createEmpty" };
	}
	if (!isValidSlug(slug)) {
		return { ok: false, messageKey: "createBadSlug", slug };
	}
	// The createdAt is deterministic-by-request here (the engine takes it as input);
	// we use a fixed midnight-of-today so re-creating the same project is idempotent.
	const createdAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", slug };
	}
	try {
		const heads = await liveHeads(c);
		if (!canCreate(heads, owner, slug)) {
			return { ok: false, messageKey: "createDuplicate", slug };
		}
		const p = newProject(slug, name, owner, createdAt);
		const body = canonicalBody({
			slug,
			name,
			ownerRef: owner,
			createdAt,
			lifecycle: "active",
		});
		await c.begin(async (tx) => {
			await tx`
				insert into projects.project (id, body, version)
				values (${p.id}, ${body}::jsonb, ${p.id})
				on conflict (id) do nothing`;
			await tx`
				insert into projects.dag_root (project_id, node_id, label)
				values (${p.id}, ${contentAddress({ slug, name, ownerRef: owner, createdAt, lifecycle: "active" })}, ${rootNodeIdLabel(p)})
				on conflict (project_id) do nothing`;
		});
		revalidatePath("/projects");
		return { ok: true, messageKey: "createOk", id: p.id, slug };
	} catch (err) {
		console.warn("[/projects] create failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", slug };
	}
}

async function transition(
	id: string,
	next: Lifecycle,
	okKey: string,
): Promise<ActionResult> {
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", id };
	}
	try {
		let result: ActionResult = { ok: false, messageKey: "notFound", id };
		await c.begin(async (tx) => {
			const rows = await tx<
				{ id: string; body: Record<string, string> }[]
			>`select id, body from projects.project where id = ${id} and superseded_by is null`;
			if (rows.length === 0) {
				result = { ok: false, messageKey: "notFound", id };
				return;
			}
			const r = rows[0];
			const nextProject = newProject(
				r.body.slug,
				r.body.name,
				r.body.owner_ref,
				r.body.created_at,
				next,
			);
			const body = canonicalBody({
				slug: r.body.slug,
				name: r.body.name,
				ownerRef: r.body.owner_ref,
				createdAt: r.body.created_at,
				lifecycle: next,
			});
			await tx`
				insert into projects.project (id, body, version)
				values (${nextProject.id}, ${body}::jsonb, ${nextProject.id})
				on conflict (id) do nothing`;
			await tx`
				update projects.project set superseded_by = ${nextProject.id} where id = ${id}`;
			result = { ok: true, messageKey: okKey, id: nextProject.id };
		});
		revalidatePath("/projects");
		return result;
	} catch (err) {
		console.warn("[/projects] transition failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", id };
	}
}

export async function archiveProjectAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	return transition(String(formData.get("id") ?? ""), "archived", "archiveOk");
}

export async function restoreProjectAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	return transition(String(formData.get("id") ?? ""), "active", "restoreOk");
}

export async function deleteProjectAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	// Soft delete only — append-only (the hard GDPR delete is S116). No SQL DELETE.
	return transition(String(formData.get("id") ?? ""), "deleted", "deleteOk");
}

/**
 * duplicateProjectAction (S57, blank-vs-template) — fork a project into a NEW,
 * ISOLATED root project. It reuses the create path: a fresh content-addressed
 * project + its own DAG root, sharing NO source node (the S56 Duplicate fixture).
 * The new project's owner is the caller; the source is read but never mutated.
 * Below the wall, append-only.
 */
export async function duplicateProjectAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const sourceId = String(formData.get("sourceId") ?? "").trim();
	const slug = String(formData.get("slug") ?? "").trim();
	const name = String(formData.get("name") ?? "").trim();
	const owner = String(formData.get("owner") ?? "").trim();
	if (!slug || !name || !owner) {
		return { ok: false, messageKey: "createEmpty" };
	}
	if (!isValidSlug(slug)) {
		return { ok: false, messageKey: "createBadSlug", slug };
	}
	const createdAt = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", slug };
	}
	try {
		const heads = await liveHeads(c);
		// The source must exist (a duplicate forks FROM a real project, never a guess).
		if (sourceId && !heads.some((h) => h.id === sourceId)) {
			return { ok: false, messageKey: "notFound", id: sourceId };
		}
		if (!canCreate(heads, owner, slug)) {
			return { ok: false, messageKey: "createDuplicate", slug };
		}
		const p = newProject(slug, name, owner, createdAt);
		const body = canonicalBody({
			slug,
			name,
			ownerRef: owner,
			createdAt,
			lifecycle: "active",
		});
		await c.begin(async (tx) => {
			await tx`
				insert into projects.project (id, body, version)
				values (${p.id}, ${body}::jsonb, ${p.id})
				on conflict (id) do nothing`;
			await tx`
				insert into projects.dag_root (project_id, node_id, label)
				values (${p.id}, ${contentAddress({ slug, name, ownerRef: owner, createdAt, lifecycle: "active" })}, ${rootNodeIdLabel(p)})
				on conflict (project_id) do nothing`;
		});
		revalidatePath("/projects");
		return { ok: true, messageKey: "duplicateOk", id: p.id, slug };
	} catch (err) {
		console.warn("[/projects] duplicate failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", slug };
	}
}
