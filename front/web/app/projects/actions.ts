"use server";

import { revalidatePath } from "next/cache";
import postgres from "postgres";
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

/** snapshot reads the live head projects, falling back to the demo deterministically. */
export async function snapshot(): Promise<ProjectSnapshot> {
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
