/**
 * build-approval.ts — the deterministic TS twin of back/runtime/buildloop/approval (S85).
 *
 * THE STEP (ROADMAP S85): "vérité proposée par l'agent gatée au mur + approbation humaine UI".
 * When the build-loop's work implies a TRUTH, it PROPOSES a ChangeSet (proposed, NEVER admitted);
 * a HUMAN holding the scope's authority (S52 + S63) approves it from the inbox; only THEN does the
 * truth land. The two done-criteria:
 *
 *   1. An agent DIRECT write above the waterline is refused AGENT_WRITE_ABOVE_WATERLINE (the wall).
 *   2. A proposed truth requires HUMAN approval before it lands (admitted ONLY on a real human
 *      holding the scope's authority; INSUFFICIENT_AUTHORITY / PLACEHOLDER_ACTOR otherwise).
 *
 * THE TWIN (no drift): this module mirrors the Go authority — the SAME wall classifier (an
 * above-waterline target is a truth), the SAME proposed→admitted transition (re-derived from the
 * authority verdict, never the self-asserted status), the SAME inbox projection. The
 * reproducibility mirror lib/build-approval.test.ts (fast-check) pins it.
 *
 * THE WALL (CLAUDE.md §2): every function is PURE — the judge is the deterministic wall + the
 * authority graph, never an LLM. This module writes NOTHING; the kernel write stays the aidos CLI
 * once a human admits.
 */

/** A proposal's CLOSED lifecycle status — exactly two (twin of approval.ProposalStatus). */
export type ProposalStatus = "proposed" | "admitted";

/** A truth a build-loop turn implies (twin of approval.TruthWrite). */
export interface TruthWrite {
	/** the write target; an above-waterline target (kernel/mirrors/fitness) is a truth. */
	target: string;
	/** the kernel domain (the AuthorityGraph scope, e.g. "checkout"). */
	domain: string;
	/** the epistemic kind (one of the seven KRD §13.4 kinds). */
	truthKind: string;
	/** the mirror that PROVES the truth; empty ⇒ a monster (MISSING_MIRROR). */
	mirror: string;
	/** the content-hash of the green diff that produced the truth. */
	diffHash?: string;
}

/** A build-loop-emitted truth proposal (twin of approval.AgentTruthProposal). */
export interface AgentTruthProposal {
	id: string;
	status: ProposalStatus;
	project: string;
	proposedByAgent: string;
	truth: TruthWrite;
	agentRun?: string;
}

/** A project member role (twin of membership.Role). */
export type MemberRole = "owner" | "editor" | "viewer";

/** A declared authority binding (twin of authoritybinding.AuthorityRoleBinding). */
export interface AuthorityRoleBinding {
	/** the domain this binding awards roles in (empty ⇒ wildcard). */
	domain?: string;
	minProjectRole: MemberRole;
	roles: string[];
}

/** The acting human (twin of authoritybinding.RealActor). */
export interface RealActor {
	identity: string;
	display: string;
}

/** The S85 + S13 refusal codes surfaced by the panel. */
export const CODE_AGENT_WRITE_ABOVE_WATERLINE =
	"AGENT_WRITE_ABOVE_WATERLINE" as const;
export const CODE_MISSING_MIRROR = "MISSING_MIRROR" as const;
export const CODE_NOT_A_TRUTH_WRITE = "NOT_A_TRUTH_WRITE" as const;
export const CODE_INSUFFICIENT_AUTHORITY = "INSUFFICIENT_AUTHORITY" as const;
export const CODE_PLACEHOLDER_ACTOR = "PLACEHOLDER_ACTOR" as const;

export type BlockCode =
	| typeof CODE_AGENT_WRITE_ABOVE_WATERLINE
	| typeof CODE_MISSING_MIRROR
	| typeof CODE_NOT_A_TRUTH_WRITE
	| typeof CODE_INSUFFICIENT_AUTHORITY
	| typeof CODE_PLACEHOLDER_ACTOR;

/**
 * isAboveWaterline — the twin of wall.IsAboveWaterline: a target naming a truth zone
 * (kernel / mirrors / fitness), as a bare schema, a schema-qualified table, or an on-disk path.
 * An above-waterline target is a truth the agent may not write directly.
 */
