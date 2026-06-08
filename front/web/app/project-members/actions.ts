"use server";

import { revalidatePath } from "next/cache";
import postgres from "postgres";
import {
	authorize,
	canAdminister,
	isValidRole,
	type Membership,
	newMembership,
	type OpKind,
	type Role,
} from "@/lib/membership";

/**
 * Server Actions for the /project-members Workbench panel (S62).
 *
 * PROJECT MEMBERSHIP & OWNERSHIP — the join (identity × project × role). These are
 * BELOW the wall (CLAUDE.md §2): `accounts.project_members` is not
 * kernel/mirrors/fitness, it is content-addressed and append-only, so the Workbench
 * writes it directly (the invite/remove/role server actions the roadmap names).
 *
 *   invite  — content-address a membership (identity × project × role) + INSERT the row.
 *   role    — change a member's role: revoke the old row, insert a NEW content-addressed
 *             one (append-only; an identity never holds two live roles in one project).
 *   remove  — SOFT delete: mark revoked_at (the row is KEPT; the hard GDPR delete is S116).
 *
 * EVERY admin action is GATED by the role gradient (the membership authority,
 * lib/membership = the TS twin of back/runtime/membership): only an OWNER acting in
 * the target project may administer — a viewer/editor/non-member is refused
 * ROLE_FORBIDDEN / NOT_A_MEMBER. The check is the deterministic `canAdminister`.
 *
 * The acting identity is the resolved caller (S61). In the Workbench we read it from
 * the `actor` form field (the demo cockpit; the gateway propagates the real identity
 * at S58/S61). project.owner_ref (S53) resolves to the owner membership.
 *
 * OpenQuestion (recorded, by-design forward dependency): the canonical single door
 * is the membership MCP (ADR 0009) + the gateway-propagated identity (S58/S61); the
 * Workbench writes the accounts schema directly via a server action meanwhile.
 */

export interface ActionResult {
	ok: boolean;
	/** i18n key under the "projectMembers" namespace describing the outcome. */
	messageKey: string;
	/** machine code on a wall/role refusal. */
	code?: string;
	id?: string;
}

export interface MemberRow extends Membership {
	createdAt: string;
}

export interface MembersSnapshot {
	source: "live" | "demo";
	/** the project whose membership is shown. */
	projectId: string;
	members: MemberRow[];
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

// Demo fallback — deterministic, the same fixture the e2e exercises so the panel is
// never blank. proj-alpha: an owner (oz), an editor (ed), a viewer (vic).
const DEMO_PROJECT = "proj-alpha";
function demoMembers(): MemberRow[] {
	const mk = (identity: string, role: Role): MemberRow => ({
		...newMembership(identity, DEMO_PROJECT, role),
		createdAt: "2026-06-07T09:00:00Z",
	});
	return [mk("oz", "owner"), mk("ed", "editor"), mk("vic", "viewer")];
}

const BODY = (m: Membership) =>
	JSON.stringify({
		identity: m.identity,
		kind: "project_member",
		project_id: m.projectId,
		role: m.role,
	});

/** snapshot reads the live non-revoked members of a project, falling back to demo. */
export async function snapshot(projectId?: string): Promise<MembersSnapshot> {
	const pid = (projectId ?? "").trim() || DEMO_PROJECT;
	const c = client();
	if (!c) {
		return { source: "demo", projectId: pid, members: demoMembers() };
	}
	try {
		const rows = await c<
			{
				id: string;
				identity: string;
				project_id: string;
				role: string;
				created_at: string;
			}[]
		>`select id, identity, project_id, role, created_at
		  from accounts.project_members
		  where project_id = ${pid} and revoked_at is null
		  order by created_at`;
		return {
			source: "live",
			projectId: pid,
			members: rows.map((r) => ({
				id: r.id,
				identity: r.identity,
				projectId: r.project_id,
				role: r.role as Role,
				createdAt: r.created_at,
			})),
		};
	} catch (err) {
		console.warn("[/project-members] snapshot failed:", (err as Error).message);
		return { source: "demo", projectId: pid, members: demoMembers() };
	}
}

/**
 * actingMembership reads the caller's live membership row in the project (null if a
 * non-member). In the demo fallback it resolves against the demo fixture so the
 * gradient gate is exercised even without a DB.
 */
async function actingMembership(
	c: ReturnType<typeof postgres> | null,
	actor: string,
	projectId: string,
): Promise<Membership | null> {
	const fromDemo = (): Membership | null => {
		const found = demoMembers().find(
			(m) => m.identity === actor && m.projectId === projectId,
		);
		return found ? { ...found } : null;
	};
	if (!c) {
		return fromDemo();
	}
	try {
		const rows = await c<
			{ id: string; identity: string; project_id: string; role: string }[]
		>`select id, identity, project_id, role from accounts.project_members
		  where identity = ${actor} and project_id = ${projectId} and revoked_at is null
		  limit 1`;
		if (rows.length === 0) return null;
		const r = rows[0];
		return {
			id: r.id,
			identity: r.identity,
			projectId: r.project_id,
			role: r.role as Role,
		};
	} catch (err) {
		// The membership table may not yet exist on this DB (the migration is applied
		// at deploy); fall back to the deterministic demo fixture so the gradient gate
		// stays evaluable (the panel is never headless).
		console.warn(
			"[/project-members] acting lookup failed, demo fallback:",
			(err as Error).message,
		);
		return fromDemo();
	}
}

/** gate runs the membership authority: only an OWNER acting in the project administers. */
function adminGate(
	acting: Membership | null,
	projectId: string,
): ActionResult | null {
	const d = authorize(acting, projectId, "administer" as OpKind);
	if (d.verdict === "allow") return null;
	return {
		ok: false,
		messageKey:
			d.blockReason?.code === "NOT_A_MEMBER" ? "notAMember" : "roleForbidden",
		code: d.blockReason?.code,
	};
}

export async function inviteMemberAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const actor = String(formData.get("actor") ?? "").trim();
	const projectId = String(formData.get("projectId") ?? "").trim();
	const identity = String(formData.get("identity") ?? "").trim();
	const role = String(formData.get("role") ?? "").trim();
	if (!projectId || !identity || !role) {
		return { ok: false, messageKey: "inviteEmpty" };
	}
	if (!isValidRole(role)) {
		return { ok: false, messageKey: "badRole" };
	}
	const c = client();
	const acting = await actingMembership(c, actor, projectId);
	const blocked = adminGate(acting, projectId);
	if (blocked) return blocked;
	if (!canAdminister(acting, projectId)) {
		return { ok: false, messageKey: "roleForbidden", code: "ROLE_FORBIDDEN" };
	}

