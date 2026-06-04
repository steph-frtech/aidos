/**
 * agentloop-incident-to-idea — BA31 front twin of back/runtime/agentloop's RunToDraft on-ramp and
 * provenance-verified ApplyGate (gap J1). The Go package is the AUTHORITY (the pure pipeline +
 * apply gate); this twin REPLICATES the same deterministic behaviour so the Workbench « Learnings »
 * subsection can show, WITHOUT a backend round-trip, "this failed/hollow run becomes a DRAFT idea
 * (proposed, never applied)" and "a forged Status:'admitted' is refused".
 *
 * THE WALL. This twin declares NO truth and APPLIES nothing. runToDraft yields a DRAFT idea
 * (status=draft, provenance incident:<pattern>) with the always-present REALITY_CANNOT_DECLARE_TRUTH
 * refusal (the direct edge Incident→Kernel is ALWAYS refused) and wroteKernel=false. The only legal
 * door stays idea → mirror → /goal → approval. applyGate RE-DERIVES the admission verdict from the
 * S16 authority graph (authority.decide) — it NEVER trusts the proposal's self-asserted status: a
 * forged "admitted" with no admitting record is refused PROPOSAL_NOT_ADMITTED, fail-closed.
 *
 * DETERMINISM-FIRST. A pipe over the runToSignal classifier + reality.learn + authority.decide —
 * code, never an LLM "decide if this run becomes an idea / is admitted" agent. Pure, total,
 * deterministic (same run/thresholds/graph/grants ⇒ same result), no I/O, no Date.now(), no
 * Math.random(). The reproducibility mirror (agentloop-incident-to-idea.test.ts) pins it.
 */

import {
	DEFAULT_THRESHOLDS,
	type PatternSignal,
	runToSignal,
	type SignalThresholds,
} from "./agentloop-runtosignal";
import type { AgentRun } from "./agentrun";
import {
	type AdmissionDecision,
	type AuthorityGraph,
	decide,
	type Role,
} from "./authority";
import {
	type BlockReason,
	learn,
	REALITY_CANNOT_DECLARE_TRUTH,
} from "./reality";

/** The DRAFT a failed/hollow run sketches (twin of agentloop.DraftFromRun). A VALUE — writes nothing. */
export interface DraftFromRun {
	/** false for an ordinary green run (no idea invented). */
	signalled: boolean;
	/** The BA30 gateway result (null when not signalled). */
	pattern: PatternSignal | null;
	/** The recurring incident reference — the PATTERN key (identity-by-pattern, gap I2). Empty when not signalled. */
	incidentRef: string;
	/** The DRAFT idea's status — always "draft" when signalled. */
	ideaStatus: "" | "draft";
	/** The idea provenance source/detail (incident:<pattern>). */
	provenanceSource: "" | "incident";
	provenanceDetail: string;
	/** The cause-sketch HYPOTHESIS carried into the idea (never a truth). */
	causeSketch: string;
	/** Whether proposes was pinned; when false, openQuestion carries the honest note. */
	proposesPinned: boolean;
	openQuestion?: string;
	/** ALWAYS false — the on-ramp performs no kernel write. */
	wroteKernel: false;
	/** The re-asserted refusal of the direct edge Incident→Kernel — present whenever signalled. */
	toKernelRefusal: BlockReason | null;
}

/**
 * runToDraft — the on-ramp (twin of agentloop.RunToDraft). It runs the BA30 gateway; for a
 * signalled run it learns the signal into a DRAFT idea and re-asserts the wall (the direct edge is
 * always refused). An ordinary green run yields an unsignalled draft (no idea invented). PURE,
 * TOTAL. The incident reference is the PATTERN key, so two distinct runs of the same failure mode
 * collapse to ONE recurring incident.
 */
export function runToDraft(
	run: AgentRun,
	th: SignalThresholds = DEFAULT_THRESHOLDS,
): DraftFromRun {
	const [ps, ok] = runToSignal(run, th);
	if (!ok || ps === null) {
		return {
			signalled: false,
			pattern: null,
			incidentRef: "",
			ideaStatus: "",
			provenanceSource: "",
			provenanceDetail: "",
			causeSketch: "",
			proposesPinned: false,
			wroteKernel: false,
			toKernelRefusal: null,
		};
	}
	// The incident is built ENTIRELY from the pattern (identity-by-pattern, gap I2): the ref IS the
	// pattern key, so two distinct runs of the same mode share it and Recurrence climbs.
	const cand = learn({
		id: ps.pattern,
		ref: ps.pattern,
		signal: ps.signal,
		causeSketch: ps.causeSketch,
		taint: ["incident_derived"],
		linkedBranches: [],
	});
	return {
		signalled: true,
		pattern: ps,
		incidentRef: ps.pattern,
		ideaStatus: "draft",
		provenanceSource: "incident",
		provenanceDetail: cand.provenanceDetail,
		causeSketch: cand.intent,
		proposesPinned: cand.proposesPinned,
		openQuestion: cand.openQuestion,
		wroteKernel: false,
		toKernelRefusal: REALITY_CANNOT_DECLARE_TRUTH,
	};
}

