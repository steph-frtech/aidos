/**
 * app-auth — the S80 front twin of back/kernel/appauth (appauth.go). It is the «auth & roles de l'app
 * ÉMISE» behavior-macro: the authentication + role-based authorization subsystem of the application
 * the USER builds (its own User/Role/Session entities, login/logout operations, and the role-authz
 * policy band), distinct from AIDOS' own users (E3). It maps the AuthorityGraph of the EMITTED app's
 * RUNTIME, never the AIDOS approvers.
 *
 * It does NOT fork the authoritative Go expander — the Go `ExpandAppAuth` is the single source of the
 * subsystem; this TS twin reproduces it deterministically for the Workbench preview + the runtime
 * authz simulation, byte-identical (same content-addressed expansionId).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): expandAppAuth and checkAccess are PURE — same input →
 * byte-identical output. The runtime gate is a code lookup over the DECLARED role→operation band,
 * NEVER an LLM. app-auth.test.ts pins it (Vitest + fast-check).
 */

import { createHash } from "node:crypto";

export const MACRO_NAME = "app-auth";

/** The closed runtime role band of the emitted app, weakest → strongest. */
export type Role = "viewer" | "editor" | "admin";
export const ROLE_ORDER: Role[] = ["viewer", "editor", "admin"];
const ROLE_RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function isRole(s: string): s is Role {
	return (ROLE_ORDER as string[]).includes(s);
}

export interface Attribute {
	name: string;
	type: string;
	required: boolean;
}
export interface Entity {
	name: string;
	attributes: Attribute[];
}
export interface Operation {
	name: string;
}
export interface Policy {
	name: string;
	scope: string;
	operation: string;
	min_role: Role;
	effect: string;
}

/** The declared authz band — operation → minimum role (the emitted app's runtime AuthorityGraph). */
export const AUTHZ_BAND: { name: string; minRole: Role }[] = [
	{ name: "login", minRole: "viewer" },
	{ name: "logout", minRole: "editor" },
	{ name: "manageRoles", minRole: "admin" },
];

export interface Subsystem {
	macro: string;
	target: string;
	entities: Entity[];
	operations: Operation[];
	policies: Policy[];
	expansionId: string;
	wroteKernel: boolean;
}

/** The closed User/Role/Session shape — byte-twin of Go declaredEntities(). */
function declaredEntities(): Entity[] {
	return [
		{
			name: "User",
			attributes: [
				{ name: "id", type: "string", required: true },
				{ name: "email", type: "string", required: true },
				{ name: "password_hash", type: "string", required: true },
				{ name: "role", type: "string", required: true },
			],
		},
		{
			name: "Role",
			attributes: [
				{ name: "name", type: "string", required: true },
				{ name: "rank", type: "int", required: true },
			],
		},
		{
			name: "Session",
			attributes: [
				{ name: "id", type: "string", required: true },
				{ name: "user_id", type: "string", required: true },
				{ name: "expires_at", type: "timestamptz", required: true },
			],
		},
	];
}

function declaredOperations(): Operation[] {
	return [{ name: "login" }, { name: "logout" }];
}

function declaredPolicies(): Policy[] {
	return AUTHZ_BAND.map((op) => ({
		name: `authz-${op.name}`,
		scope: "OPERATION",
		operation: op.name,
		min_role: op.minRole,
		effect: "DENY",
	}));
}

/**
 * expandAppAuth — the §24.6 `app-auth` expansion: PURE, DRY-RUN, the emitted app's auth subsystem.
 * Throws on an empty target (the honesty rule, mirroring Go's typed error). wroteKernel is always
 * false (the wall).
 */
export function expandAppAuth(target: string): Subsystem {
	if (!target) throw new Error("appauth: attachment has no target app name");
	const sub: Subsystem = {
		macro: MACRO_NAME,
		target,
		entities: declaredEntities(),
		operations: declaredOperations(),
		policies: declaredPolicies(),
		expansionId: "",
		wroteKernel: false,
	};
	sub.expansionId = expansionId(sub);
	return sub;
}

/** Decision — the runtime authz verdict for a (role, operation) pair on the EMITTED app. */
export interface Decision {
	allowed: boolean;
	role: Role;
	required: Role;
}

/**
 * checkAccess — the EMITTED app's RUNTIME authorization gate: may `role` invoke `operation`? Allowed
 * iff the role's rank ≥ the operation's minimum-role rank, over the DECLARED band. Throws on an
 * unknown role/operation (never a guessed allow — the honesty rule). PURE, never an LLM.
 */
export function checkAccess(role: string, operation: string): Decision {
	if (!isRole(role)) {
		throw new Error(
			`appauth: role is not in the declared runtime role set: "${role}"`,
		);
	}
	const op = AUTHZ_BAND.find((o) => o.name === operation);
	if (!op) {
		throw new Error(
			`appauth: operation is not in the declared authz band: "${operation}"`,
		);
	}
	return {
		allowed: ROLE_RANK[role] >= ROLE_RANK[op.minRole],
		role,
		required: op.minRole,
	};
}

/** sortedNames — every emitted piece name, stable + sorted (byte-twin of Go SortedNames). PURE. */
export function sortedNames(s: Subsystem): string[] {
	const out: string[] = [];
	for (const e of s.entities) out.push(`ent:${e.name}`);
	for (const o of s.operations) out.push(`op:${o.name}`);
	for (const p of s.policies) out.push(`pol:${p.name}`);
	return out.sort();
}

/** pieceCount — entities + operations + policies (byte-twin of Go PieceCount). PURE. */
export function pieceCount(s: Subsystem): number {
	return s.entities.length + s.operations.length + s.policies.length;
}

// --- content address (byte-twin of appauth.expansionID over records.Canonicalize/Hash) ---

/**
 * expansionId content-addresses a subsystem over its semantic body (macro + target + the three
 * kinds), EXCLUDING expansionId/wroteKernel — byte-identical to Go's expansionID. Same body ⇒ same
 * id. The policy `min_role` uses the Go field name (snake_case) so the canonical encoding matches.
 */
export function expansionId(s: Subsystem): string {
	const body = {
		macro: s.macro,
		target: s.target,
		entities: s.entities,
		operations: s.operations,
		policies: s.policies,
	};
	return createHash("sha256")
		.update(Buffer.from(canonicalEncode(body), "utf8"))
		.digest("hex");
}

/**
 * canonicalEncode re-encodes a JSON value with object keys sorted recursively, arrays in order, no
 * whitespace — matching records.Canonicalize so the Go and TS content addresses agree.
 */
function canonicalEncode(v: unknown): string {
	if (v === null || v === undefined) return "null";
	if (Array.isArray(v)) return `[${v.map(canonicalEncode).join(",")}]`;
	if (typeof v === "object") {
		const obj = v as Record<string, unknown>;
		return `{${Object.keys(obj)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonicalEncode(obj[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}