	const m = newMembership(identity, projectId, role as Role);
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", id: m.id };
	}
	try {
		// One ACTIVE membership per (identity, project): revoke any prior live row, then
		// insert the new content-addressed one (append-only).
		await c.begin(async (tx) => {
			await tx`update accounts.project_members set revoked_at = now()
			         where identity = ${identity} and project_id = ${projectId} and revoked_at is null`;
			await tx`insert into accounts.project_members (id, identity, project_id, role, body, version)
			         values (${m.id}, ${m.identity}, ${m.projectId}, ${m.role}, ${BODY(m)}::jsonb, ${m.id})
			         on conflict (id) do nothing`;
		});
		revalidatePath("/project-members");
		return { ok: true, messageKey: "inviteOk", id: m.id };
	} catch (err) {
		console.warn("[/project-members] invite failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", id: m.id };
	}
}

export async function changeRoleAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const actor = String(formData.get("actor") ?? "").trim();
	const projectId = String(formData.get("projectId") ?? "").trim();
	const identity = String(formData.get("identity") ?? "").trim();
	const role = String(formData.get("role") ?? "").trim();
	if (!projectId || !identity || !role) {
		return { ok: false, messageKey: "inviteEmpty" };
	}
	if (!isValidRole(role)) {
		return { ok: false, messageKey: "badRole" };
	}
	const c = client();
	const acting = await actingMembership(c, actor, projectId);
	const blocked = adminGate(acting, projectId);
	if (blocked) return blocked;

	const m = newMembership(identity, projectId, role as Role);
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", id: m.id };
	}
	try {
		// A role change = revoke the old row + insert a NEW content-addressed row.
		let found = false;
		await c.begin(async (tx) => {
			const prior =
				await tx`update accounts.project_members set revoked_at = now()
			         where identity = ${identity} and project_id = ${projectId} and revoked_at is null
			         returning id`;
			found = prior.length > 0;
			if (!found) return;
			await tx`insert into accounts.project_members (id, identity, project_id, role, body, version)
			         values (${m.id}, ${m.identity}, ${m.projectId}, ${m.role}, ${BODY(m)}::jsonb, ${m.id})
			         on conflict (id) do nothing`;
		});
		if (!found) {
			return { ok: false, messageKey: "notFound", id: m.id };
		}
		revalidatePath("/project-members");
		return { ok: true, messageKey: "roleOk", id: m.id };
	} catch (err) {
		console.warn("[/project-members] role failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", id: m.id };
	}
}

export async function removeMemberAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const actor = String(formData.get("actor") ?? "").trim();
	const projectId = String(formData.get("projectId") ?? "").trim();
	const identity = String(formData.get("identity") ?? "").trim();
	if (!projectId || !identity) {
		return { ok: false, messageKey: "inviteEmpty" };
	}
	const c = client();
	const acting = await actingMembership(c, actor, projectId);
	const blocked = adminGate(acting, projectId);
	if (blocked) return blocked;
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable" };
	}
	try {
		// SOFT delete only — mark revoked_at (the row is KEPT; no SQL DELETE; the hard
		// GDPR delete is S116).
		const rows = await c`update accounts.project_members set revoked_at = now()
		         where identity = ${identity} and project_id = ${projectId} and revoked_at is null
		         returning id`;
		if (rows.length === 0) {
			return { ok: false, messageKey: "notFound" };
		}
		revalidatePath("/project-members");
		return { ok: true, messageKey: "removeOk" };
	} catch (err) {
		console.warn("[/project-members] remove failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable" };
	}
}
