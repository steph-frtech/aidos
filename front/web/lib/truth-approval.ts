/**
 * truth-approval.ts — the deterministic TS twin of back/kernel/truthapproval (S110).
 *
 * THE STEP (ROADMAP S110): "Flux d'approbation multi-humains scopés + gestion de concurrence
 * (niveau vérité)". EVERY truth-write via the cockpit passes `propose → ChangeSet → approval`
 * gated by the bound AuthorityGraph (approver/veto/escalation, S63) at the right TruthScope, with
 * CONTENT-ADDRESSED optimistic-lock concurrency control on the kernel head: two concurrent applies
 * onto the same head → the FIRST lands, the SECOND is REFUSED (stale_head), NEVER last-write-wins
 * (anti-overwrite §9). An override of a block is a RECORDED decision (provenance + ADR, KRD §8).
 *
 * THE TWIN (no drift): this module mirrors the Go engine — the SAME gate (veto dominates / no
 * approval blocks / partial escalates / all admits), the SAME two-phase apply (gate ∧ fresh head),
 * the SAME at-most-one-lands batch. The reproducibility mirror lib/truth-approval.test.ts
 * (Vitest + fast-check) pins determinism, the wall, and the anti-overwrite anchor.
 *
 * THE WALL (CLAUDE.md §2): every function is PURE — the judge is the deterministic gate + the
 * content-addressed head, never an LLM. This module DECIDES admission and RETURNS the envelope the
 * aidos CLI (the only truth-writer) would apply; it writes NOTHING.
 */

/** A cockpit member acting through the screen — the provenance subject (KRD §8). */
export type Actor = string;

/** An authority role (twin of authority.Role). */
export type Role = string;

/** The bound AuthorityGraph (twin of authority.AuthorityGraph). */
export interface AuthorityGraph {
	domain: string;
	truthKind: string;
	approvers: Role[];
	veto?: Role[];
	escalation?: Role[];
}

/** One plane's change carried by the envelope (twin of changeset.Delta). */
export interface Delta {
	kind: string;
	target: string;
	body?: string;
}

/** A cockpit truth-write request before the gate (twin of truthapproval.Proposal). */
export interface Proposal {
	actor: Actor;
	domain: string;
	truthKind: string;
	/** the kernel head the proposer observed — the optimistic-lock token. */
	head: string;
	granted: Role[];
	label: string;
	spec?: Delta;
	mirror?: Delta;
}

/** A proposal's admission outcome — the CLOSED set of four (twin of truthapproval.Outcome). */
export type Outcome = "applied" | "blocked" | "escalated" | "stale_head";

/** The four outcomes in canonical order. */
export const OUTCOMES: readonly Outcome[] = [
	"applied",
	"blocked",
	"escalated",
	"stale_head",
];

/** A recorded override (KRD §8) — never a silent bypass. */
export interface OverrideRecord {
	by: Actor;
	reason: string;
	adr: string;
}

/** Reports whether an override is fully recorded (actor + reason + ADR). */
export function isRecorded(o: OverrideRecord | undefined): o is OverrideRecord {
	return !!o && o.by !== "" && o.reason !== "" && o.adr !== "";
}

/** The gate's admission decision (twin of authority.AdmissionDecision, minimal). */
export type Admission = "admitted" | "blocked" | "escalated";

/** A recorded verdict of one Propose/Approve (twin of truthapproval.Decision). */
export interface Decision {
	actor: Actor;
	outcome: Outcome;
	admission: Admission;
	blockCode?: string;
	/** the resulting envelope id (content-addressed); set when applied. */
	envelopeId: string;
	envelopeStatus: "DRAFT" | "APPLIED";
	newHead?: string;
	/** the live head a stale proposal lost to — re-run the mirrors against it (merge-semantic). */
	staleAgainst?: string;
	override?: OverrideRecord;
}

function has(xs: Role[] | undefined, x: Role): boolean {
	return (xs ?? []).includes(x);
}

/**
 * decide is the pure AuthorityGraph gate (twin of authority.Decide). Precedence (ADR 0016):
 *   1. veto dominates → blocked/VETOED;
 *   2. no approver granted → blocked/MISSING_AUTHORITY_APPROVAL;
 *   3. all approvers → admitted;
 *   4. partial → escalated.
 */
export function decide(
	g: AuthorityGraph,
	granted: Role[],
): { admission: Admission; blockCode?: string } {
	for (const v of g.veto ?? []) {
		if (has(granted, v)) return { admission: "blocked", blockCode: "VETOED" };
	}
	const got = g.approvers.filter((a) => has(granted, a)).length;
	if (got === 0)
		return { admission: "blocked", blockCode: "MISSING_AUTHORITY_APPROVAL" };
	if (got === g.approvers.length) return { admission: "admitted" };
	return { admission: "escalated" };
}