export function isAboveWaterline(target: string): boolean {
	const t = target.trim().toLowerCase();
	if (t === "") return false;
	const zones = ["kernel", "mirrors", "fitness"];
	for (const z of zones) {
		if (t === z) return true;
		if (t.startsWith(`${z}.`)) return true;
		if (t.startsWith(`${z}/`)) return true;
		if (t.startsWith(`back/${z}/`)) return true;
		if (t.startsWith(`back/${z}.`)) return true;
	}
	return false;
}

/** The placeholder denylist (twin of authoritybinding.placeholderIdentities). */
const PLACEHOLDERS = new Set([
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

/** isPlaceholder — twin of authoritybinding.IsPlaceholder. */
export function isPlaceholder(identity: string): boolean {
	return PLACEHOLDERS.has(identity.trim().toLowerCase());
}

/** Block on a refused propose/decide (the §44.5 shape). */
export interface BlockReason {
	code: BlockCode;
	explanation: string;
}

/** The result of a propose attempt: a proposal or a block. */
export type ProposeResult =
	| { ok: true; proposal: AgentTruthProposal }
	| { ok: false; block: BlockReason };

/**
 * refuseDirectWrite — criterion 1: a DIRECT agent write to an above-waterline target is refused
 * AGENT_WRITE_ABOVE_WATERLINE; a below-the-line target is no truth (undefined). Twin of
 * approval.RefuseDirectWrite.
 */
export function refuseDirectWrite(target: string): BlockReason | undefined {
	if (!isAboveWaterline(target)) return undefined;
	return {
		code: CODE_AGENT_WRITE_ABOVE_WATERLINE,
		explanation:
			"Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness). " +
			"Seul un ChangeSet approuvé écrit la vérité — l'agent PROPOSE, un humain admet.",
	};
}

/**
 * proposeTruth — the PURE propose gate (twin of approval.ProposeTruth). An above-waterline target
 * is a truth → it is PROPOSED (proposed, never admitted), id = a deterministic content address; a
 * below-the-line target is refused NOT_A_TRUTH_WRITE; an empty mirror is refused MISSING_MIRROR.
 */
export function proposeTruth(
	agentId: string,
	project: string,
	agentRun: string,
	tw: TruthWrite,
): ProposeResult {
	if (!isAboveWaterline(tw.target)) {
		return {
			ok: false,
			block: {
				code: CODE_NOT_A_TRUTH_WRITE,
				explanation:
					`La cible « ${tw.target} » ne résout pas au-dessus de la ligne de flottaison : ce n'est pas une vérité. ` +
					"La porte propose→ChangeSet→approbation est réservée aux vraies vérités.",
			},
		};
	}
	if (tw.mirror.trim() === "") {
		return {
			ok: false,
			block: {
				code: CODE_MISSING_MIRROR,
				explanation:
					"La vérité proposée n'a aucun miroir : une vérité sans miroir vivant est un monstre. " +
					"L'inbox ne présente jamais une vérité sans sa preuve.",
			},
		};
	}
	const proposal: AgentTruthProposal = {
		id: contentAddress(project, agentId || "agent", tw, agentRun),
		status: "proposed",
		project: project.trim(),
		proposedByAgent: agentId.trim() || "agent",
		truth: tw,
		agentRun: agentRun.trim() || undefined,
	};
	return { ok: true, proposal };
}

/** contentAddress — a deterministic, stable id over the proposal's TRUTH (not its status). */
function contentAddress(
	project: string,
	agentId: string,
	tw: TruthWrite,
	agentRun: string,
): string {
	const body = JSON.stringify({
		kind: "agent_truth_proposal",
		project: project.trim(),
		proposedByAgent: agentId.trim(),
		truth: {
			target: tw.target,
			domain: tw.domain,
			truthKind: tw.truthKind,
			mirror: tw.mirror,
			diffHash: tw.diffHash ?? "",
		},
		agentRun: agentRun.trim(),
	});
	// FNV-1a 32-bit — a deterministic, dependency-free digest (the panel only needs a stable id).
	let h = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `p-${h.toString(16).padStart(8, "0")}`;
}

/** roleRank — the membership gradient owner ⊃ editor ⊃ viewer (twin of authoritybinding.roleRank). */
function roleRank(r: MemberRole | ""): number {
	switch (r) {
		case "owner":
			return 3;
		case "editor":
			return 2;
		case "viewer":
			return 1;
		default:
			return -1;
	}
}

/**
 * resolveGrantedRoles — twin of authoritybinding.ResolveGrantedRoles: the authority roles a member
 * holds for a domain (the bindings whose domain matches and whose floor the member meets), sorted.
 */
export function resolveGrantedRoles(
	memberRole: MemberRole | "",
	domain: string,
	bindings: readonly AuthorityRoleBinding[],
): string[] {
	if (roleRank(memberRole) < 0) return [];
	const seen = new Set<string>();
	for (const b of bindings) {
		const matches = !b.domain || b.domain === domain;
		if (!matches) continue;
		if (roleRank(memberRole) < roleRank(b.minProjectRole)) continue;
		for (const r of b.roles) if (r.trim() !== "") seen.add(r);
	}
	return [...seen].sort();
}

/** The decision over a proposal (twin of approval.AdmissionDecision). */
export interface AdmissionDecision {
	status: ProposalStatus;
	admitted: boolean;
	grantedRoles: string[];
	block?: BlockReason;
}

/**
 * decide — the PURE human-approval gate (twin of approval.Decide, reusing S63). It RE-DERIVES the
 * verdict from the authority graph + the member's real roles, NEVER the proposal's self-asserted
 * status. Admitted IFF a real human holds ALL the scope's approver roles; INSUFFICIENT_AUTHORITY
 * when the member holds none of an approver; PLACEHOLDER_ACTOR when the actor is not a real human.
 * On any block the proposal STAYS proposed.
 */
export function decide(
	domain: string,
	approvers: readonly string[],
	actor: RealActor,
	memberRole: MemberRole | "",
	bindings: readonly AuthorityRoleBinding[],
): AdmissionDecision {
	if (isPlaceholder(actor.identity) || actor.display.trim() === "") {
		return {
			status: "proposed",
			admitted: false,
			grantedRoles: [],
			block: {
				code: CODE_PLACEHOLDER_ACTOR,
				explanation:
					"L'écriture-vérité est attribuée à un placeholder et non à un humain réel : toute Idea/ChangeSet " +
					"enregistre l'humain agissant comme provenance — jamais un placeholder.",
			},
		};
	}
	const granted = resolveGrantedRoles(memberRole, domain, bindings);
	const grantedSet = new Set(granted);
	// S16 admission: every approver role must be granted (no veto modelled in the panel twin).
	const allGranted =
		approvers.length > 0 && approvers.every((a) => grantedSet.has(a));
	if (allGranted) {
		return { status: "admitted", admitted: true, grantedRoles: granted };
	}
	return {
		status: "proposed",
		admitted: false,
		grantedRoles: granted,
		block: {
			code: CODE_INSUFFICIENT_AUTHORITY,
			explanation:
				`La proposition exige l'approbation d'un user détenant l'autorité du sous-graphe (domaine « ${domain} »), ` +
				`mais « ${actor.display} » ne détient aucun des rôles d'autorité requis. La vérité n'est pas admise.`,
		},
	};
}

/** admitted — apply a decision to a proposal; the id is unchanged (twin of approval.Admitted). */
export function admitted(
	p: AgentTruthProposal,
	d: AdmissionDecision,
): AgentTruthProposal {
	return { ...p, status: d.status };
}

/** The per-project approval inbox (twin of approval.Inbox). */
export interface Inbox {
	project: string;
	pending: AgentTruthProposal[];
}

/**
 * buildInbox — the PURE inbox projection (twin of approval.BuildInbox): exactly the project's
 * `proposed` proposals (admitted = landed, excluded), in stable sorted-by-id order.
 */
export function buildInbox(
	project: string,
	proposals: readonly AgentTruthProposal[],
): Inbox {
	const p = project.trim();
	const pending = proposals
		.filter((x) => x.project.trim() === p && x.status === "proposed")
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	return { project: p, pending };
}
