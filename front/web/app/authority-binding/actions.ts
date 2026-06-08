"use server";

import {
	type AuthorityGraph,
	type AuthorityRoleBinding,
	decideProposal,
	type ProposalDecision,
	type RealActor,
	toProvenanceDetail,
	validateOverride,
} from "@/lib/authority-binding";
import type { Role } from "@/lib/membership";

/**
 * Server Actions for the /authority-binding Workbench panel (S63 KERNEL/AUTH).
 *
 * S63 binds a REAL user (via their membership role, S62) to a scope authority (S16
 * AuthorityGraph) and records the acting human as provenance — never a placeholder. The
 * decision is DETERMINISTIC pure logic (lib/authority-binding = the TS twin of
 * back/runtime/authoritybinding); the judge is code, not an LLM (CLAUDE.md §8).
 *
 *   propose — decide a truth-write proposal: admitted | INSUFFICIENT_AUTHORITY | VETOED |
 *             PLACEHOLDER_ACTOR | escalated. READ-ONLY against truth (the wall, §2): it
 *             neither reads nor writes kernel/mirrors — it only computes whether the acting
 *             user holds the scope's authority.
 *   override — record an override decision: REQUIRES ChangeSet + ADR + real-actor provenance
 *             (CLAUDE.md §8). validateOverride gates the recording; an incomplete override is
 *             refused OVERRIDE_NOT_RECORDED.
 *
 * OpenQuestion (recorded, by-design forward dependency, CLAUDE.md §6 bootstrap exception):
 * the canonical override persistence is an append-only row through the changeset MCP/engine
 * (S20) under the gateway-propagated identity (S58/S61). Until that door is wired into the
 * Workbench, this action computes the content-addressed override (the Go NewOverride id) and
 * returns it for display; persistence does NOT block S63 (the decision + the recorded-shape
 * are the done-criteria). No truth is ever written from the screen.
 */

// The scope's AuthorityGraph + bindings are DECLARED (CLAUDE.md §8: declared, never learned).
// The demo scope is the checkout domain: a regulatory truth requires product_owner approval,
// security may veto; an owner member holds product_owner (+ security via the second binding).
const CHECKOUT_GRAPH: AuthorityGraph = {
	domain: "checkout",
	truthKind: "regulatory",
	approvers: ["product_owner"],
	veto: ["security"],
	escalation: ["architecture_board"],
};

function bindingsFor(grantSecurity: boolean): AuthorityRoleBinding[] {
	const roles = grantSecurity
		? ["product_owner", "security"]
		: ["product_owner"];
	return [{ domain: "checkout", minProjectRole: "owner", roles }];
}

export interface ProposeResult {
	ran: boolean;
	decision?: ProposalDecision;
	provenance?: string;
}

const ROLE_VALUES: Role[] = ["owner", "editor", "viewer"];

function readMemberRole(raw: string | null): Role | null {
	if (raw && (ROLE_VALUES as string[]).includes(raw)) return raw as Role;
	return null; // "none" / anything else ⇒ non-member
}

/** proposeAction decides a truth-write proposal (the S63 gate). PURE-backed; no truth write. */
export async function proposeAction(
	_prev: ProposeResult,
	formData: FormData,
): Promise<ProposeResult> {
	const actor: RealActor = {
		identity: String(formData.get("actorIdentity") ?? ""),
		display: String(formData.get("actorDisplay") ?? ""),
	};
	const memberRole = readMemberRole(
		formData.get("memberRole") ? String(formData.get("memberRole")) : null,
	);
	const grantSecurity = formData.get("vetoHolder") === "on";
	const intent = String(formData.get("intent") ?? "");

	const decision = decideProposal(
		CHECKOUT_GRAPH,
		actor,
		memberRole,
		bindingsFor(grantSecurity),
	);
	// Provenance is recorded ONLY for a real actor (never a placeholder).
	const provenance =
		decision.blockReason?.code === "PLACEHOLDER_ACTOR"
			? undefined
			: toProvenanceDetail(actor, intent);

	return { ran: true, decision, provenance };
}

export interface OverrideResult {
	ran: boolean;
	ok: boolean;
	id?: string;
	code?: string;
	explanation?: string;
	howToFix?: string[];
}

/**
 * overrideAction records an override decision. An override is a RECORDED decision (CLAUDE.md
 * §8) — it REQUIRES a ChangeSet ref + an ADR ref + a real-actor provenance + a reason.
 * validateOverride gates it; on success the content-addressed id is computed deterministically
 * (the Go records.Hash scheme) for display.
 */
export async function overrideAction(
	_prev: OverrideResult,
	formData: FormData,
): Promise<OverrideResult> {
	const actor: RealActor = {
		identity: String(formData.get("actorIdentity") ?? ""),
		display: String(formData.get("actorDisplay") ?? ""),
	};
	const override = {
		overriddenCode: "INSUFFICIENT_AUTHORITY" as const,
		changeSetRef: String(formData.get("changesetRef") ?? ""),
		adrRef: String(formData.get("adrRef") ?? ""),
		actor,
		reason: String(formData.get("reason") ?? ""),
	};
	const res = validateOverride(override);
	if (!res.ok) {
		return {
			ran: true,
			ok: false,
			code: res.blockReason?.code,
			explanation: res.blockReason?.explanation,
			howToFix: res.blockReason?.howToFix,
		};
	}
	// Deterministic content address (mirrors back/runtime/authoritybinding.Override.contentAddress).
	const id = await overrideContentAddress(override);
	return { ran: true, ok: true, id };
}

/**
 * overrideContentAddress computes the SHA-256 content address of the override's canonical body
 * — the SAME scheme as Go records.Hash(records.Canonicalize(body)) (sorted keys). It is the
 * deterministic id the append-only changeset row would carry.
 */
async function overrideContentAddress(o: {
	overriddenCode: string;
	changeSetRef: string;
	adrRef: string;
	actor: RealActor;
	reason: string;
}): Promise<string> {
	// Canonical body keys sorted alphabetically to match records.Canonicalize (Go twin).
	const body = {
		actor_display: o.actor.display.trim(),
		actor_identity: o.actor.identity.trim(),
		adr_ref: o.adrRef.trim(),
		changeset_ref: o.changeSetRef.trim(),
		kind: "authority_override",
		overridden_code: o.overriddenCode,
		reason: o.reason.trim(),
	};
	const json = JSON.stringify(body);
	const bytes = new TextEncoder().encode(json);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
