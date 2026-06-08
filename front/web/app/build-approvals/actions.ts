"use server";

import {
	type AdmissionDecision,
	type AgentTruthProposal,
	type AuthorityRoleBinding,
	decide,
	type MemberRole,
	proposeTruth,
} from "@/lib/build-approval";

/**
 * Server Actions for the /build-approvals Workbench panel (S85 — vérité proposée par l'agent
 * gatée au mur + approbation humaine UI).
 *
 * THE STEP (ROADMAP S85): when the build loop's work implies a TRUTH, it PROPOSES a ChangeSet
 * (proposed, NEVER admitted); a HUMAN holding the scope's authority (S52 + S63) approves it from
 * the inbox; only THEN does the truth land. Two done-criteria: (1) an agent DIRECT write above the
 * waterline is refused AGENT_WRITE_ABOVE_WATERLINE — the propose door is the only legal path; (2) a
 * proposed truth requires human approval before it lands (admitted ONLY on a real human holding the
 * scope authority; INSUFFICIENT_AUTHORITY / PLACEHOLDER_ACTOR otherwise).
 *
 * THE ACTION-CAPABLE OPS (ui-completeness, CLAUDE.md §7): this screen develops TWO ops, each with a
 * control bound to it and executable from the screen:
 *   - proposeTruthAction — propose a truth the loop's work implied → a `proposed` ChangeSet (or the
 *     wall refusal when a below-the-line / mirror-less truth is given).
 *   - approveProposalAction — the human-approval gate: admit ONLY a real human holding the scope's
 *     authority, else refuse and keep the proposal proposed.
 * Both are PURE FUNCTIONS (the deterministic twins in @/lib/build-approval, byte-identical to
 * back/runtime/buildloop/approval) — never an LLM judgment.
 *
 * THE WALL (CLAUDE.md §2): these actions write NOTHING above the line. A truth is PROPOSED and a
 * human ADMITS via the authority graph; the kernel write stays the aidos CLI through /goal once a
 * human admits. The actions return the proposal / decision as VALUES.
 */

const checkoutBindings: AuthorityRoleBinding[] = [
	{ domain: "checkout", minProjectRole: "owner", roles: ["product_owner"] },
];

export interface ProposeActionResult {
	ok: boolean;
	/** the `proposed` proposal when it succeeded. */
	proposal?: AgentTruthProposal;
	/** the wall/monster refusal code + explanation when it failed. */
	blockCode?: string;
	blockExplanation?: string;
}

/**
 * proposeTruthAction — the control behind « Proposer la vérité » (ui-completeness §7). The human
 * describes the truth a green build implied (its kernel target, domain, kind, the green mirror that
 * proves it) and submits — the action PROPOSES it as a `proposed` ChangeSet (never admitted). A
 * below-the-line target is refused NOT_A_TRUTH_WRITE (the propose door is for truths only); a
 * truth with no mirror is refused MISSING_MIRROR (a monster). The wall holds — there is no
 * truth-write here, only a proposal.
 */
export async function proposeTruthAction(
	_prev: ProposeActionResult,
	formData: FormData,
): Promise<ProposeActionResult> {
	const agentId = String(
		formData.get("agent_id") ?? "buildloop-agent-v1",
	).trim();
	const project = String(formData.get("project") ?? "").trim();
	const target = String(formData.get("target") ?? "").trim();
	const domain = String(formData.get("domain") ?? "").trim();
	const truthKind = String(formData.get("truth_kind") ?? "").trim();
	const mirror = String(formData.get("mirror") ?? "").trim();
	const agentRun = String(formData.get("agent_run") ?? "").trim();

	const r = proposeTruth(agentId, project, agentRun, {
		target,
		domain,
		truthKind,
		mirror,
	});
	if (!r.ok) {
		return {
			ok: false,
			blockCode: r.block.code,
			blockExplanation: r.block.explanation,
		};
	}
	return { ok: true, proposal: r.proposal };
}

export interface ApproveActionResult {
	ok: boolean;
	decision?: AdmissionDecision;
	/** the proposal id the decision applies to (so the client transitions the right row). */
	proposalId?: string;
	blockCode?: string;
	blockExplanation?: string;
}

/**
 * approveProposalAction — the control behind « Approuver » (ui-completeness §7). A human acts under
 * a real identity + a project membership role; the action runs the S63 human-approval gate over the
 * scope's authority graph (the checkout demo scope requires a product_owner approver, granted to an
 * OWNER via the declared binding). It ADMITS only when the real human holds the scope authority;
 * otherwise it refuses (INSUFFICIENT_AUTHORITY / PLACEHOLDER_ACTOR) and the proposal stays proposed.
 * The verdict is re-derived from the authority graph — never the proposal's self-asserted status.
 */
export async function approveProposalAction(
	_prev: ApproveActionResult,
	formData: FormData,
): Promise<ApproveActionResult> {
	const proposalId = String(formData.get("proposal_id") ?? "").trim();
	const domain = String(formData.get("domain") ?? "checkout").trim();
	const actorIdentity = String(formData.get("actor_identity") ?? "").trim();
	const actorDisplay = String(formData.get("actor_display") ?? "").trim();
	const memberRole = String(formData.get("member_role") ?? "") as
		| MemberRole
		| "";

	const d = decide(
		domain,
		["product_owner"],
		{ identity: actorIdentity, display: actorDisplay },
		memberRole,
		checkoutBindings,
	);

	const res: ApproveActionResult = { ok: true, decision: d, proposalId };
	if (d.block) {
		res.blockCode = d.block.code;
		res.blockExplanation = d.block.explanation;
	}
	return res;
}
