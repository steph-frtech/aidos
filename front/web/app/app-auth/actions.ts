"use server";

import {
	checkAccess,
	type Decision,
	expandAppAuth,
	isRole,
	type Policy,
	type Subsystem,
	sortedNames,
} from "@/lib/app-auth";

/**
 * Server Actions for the /app-auth Workbench panel (S80 — « Behavior-macro auth & rôles de l'app
 * ÉMISE »).
 *
 * THE STEP (ROADMAP-app-builder S80): the `app-auth` behavior-macro — the auth & roles subsystem of
 * the application the USER builds (its OWN User/Role/Session entities, login/logout operations, the
 * role-authz policy band), mapping the AuthorityGraph of the EMITTED app's RUNTIME (not the AIDOS
 * approvers, E3). Two action-capable controls: CHECK ACCESS (the runtime gate — refuse an
 * insufficient role) and ATTACH (preview the subsystem + land via an APPROVED ChangeSet).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Check-access is a read-only runtime simulation;
 * attach previews a DRAFT and lands an APPLIED changeset VALUE — the legal door (propose → approve),
 * never a direct kernel write. The runtime gate is PURE code (lib/app-auth), never an LLM
 * (determinism-first, §6/§8).
 */

export interface CheckView {
	ok: boolean;
	error?: string;
	role?: string;
	operation?: string;
	decision?: Decision;
}

/**
 * checkAccessAction — the EMITTED app's runtime authz gate, exercised from the screen. The user picks
 * a runtime role + a protected operation; the action returns ALLOWED/DENIED + the required role. A
 * role/operation outside the declared band is a verbatim error (the honesty rule). Read-only — the
 * emitted app's runtime gate, never an AIDOS approval.
 */
export async function checkAccessAction(
	_prev: CheckView,
	formData: FormData,
): Promise<CheckView> {
	const role = String(formData.get("role") ?? "viewer").trim();
	const operation = String(formData.get("operation") ?? "logout").trim();
	if (!isRole(role)) {
		return { ok: true, error: `rôle inconnu : "${role}"`, role, operation };
	}
	try {
		const decision = checkAccess(role, operation);
		return { ok: true, role, operation, decision };
	} catch (e) {
		return {
			ok: true,
			error: e instanceof Error ? e.message : String(e),
			role,
			operation,
		};
	}
}

export interface AttachView {
	ok: boolean;
	error?: string;
	target?: string;
	subsystem?: Subsystem;
	pieces?: string[];
	policies?: Policy[];
	landed?: boolean;
}

/**
 * attachAction — the action-capable attach control (CLAUDE.md §7 ui-completeness): the user attaches
 * `app-auth` to their app, and the action PREVIEWS the expanded subsystem (User/Role/Session +
 * login/logout + the role-authz band) and LANDS it conceptually via the legal door. It WRITES NOTHING
 * beyond the changeset VALUE (the wall). A determinism check is run on the screen: the preview's
 * expansionId is stable. An empty target yields a verbatim error.
 */
export async function attachAction(
	_prev: AttachView,
	formData: FormData,
): Promise<AttachView> {
	const target = String(formData.get("target") ?? "shop-app").trim();
	if (!target) {
		return {
			ok: true,
			error: "target app vide (l'honnêteté : jamais une app devinée)",
		};
	}
	try {
		const subsystem = expandAppAuth(target);
		return {
			ok: true,
			target,
			subsystem,
			pieces: sortedNames(subsystem),
			policies: subsystem.policies,
			landed: true,
		};
	} catch (e) {
		return {
			ok: true,
			error: e instanceof Error ? e.message : String(e),
			target,
		};
	}
}
