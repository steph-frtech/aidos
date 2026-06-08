import { createHash } from "node:crypto";

/**
 * lib/membership.ts — the S62 PROJECT MEMBERSHIP authority, the pure TS twin of
 * back/runtime/membership (the Go authority). It answers, deterministically and
 * client-side-mirrorably: "is this resolved identity a member of this project,
 * and may its role perform THIS op?".
 *
 * THE THIRD LAYER (CLAUDE.md §2, ROADMAP S55⇄S61⇄S62). Authentication (S61)
 * proves WHO; the project-scope wall + RLS (S55) prove the active project; S62
 * adds the MEMBERSHIP predicate: a VALID identity holding NO membership row in
 * the project is a NON-MEMBER, refused NOT_A_MEMBER — independent of auth.
 *
 * ROLE GRADIENT (owner ⊃ editor ⊃ viewer), a closed declared lattice (CLAUDE.md
 * §8: authorities declared, never learned). A viewer reads but may NOT mutate;
 * an editor reads + mutates; an owner additionally administers membership
 * (invite/remove/role) — the real owner project.owner_ref (S53) resolves to.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). `authorize`/`canAdminister` are PURE TOTAL
 * functions; `newMembership` is content-addressed (SHA-256, byte-identical to the
 * Go records.Hash) so the same (identity, project, role) lands the same id.
 */

export type Role = "owner" | "editor" | "viewer";
export type OpKind = "read" | "mutate" | "administer";
export type Verdict = "allow" | "deny";
export type BlockCode = "NOT_A_MEMBER" | "ROLE_FORBIDDEN";

export const ROLES: readonly Role[] = ["owner", "editor", "viewer"] as const;

export interface Membership {
	/** content address (SHA-256 hex of the canonical body) — twin of the Go id. */
	id: string;
	/** the propagated caller identity (accounts.users.id, S61). */
	identity: string;
	/** the project (projects.project.id, S53) this membership scopes. */
	projectId: string;
	/** the member's one role. */
	role: Role;
}

export interface BlockReason {
	code: BlockCode;
	severity: "error";
	explanation: string;
	howToFix: string[];
}

export interface Decision {
	verdict: Verdict;
	blockReason?: BlockReason;
}

export function isValidRole(r: string): r is Role {
	return r === "owner" || r === "editor" || r === "viewer";
}

/** canMutate — editor & owner (not viewer). */
function canMutate(r: Role): boolean {
	return r === "owner" || r === "editor";
}

/** canAdministerRole — owner only. */
function canAdministerRole(r: Role): boolean {
	return r === "owner";
}

const BODY_KIND = "project_member";

/**
 * newMembership content-addresses a membership. The canonical body MUST match the
 * Go membershipBody key order exactly ({kind, identity, project_id, role}) so the
 * id is byte-identical to back/runtime/membership.NewMembership (one shared
 * content address across the wall). PURE.
 */
export function newMembership(
	identity: string,
	projectId: string,
	role: Role,
): Membership {
	const id = String(identity).trim();
	const pid = String(projectId).trim();
	if (!id) throw new Error("membership identity must not be empty");
	if (!pid) throw new Error("membership project_id must not be empty");
	if (!isValidRole(role)) {
		throw new Error("membership role must be one of owner|editor|viewer");
	}
	// canonical JSON — the Go records.Canonicalize shape: keys SORTED alphabetically
	// (identity, kind, project_id, role), no spaces. This makes the id byte-identical
	// to back/runtime/membership.NewMembership (one content address across the wall).
	const body = JSON.stringify({
		identity: id,
		kind: BODY_KIND,
		project_id: pid,
		role,
	});
	const hash = createHash("sha256")
		.update(Buffer.from(body, "utf8"))
		.digest("hex");
	return { id: hash, identity: id, projectId: pid, role };
}

function notAMember(projectId: string): BlockReason {
	return {
		code: "NOT_A_MEMBER",
		severity: "error",
		explanation:
			`Refus d'adhésion : l'identité est authentifiée (S61) mais ne détient AUCUNE ligne ` +
			`d'adhésion dans le projet « ${projectId} ». L'authentification prouve QUI vous êtes, ` +
			`pas que vous êtes membre de CE projet (CLAUDE.md §2, ROADMAP S62).`,
		howToFix: [
			"Demandez à un owner du projet de vous inviter (server action invite, below-the-line).",
			"L'adhésion est propre à un projet : être membre du projet A ne vous rend pas membre du projet B.",
		],
	};
}

function roleForbidden(role: Role, op: OpKind): BlockReason {
	return {
		code: "ROLE_FORBIDDEN",
		severity: "error",
		explanation:
			`Refus de rôle : le rôle « ${role} » ne permet pas l'opération « ${op} ». ` +
			`Le gradient est déclaré (owner ⊃ editor ⊃ viewer) : un viewer lit mais ne mute pas ; ` +
			`administrer l'adhésion est réservé au owner (ROADMAP S62).`,
		howToFix: [
			"Pour muter le projet, demandez le rôle editor ou owner à un owner (server action role).",
			"Pour administrer l'adhésion, seul un owner le peut.",
		],
	};
}

/**
 * authorize maps a membership (null ⇒ NON-MEMBER) + the attempted op to a Decision.
 * PURE and TOTAL — the exact twin of the Go Authorize. A membership for a DIFFERENT
 * project is treated as no membership for THIS project (NOT_A_MEMBER).
 */
export function authorize(
	m: Membership | null,
	projectId: string,
	op: OpKind,
): Decision {
	const pid = String(projectId).trim();
	if (
		m === null ||
		!isValidRole(m.role) ||
		m.projectId.trim() !== pid ||
		pid === ""
	) {
		return { verdict: "deny", blockReason: notAMember(pid) };
	}
	switch (op) {
		case "read":
			return { verdict: "allow" };
		case "mutate":
			return canMutate(m.role)
				? { verdict: "allow" }
				: { verdict: "deny", blockReason: roleForbidden(m.role, op) };
		case "administer":
			return canAdministerRole(m.role)
				? { verdict: "allow" }
				: { verdict: "deny", blockReason: roleForbidden(m.role, op) };
		default:
			return { verdict: "deny", blockReason: roleForbidden(m.role, op) };
	}
}

/** canAdminister — only an owner membership for the target project may administer. */
export function canAdminister(
	m: Membership | null,
	projectId: string,
): boolean {
	return authorize(m, projectId, "administer").verdict === "allow";
}
