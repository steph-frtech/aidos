/**
 * lib/authority-binding.ts — the TS twin of back/runtime/authoritybinding (S63 KERNEL/AUTH
 * binding). It grounds the abstract S16 AuthorityGraph "granted" set in a REAL user (a
 * project member, via a declared AuthorityRoleBinding), so a truth-write proposal requires
 * APPROVAL FROM A USER HOLDING THE SCOPE'S AUTHORITY — else INSUFFICIENT_AUTHORITY. It also
 * pins the rule that provenance is a real actor, never a placeholder, and that an override
 * is a recorded decision (ChangeSet + ADR + provenance), never a silent bypass.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE and TOTAL — no clock, no rng,
 * no I/O, no LLM. Same input ⇒ same verdict (the Vitest+fast-check mirror pins it). The
 * decision logic is BYTE-FOR-BYTE the Go authority (decideProposal mirrors DecideProposal),
 * not a re-interpretation — the two twins must never drift. It writes NOTHING (the wall):
 * the proposal is a read-only decision; the override is a propose→ChangeSet recorded
 * decision the caller persists.
 */

import type { Role as MemberRole } from "@/lib/membership";

/** AuthorityRole is an open named authority (product_owner, security, …) — non-blank. */
export type AuthorityRole = string;

/** The S63-local refusal codes (mirrors back/runtime/authoritybinding.BlockCode). */
export type BlockCode =
	| "INSUFFICIENT_AUTHORITY"
	| "PLACEHOLDER_ACTOR"
	| "OVERRIDE_NOT_RECORDED"
	| "VETOED";

