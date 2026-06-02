/**
 * The AuthorityGraph projection — the Workbench /authorities source (AIDOS step S16).
 *
 * KRD §13.8 (AuthorityGraph — "remplacer « l'humain » par une autorité explicite"): an
 * AuthorityGraph is ONE of the four truth QUALIFIERS (KRD §13.6: truth_kind / TruthScope /
 * VerifiabilityLevel / AuthorityGraph) — it qualifies a Kernel truth, it is NOT a truth
 * itself. It binds a {domain, truth_kind} to named authorities (approvers / veto /
 * escalation) and answers WHO approves / vetoes / escalates a truth's admission. The rule:
 * "toute vérité above-the-line doit avoir un propriétaire d'autorité explicite."
 *
 * This module is the DECLARED projection of the Go package back/kernel/authority — the same
 * §13.8 shape, the same precedence (ADR 0016: veto dominates; no approver ⇒
 * blocked/MISSING_AUTHORITY_APPROVAL; all approvers ⇒ admitted; partial ⇒ escalated) — so
 * the /authorities panel decides exactly as the Go decider decides. One source, no drift.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng,
 * no I/O — so the same {graph, truth, granted} always yields the same decision. The
 * reproducibility mirror lib/authority.test.ts (fast-check) pins the four admission cases,
 * veto-dominance, no-admission-without-authority, totality, and determinism.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness): /authorities renders the decider's verdict over
 * the graph + candidate admission rows; it never writes truth (the wall). Truth-writes (and
 * any reauthorize) go via propose → ChangeSet → approval (SemanticDiff change_type
 * `reauthorize`, KRD §44.1), never from this screen.
 */

/** The seven KRD §13.4 epistemic truth kinds (the kinds a graph may key on). */
export const TRUTH_KINDS = [
	"behavioral",
	"structural",
	"experiential",
	"economic",
	"regulatory",
	"statistical",
	"exploratory",
] as const;
export type TruthKind = (typeof TRUTH_KINDS)[number];

/** A named authority role (KRD §13.8). The set is OPEN — an org names its own roles. */
export type Role = string;

/** The KRD §13.8 AuthorityGraph: a {domain, truth_kind} bound to three role lists. */
export interface AuthorityGraph {
	domain: string;
	truthKind: string;
	approvers: Role[];
	veto: Role[];
	escalation: Role[];
}

/** The minimal projection of a truth the decider keys on (mirrors authority.Truth). */
export interface Truth {
	domain: string;
	truthKind: string;
}

/** The admission verdict — exactly one of three (KRD §13.8). */
export type Decision = "admitted" | "blocked" | "escalated";

/** The S16-local refusal codes carried by a blocked decision (mirrors authority.BlockCode). */
export const CODE_MISSING_AUTHORITY_APPROVAL = "MISSING_AUTHORITY_APPROVAL";
export const CODE_VETOED = "VETOED";

/** The actionable refusal (KRD §44.5) carried by a blocked decision. */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The decider's verdict (mirrors authority.AdmissionDecision). */
export interface AdmissionDecision {
	decision: Decision;
	blockReason?: BlockReason;
	escalatedTo?: Role[];
}

/** isKnownTruthKind — one of the seven KRD §13.4 kinds (mirrors authority.IsKnownTruthKind). */
export function isKnownTruthKind(k: string): k is TruthKind {
	return (TRUTH_KINDS as readonly string[]).includes(k);
}

function has(roles: Role[], r: Role): boolean {
	return roles.includes(r);
}

function missingApprovalReason(): BlockReason {
	return {
		code: CODE_MISSING_AUTHORITY_APPROVAL,
		severity: "blocking",
		explanation:
			"La vérité n'a obtenu aucune approbation requise : nul ne peut l'admettre sans le détenteur d'autorité du sous-graphe (AuthorityGraph, KRD §13.8). Une vérité réglementaire sans approbation juridique est bloquée.",
		howToFix: ["assign_authority", "obtain_legal_approval"],
	};
}

function vetoedReason(by: Role): BlockReason {
	return {
		code: CODE_VETOED,
		severity: "blocking",
		explanation: `L'admission est opposée par un veto ("${by}") : un veto bloque quel que soit le nombre d'approbateurs (KRD §13.8 — veto domine). Le veto n'est jamais contourné.`,
		howToFix: ["resolve_veto", `obtain_clearance_from:${by}`, "escalate"],
	};
}

/**
 * decide — the pure admission verdict of KRD §13.8, mirroring authority.Decide. Precedence
 * (ADR 0016, first match wins):
 *   1. veto dominates: any granted veto role ⇒ blocked / VETOED;
 *   2. no approver granted ⇒ blocked / MISSING_AUTHORITY_APPROVAL (the done case);
 *   3. all required approvers present ⇒ admitted;
 *   4. partial approval (≥1 but not all), no veto ⇒ escalated (to graph.escalation).
 * Total + deterministic.
 */
export function decide(
	graph: AuthorityGraph,
	_truth: Truth,
	granted: Role[],
): AdmissionDecision {
	for (const v of graph.veto) {
		if (has(granted, v)) {
			return { decision: "blocked", blockReason: vetoedReason(v) };
		}
	}
	const grantedApprovers = graph.approvers.filter((a) =>
		has(granted, a),
	).length;
	if (grantedApprovers === 0) {
		return { decision: "blocked", blockReason: missingApprovalReason() };
	}
	if (grantedApprovers === graph.approvers.length) {
		return { decision: "admitted" };
	}
	return { decision: "escalated", escalatedTo: [...graph.escalation] };
}

/**
 * validate — the pure shape guard (mirrors authority.Validate): domain non-empty; truth_kind
 * in the §13.4 enum; approvers non-empty; no role in both approvers and veto. Returns a
 * non-empty error string when invalid, or "" when valid.
 */
export function validate(graph: AuthorityGraph): string {
	if (graph.domain === "") return "graph has no domain";
	if (!isKnownTruthKind(graph.truthKind))
		return `unknown truth_kind: ${graph.truthKind}`;
	if (graph.approvers.length === 0)
		return "graph has no approvers (could never admit)";
	for (const a of graph.approvers) {
		if (has(graph.veto, a))
			return `a role appears in both approvers and veto: ${a}`;
	}
	return "";
}
