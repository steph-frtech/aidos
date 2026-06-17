"use server";

import {
	type Decision,
	isRole,
	type Policy,
	type Subsystem,
} from "@/lib/app-auth";
import {
	demoAccess,
	demoSubsystem,
	gatewayAttachArgs,
	gatewayCheckArgs,
} from "@/lib/app-auth-data";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { attachDecoder, checkDecoder } from "./live";

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
 * THE FLIP (ADR 0092 — the Go engine is the SINGLE live source). Both controls now read the LIVE
 * verdict/preview from the Go app-auth MCP server through the passerelle (`readVia(scope,
 * "app_auth_check_access" | "app_auth_attach", …)`, the dispatched below-the-line reads), with the
 * twin `lib/app-auth` compute preserved ONLY as the deterministic demo fallback (`lib/app-auth-data`,
 * tagged `source:"live"|"demo"`). The actions NO LONGER call the twin functions client-side. The
 * `readVia` frontier import keeps the T5 cliquet GREEN (the twin sits behind the demo fallback).
 *
 * THE WALL (§2/§7): every action WRITES NOTHING. Check-access is a read-only runtime simulation;
 * attach previews a DRAFT and lands an APPLIED changeset VALUE — the legal door (propose → approve),
 * never a direct kernel write (WroteKernel always false). The runtime gate is PURE code, never an LLM
 * (determinism-first, §6/§8): a malformed / undispatched / refused answer yields the demo verdict.
 */

export interface CheckView {
	ok: boolean;
	error?: string;
	role?: string;
	operation?: string;
	decision?: Decision;
	source?: "live" | "demo";
}

/**
 * checkAccessAction — the EMITTED app's runtime authz gate, exercised from the screen. The user picks
 * a runtime role + a protected operation; the action reads ALLOWED/DENIED + the required role LIVE
 * from the Go engine through the passerelle (the twin demoAccess is the deterministic fallback). A
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
	const scope = await panelScope();
	// The demo fallback throws on an unknown operation (the honesty rule); guard it so the action
	// never crashes — an undeclared operation surfaces as a verbatim error, like the twin did.
	let demo: Decision;
	try {
		demo = demoAccess(role, operation);
	} catch (e) {
		return {
			ok: true,
			error: e instanceof Error ? e.message : String(e),
			role,
			operation,
		};
	}
	const { data, source } = await readVia(
		scope,
		"app_auth_check_access",
		gatewayCheckArgs(role, operation),
		checkDecoder,
		demo,
	);
	return { ok: true, role, operation, decision: data, source };
}

export interface AttachView {
	ok: boolean;
	error?: string;
	target?: string;
	subsystem?: Subsystem;
	pieces?: string[];
	policies?: Policy[];
	landed?: boolean;
	source?: "live" | "demo";
}

/**
 * attachAction — the action-capable attach control (CLAUDE.md §7 ui-completeness): the user attaches
 * `app-auth` to their app, and the action reads the expanded subsystem preview LIVE from the Go engine
 * through the passerelle (the twin demoSubsystem is the deterministic fallback) and LANDS it
 * conceptually via the legal door. It WRITES NOTHING beyond the changeset VALUE (the wall). An empty
 * target yields a verbatim error.
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
	const scope = await panelScope();
	const fallback = demoSubsystem();
	// The deterministic demo AttachRead — the twin's expanded subsystem (a preview, never landed in
	// the fallback; the live land rides the changeset door under approval).
	const demoRead = {
		target,
		macro: fallback.macro,
		expansionId: fallback.expansionId,
		pieces: fallback.entities
			.map((e) => e.name)
			.concat(fallback.operations.map((o) => o.name))
			.concat(fallback.policies.map((p) => p.name))
			.sort(),
		policies: fallback.policies,
		landed: false,
		wroteKernel: false,
	};
	const { data, source } = await readVia(
		scope,
		"app_auth_attach",
		gatewayAttachArgs(target, false),
		attachDecoder,
		demoRead,
	);
	// Build the view's Subsystem from the decoded preview + the deterministic entities/operations
	// (identical to the Go expand — the demo subsystem is byte-faithful), so the panel renders the
	// expansionId + pieces + policies whether live or demo.
	const subsystem: Subsystem = {
		macro: data.macro,
		target: data.target,
		entities: fallback.entities,
		operations: fallback.operations,
		policies: data.policies,
		expansionId: data.expansionId || fallback.expansionId,
		wroteKernel: data.wroteKernel,
	};
	return {
		ok: true,
		target: data.target,
		subsystem,
		pieces: data.pieces,
		policies: data.policies,
		landed: true,
		source,
	};
}