/** A classified Learnings row: the run, its draft, and the recurring incident ref. */
export interface LearningEntry {
	run: AgentRun;
	draft: DraftFromRun;
}

/** A grouped Learnings view: per-pattern recurrence (the identity-by-pattern proof). */
export interface LearningView {
	entries: LearningEntry[];
	/** incident ref (pattern) → count of runs that collapse to it (Recurrence climbs when > 1). */
	patternRecurrence: Record<string, number>;
}

/**
 * runsToLearnings — drive a list of runs to their DRAFT ideas (stable input order) plus the
 * per-pattern recurrence count. Two distinct runs of the same pattern push the count past 1 — the
 * identity-by-pattern proof (a recurring "harden-the-harness" idea). PURE, TOTAL.
 */
export function runsToLearnings(
	runs: AgentRun[],
	th: SignalThresholds = DEFAULT_THRESHOLDS,
): LearningView {
	const entries: LearningEntry[] = [];
	const patternRecurrence: Record<string, number> = {};
	for (const r of runs) {
		const draft = runToDraft(r, th);
		entries.push({ run: r, draft });
		if (draft.signalled) {
			patternRecurrence[draft.incidentRef] =
				(patternRecurrence[draft.incidentRef] ?? 0) + 1;
		}
	}
	return { entries, patternRecurrence };
}

// ── the provenance-verified apply gate (gap J1) ──

/** The PROPOSAL_NOT_ADMITTED refusal (twin of blockreason.For, FR) — the BA31 apply-gate door. */
export const PROPOSAL_NOT_ADMITTED: BlockReason = {
	code: "PROPOSAL_NOT_ADMITTED",
	severity: "blocking",
	explanation:
		"Refus de la porte d'apply BA31 : une Proposal dont le champ Status affiche « admitted » mais SANS enregistrement d'autorité S16 correspondant qui l'admette réellement. L'apply ne fait JAMAIS confiance au champ auto-déclaré — il RE-DÉRIVE le verdict d'admission depuis le graphe d'autorité + les rôles réellement accordés, et n'admet que si authority.Decide renvoie « admitted ». Un « admitted » forgé sans autorité admettante est refusé, fail-closed — le mur tient (l'on-ramp réalité PROPOSE une idée DRAFT ; il n'applique jamais une vérité).",
	howToFix: [
		"obtain_a_real_admission : faites passer la proposition par S16 — l'autorité (approbateurs requis, aucun veto) doit réellement l'admettre.",
		"propose_only_path : l'on-ramp réalité ne produit qu'une idée DRAFT ; pour la figer, écrivez son miroir au /goal puis obtenez l'approbation.",
		"rerun aidos check : le blocage se lève dès qu'un enregistrement d'autorité S16 admet réellement la proposition (le champ Status n'est jamais cru).",
	],
};

/** The apply-path proposal an agent loop builds FREELY (twin of agentloop.Proposal). */
export interface Proposal {
	domain: string;
	truthKind: string;
	/** SELF-ASSERTED status — NEVER trusted by applyGate ("proposed" | "admitted"). */
	status: string;
	ideaId?: string;
}

/** ApplyGate's verdict (twin of agentloop.ApplyDecision). */
export interface ApplyDecision {
	/** The RE-DERIVED verdict (from the authority graph), never the self-asserted field. */
	admitted: boolean;
	/** The actionable refusal when not admitted (PROPOSAL_NOT_ADMITTED), else null. */
	refusal: BlockReason | null;
}

/**
 * applyGate — the provenance-verified apply seam (twin of agentloop.ApplyGate, gap J1). It NEVER
 * reads the proposal's self-asserted status. It RE-DERIVES the admission verdict from the S16
 * authority graph + the roles actually granted (authority.decide), admitting ONLY when the verdict
 * is "admitted". A forged "admitted" with no admitting record is refused PROPOSAL_NOT_ADMITTED,
 * fail-closed. PURE, TOTAL.
 */
export function applyGate(
	graph: AuthorityGraph,
	_prop: Proposal,
	granted: Role[],
): ApplyDecision {
	const dec: AdmissionDecision = decide(
		graph,
		{ domain: graph.domain, truthKind: graph.truthKind },
		granted,
	);
	if (dec.decision === "admitted") {
		return { admitted: true, refusal: null };
	}
	return { admitted: false, refusal: PROPOSAL_NOT_ADMITTED };
}