/**
 * envelopeId is the content-address of the DRAFT envelope (a stable, deterministic hash of the
 * canonical body: label + head + spec + mirror). It is NOT cryptographic-grade here (the Go side
 * owns the SHA-256 truth); the twin needs only a deterministic, collision-resistant-enough id so
 * that two DISTINCT envelopes (different labels/targets) get distinct ids and the same envelope is
 * stable. A pure FNV-1a over the canonical JSON.
 */
export function envelopeId(p: Proposal): string {
	const body = JSON.stringify({
		label: p.label,
		parent: p.head,
		spec: p.spec ?? null,
		mirror: p.mirror ?? null,
	});
	let h = 0x811c9dc5;
	for (let i = 0; i < body.length; i++) {
		h ^= body.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return `cs_${h.toString(16).padStart(8, "0")}`;
}

/** A spec without a mirror is a monster — the completeness gate (KRD §98) refuses it. */
function completenessHolds(p: Proposal): boolean {
	return !(p.spec && !p.mirror);
}

/**
 * propose builds the DRAFT envelope and runs the gate WITHOUT moving the head (a propose never
 * writes truth). Twin of truthapproval.Propose.
 */
export function propose(g: AuthorityGraph, p: Proposal): Decision {
	const a = decide(g, p.granted);
	const id = envelopeId(p);
	let outcome: Outcome;
	if (a.admission === "blocked") outcome = "blocked";
	else if (a.admission === "escalated") outcome = "escalated";
	else outcome = "applied"; // admitted DRAFT, ready for approve (head-check happens there)
	return {
		actor: p.actor,
		outcome,
		admission: a.admission,
		blockCode: a.blockCode,
		envelopeId: id,
		envelopeStatus: "DRAFT",
	};
}

/**
 * approve is the two-phase truth-write: the AuthorityGraph gate AND the content-addressed
 * optimistic lock on the live head. Admitted (or a recorded override) AND a FRESH head ⇒ applied,
 * head moves; a moved head ⇒ stale_head (NEVER last-write-wins). Twin of truthapproval.Approve.
 */
export function approve(
	g: AuthorityGraph,
	p: Proposal,
	liveHead: string,
	override?: OverrideRecord,
): Decision {
	const d = propose(g, p);
	if (d.outcome === "blocked" || d.outcome === "escalated") {
		if (isRecorded(override)) {
			d.override = override;
			d.admission = "admitted";
			d.blockCode = undefined;
			d.outcome = "applied"; // tentatively admitted; head-check below may flip to stale
		} else {
			return d; // block/escalation stands, head unmoved
		}
	}
	// Admitted ⇒ the optimistic lock on the content-addressed head.
	if (p.head !== liveHead) {
		d.outcome = "stale_head";
		d.staleAgainst = liveHead;
		d.newHead = undefined;
		return d; // REFUSED — never last-write-wins (anti-overwrite §9)
	}
	// Completeness gate (KRD §98): a spec without a mirror is a monster.
	if (!completenessHolds(p)) {
		d.outcome = "blocked";
		d.admission = "blocked";
		d.blockCode = "INCOMPLETE_CHANGESET";
		return d;
	}
	d.envelopeStatus = "APPLIED";
	d.newHead = d.envelopeId; // the new head is the content address of the applied envelope
	d.outcome = "applied";
	return d;
}

/**
 * applyConcurrent runs a batch of proposals that all observed the SAME start head, in submitted
 * order against a MOVING live head: the first admitted+fresh apply moves the head; every later
 * same-head proposal is refused stale_head. At most ONE lands. Twin of truthapproval.ApplyConcurrent.
 */
export function applyConcurrent(
	g: AuthorityGraph,
	startHead: string,
	proposals: Proposal[],
): Decision[] {
	let head = startHead;
	const out: Decision[] = [];
	for (const p of proposals) {
		const d = approve(g, p, head);
		if (d.outcome === "applied" && d.newHead) head = d.newHead;
		out.push(d);
	}
	return out;
}

/** appliedCount — for same-head same-target proposals this is ≤ 1 (anti-overwrite §9). */
export function appliedCount(decisions: Decision[]): number {
	return decisions.filter((d) => d.outcome === "applied").length;
}

/** staleProposals — the actors who must re-run their mirrors against the new head (S25). */
export function staleProposals(decisions: Decision[]): Actor[] {
	return decisions
		.filter((d) => d.outcome === "stale_head")
		.map((d) => d.actor);
}

/** A "who wanted what" provenance entry (KRD §8). */
export interface ProvenanceEntry {
	actor: Actor;
	outcome: Outcome;
	overridden: boolean;
}

/** provenance — sorted (actor, outcome) records, so the history is replayable. */
export function provenance(decisions: Decision[]): ProvenanceEntry[] {
	return decisions
		.map((d) => ({
			actor: d.actor,
			outcome: d.outcome,
			overridden: !!d.override,
		}))
		.sort((a, b) =>
			a.actor !== b.actor
				? a.actor < b.actor
					? -1
					: 1
				: a.outcome < b.outcome
					? -1
					: a.outcome > b.outcome
						? 1
						: 0,
		);
}