export interface BlockReason {
	code: BlockCode;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** A real acting human (never a placeholder). */
export interface RealActor {
	identity: string;
	display: string;
}

/** The S16 AuthorityGraph shape this twin keys on. */
export interface AuthorityGraph {
	domain: string;
	truthKind: string;
	approvers: AuthorityRole[];
	veto?: AuthorityRole[];
	escalation?: AuthorityRole[];
}

/** The declared binding: a member-role floor × scope-domain → the authority roles awarded. */
export interface AuthorityRoleBinding {
	/** empty = wildcard domain (awards in every domain). */
	domain?: string;
	minProjectRole: MemberRole;
	roles: AuthorityRole[];
}

export type Decision = "admitted" | "blocked" | "escalated";

export interface ProposalDecision {
	decision: Decision;
	actor: RealActor;
	grantedRoles: AuthorityRole[];
	blockReason?: BlockReason;
}

/** The closed placeholder denylist — must match the Go placeholderIdentities map. */
const PLACEHOLDER_IDENTITIES = new Set<string>([
	"",
	"system",
	"agent",
	"aidos",
	"aidos_agent",
	"tbd",
	"todo",
	"placeholder",
	"anonymous",
	"anon",
	"unknown",
	"none",
	"null",
	"nobody",
]);

/** isPlaceholder — true for the empty/blank string or a denylisted identity (trimmed, lower). */
export function isPlaceholder(identity: string): boolean {
	return PLACEHOLDER_IDENTITIES.has(identity.trim().toLowerCase());
}

/** isWellFormedRole — a non-blank authority role identifier. */
function isWellFormedRole(r: AuthorityRole): boolean {
	return r.trim().length > 0;
}

const ROLE_RANK: Record<string, number> = { owner: 3, editor: 2, viewer: 1 };

function rank(r: MemberRole | string): number {
	return ROLE_RANK[r] ?? -1;
}

function meetsFloor(holder: MemberRole, floor: MemberRole): boolean {
	const hr = rank(holder);
	return hr >= 0 && hr >= rank(floor);
}

/**
 * resolveGrantedRoles — the S63 join: the SET of authority roles a member holds for a
 * domain (deduped + sorted, deterministic). A nil/invalid member grants nothing.
 */
export function resolveGrantedRoles(
	memberRole: MemberRole | null,
	domain: string,
	bindings: AuthorityRoleBinding[],
): AuthorityRole[] {
	if (memberRole === null || rank(memberRole) < 0) return [];
	const seen = new Set<AuthorityRole>();
	for (const b of bindings) {
		const domainMatch = !b.domain || b.domain === domain;
		if (!domainMatch) continue;
		if (!meetsFloor(memberRole, b.minProjectRole)) continue;
		for (const r of b.roles) if (isWellFormedRole(r)) seen.add(r);
	}
	return [...seen].sort();
}

/** requireRealActor — refuse the empty/blank/placeholder actor (provenance ≠ placeholder). */
export function requireRealActor(a: RealActor): BlockReason | null {
	if (isPlaceholder(a.identity) || a.display.trim() === "") {
		return {
			code: "PLACEHOLDER_ACTOR",
			severity: "error",
			explanation: `L'écriture-vérité est attribuée à un placeholder (« ${a.identity} ») et non à un humain réel : toute Idea/ChangeSet enregistre l'humain agissant comme provenance — jamais un placeholder (ROADMAP S63).`,
			howToFix: [
				"Authentifiez-vous (S61) et agissez sous une identité réelle (accounts.users.id).",
				"La provenance doit nommer l'humain : identité résolue + nom affiché, jamais « system »/« agent »/« tbd ».",
			],
		};
	}
	return null;
}

/**
 * decideProposal — the S63 gate (mirrors Go DecideProposal). Requires a real actor, grounds
 * the granted roles in the member, runs the S16 admission precedence (veto dominates → no
 * approver ⇒ INSUFFICIENT_AUTHORITY → all approvers ⇒ admitted → partial ⇒ escalated).
 */
export function decideProposal(
	g: AuthorityGraph,
	actor: RealActor,
	memberRole: MemberRole | null,
	bindings: AuthorityRoleBinding[],
): ProposalDecision {
	const ph = requireRealActor(actor);
	if (ph)
		return { decision: "blocked", actor, grantedRoles: [], blockReason: ph };

	const granted = resolveGrantedRoles(memberRole, g.domain, bindings);
	const grantedSet = new Set(granted);

	// 1. veto dominates
	for (const v of g.veto ?? []) {
		if (grantedSet.has(v)) {
			return {
				decision: "blocked",
				actor,
				grantedRoles: granted,
				blockReason: {
					code: "VETOED",
					severity: "blocking",
					explanation: `L'admission est opposée par un veto (« ${v} ») : un veto bloque quel que soit le nombre d'approbateurs (KRD §13.8 — veto domine).`,
					howToFix: ["resolve_veto", `obtain_clearance_from:${v}`, "escalate"],
				},
			};
		}
	}

	const grantedApprovers = g.approvers.filter((a) => grantedSet.has(a)).length;

	// 2. no approver at all ⇒ INSUFFICIENT_AUTHORITY (the done-criterion)
	if (grantedApprovers === 0) {
		return {
			decision: "blocked",
			actor,
			grantedRoles: granted,
			blockReason: insufficientAuthorityReason(actor, g.domain),
		};
	}
	// 3. all approvers ⇒ admitted
	if (grantedApprovers === g.approvers.length) {
		return { decision: "admitted", actor, grantedRoles: granted };
	}
	// 4. partial ⇒ escalated
	return { decision: "escalated", actor, grantedRoles: granted };
}

function insufficientAuthorityReason(
	actor: RealActor,
	domain: string,
): BlockReason {
	return {
		code: "INSUFFICIENT_AUTHORITY",
		severity: "blocking",
		explanation: `La proposition d'écriture-vérité exige l'approbation d'un user détenant l'autorité du sous-graphe (domaine « ${domain} », AuthorityGraph KRD §13.8), mais l'humain agissant (« ${actor.display} ») ne détient AUCUN des rôles d'autorité requis pour ce scope.`,
		howToFix: [
			"Faites approuver la proposition par un user détenant l'autorité du scope (un binding member-role × domaine → rôle d'autorité).",
			"Ou demandez à un owner un rôle d'adhésion qui octroie l'autorité requise (AuthorityRoleBinding déclaré).",
			"Un override est possible mais reste une décision ENREGISTRÉE (ChangeSet + ADR + provenance), jamais un contournement silencieux.",
		],
	};
}

/** Override — a recorded decision (ChangeSet + ADR + provenance), never a silent bypass. */
export interface Override {
	overriddenCode: BlockCode;
	changeSetRef: string;
	adrRef: string;
	actor: RealActor;
	reason: string;
}

export interface OverrideResult {
	ok: boolean;
	blockReason?: BlockReason;
}

/**
 * validateOverride — an override REQUIRES a real actor + a ChangeSet ref + an ADR ref + a
 * reason (CLAUDE.md §8). Missing any ⇒ OVERRIDE_NOT_RECORDED; placeholder actor ⇒
 * PLACEHOLDER_ACTOR. Mirrors Go NewOverride's pre-flight (the content-address is computed
 * server-side / in Go; this twin gates the recording).
 */
export function validateOverride(o: Override): OverrideResult {
	const ph = requireRealActor(o.actor);
	if (ph) return { ok: false, blockReason: ph };
	const missing: string[] = [];
	if (o.changeSetRef.trim() === "") missing.push("changeset_ref");
	if (o.adrRef.trim() === "") missing.push("adr_ref");
	if (o.reason.trim() === "") missing.push("reason");
	if (missing.length > 0) {
		return {
			ok: false,
			blockReason: {
				code: "OVERRIDE_NOT_RECORDED",
				severity: "error",
				explanation: `Un override n'est pas une édition, c'est une décision ENREGISTRÉE (CLAUDE.md §8) : il exige un ChangeSet, un ADR et une provenance d'acteur réel. Champs manquants : ${missing.join(", ")}.`,
				howToFix: [
					"Ouvrez un ChangeSet pour porter l'override (transaction append-only, jamais une écriture en place).",
					"Rédigez l'ADR qui enregistre le POURQUOI de l'override.",
					"Attribuez l'override à un humain réel (provenance), jamais à un placeholder.",
				],
			},
		};
	}
	return { ok: true };
}

/** toProvenanceDetail — attributes the intent to the named human (never a placeholder). */
export function toProvenanceDetail(a: RealActor, intent: string): string {
	const head = `${a.display.trim()} <${a.identity.trim()}>`;
	const i = intent.trim();
	return i === "" ? head : `${head}: ${i}`;
}
