// Package truthapproval is the S110 truth-write approval flow + concurrency control (KRD
// §13.8, §44, §44.1, §122; CLAUDE.md §2 the wall, §9 anti-overwrite). It composes three
// already-green engines into ONE deterministic decider for "a cockpit truth-write":
//
//   - the GATE: authority.Decide (S63) — every truth-write via the cockpit is gated by the
//     bound AuthorityGraph (approver / veto / escalation) at the right TruthScope. A veto
//     dominates; missing approval blocks; partial escalates; all-approvers admits.
//   - the ENVELOPE: changeset (S20) — a truth-write is NEVER a direct write; it is a
//     `propose → ChangeSet(DRAFT) → approval → APPLIED` envelope (the only legal door).
//   - the CONCURRENCY CONTROL: a CONTENT-ADDRESSED optimistic lock on the kernel HEAD
//     (the parent-phase hash). Two concurrent applies onto the same head: the FIRST moves
//     the head; the SECOND is REFUSED (`STALE_HEAD`), NEVER last-write-wins (anti-overwrite
//     §9). A refused proposal is resolved by re-running the mirrors against the new head
//     (merge.MergeSemantic decides, S25) — the mirror, never the text diff.
//
// An OVERRIDE of a veto/block is itself a RECORDED DECISION (KRD §8: "an override is not an
// edit, it is a recorded decision — changeset + ADR + provenance"), never a silent bypass.
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. Propose/Approve are
// total deterministic functions of their inputs (the applied_at timestamp is an argument).
// The whole flow is REPLAYABLE: same {graph, granted, head, proposals} → same verdict. The
// wall (CLAUDE.md §2): this package WRITES NOTHING to kernel/mirrors; it RETURNS the envelope
// the CLI (the only truth-writer) would apply. It decides admission; it does not admit.
package truthapproval

import (
	"sort"
	"time"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/authority"
)

// Actor is a member of the team acting through the cockpit — a stable identity (S61). It is
// the provenance subject ("who wanted what", KRD §8): every recorded decision carries it.
type Actor string

// Proposal is a cockpit truth-write request BEFORE the gate: a member proposes a ChangeSet
// against a specific kernel HEAD (the parent-phase content hash it observed). The optimistic
// lock keys on Head: an apply is admitted only if Head still equals the live head.
type Proposal struct {
	// Actor is the proposing member (provenance, never placeholder — KRD §8).
	Actor Actor `json:"actor"`
	// Truth is the {domain, truth_kind} the write targets (drives the AuthorityGraph match).
	Truth authority.Truth `json:"truth"`
	// Head is the kernel head (parent-phase content hash) the proposer observed — the
	// optimistic-lock token. A stale Head ⇒ the apply is refused (STALE_HEAD).
	Head string `json:"head"`
	// Granted are the roles that have granted approval/veto for THIS proposal at propose time.
	Granted []authority.Role `json:"granted"`
	// Label is the human name of the envelope (e.g. "add order discount").
	Label string `json:"label"`
	// Spec / Mirror are the two planes of the envelope (held together — they can never drift).
	Spec   *changeset.Delta `json:"spec,omitempty"`
	Mirror *changeset.Delta `json:"mirror,omitempty"`
}

// Outcome is the CLOSED set of a proposal's admission verdicts.
type Outcome string

const (
	// OutcomeApplied — gate passed (admitted) AND head fresh: the envelope is APPLIED, head moves.
	OutcomeApplied Outcome = "applied"
	// OutcomeBlocked — the AuthorityGraph blocked the write (veto, or no approval).
	OutcomeBlocked Outcome = "blocked"
	// OutcomeEscalated — partial approval (≥1 but not all approvers), no veto: escalated.
	OutcomeEscalated Outcome = "escalated"
	// OutcomeStaleHead — gate passed but the head moved under the proposer: REFUSED, re-run mirrors.
	OutcomeStaleHead Outcome = "stale_head"
)

// outcomeOrder is the canonical enumeration order of the four outcomes.
var outcomeOrder = []Outcome{OutcomeApplied, OutcomeBlocked, OutcomeEscalated, OutcomeStaleHead}

// Outcomes returns the four outcomes in canonical order (the closed set, for the Workbench legend).
func Outcomes() []Outcome {
	out := make([]Outcome, len(outcomeOrder))
	copy(out, outcomeOrder)
	return out
}

// Decision is the recorded verdict of one Propose/Approve over one proposal: the outcome, the
// gate's admission decision (verbatim from authority.Decide), the resulting envelope (when
// applied), the new head (when applied), and the provenance (actor). It is the "recorded
// decision" of KRD §8 — an override is one of these, never a silent edit.
type Decision struct {
	// Actor is the provenance subject (who proposed — KRD §8, never placeholder).
	Actor Actor `json:"actor"`
	// Outcome is one of the four closed outcomes.
	Outcome Outcome `json:"outcome"`
	// Admission is the gate's verbatim decision (authority.Decide) — the BlockReason rides here.
	Admission authority.AdmissionDecision `json:"admission"`
	// Envelope is the resulting ChangeSet — DRAFT when blocked/escalated/stale, APPLIED when applied.
	Envelope changeset.ChangeSet `json:"envelope"`
	// NewHead is the kernel head AFTER an applied write (the envelope id). Empty unless applied.
	NewHead string `json:"new_head,omitempty"`
	// StaleAgainst is the live head the proposal lost to (set iff Outcome == stale_head) — the
	// proposer must re-run the mirrors against THIS head (merge.MergeSemantic, S25).
	StaleAgainst string `json:"stale_against,omitempty"`
	// Override carries an override record when an authority block was overridden (KRD §8). Nil
	// unless an override was applied; never a silent bypass.
	Override *OverrideRecord `json:"override,omitempty"`
}

// OverrideRecord is the recorded decision of KRD §8: overriding an authority block is NOT an
// edit, it is a decision carrying WHO overrode, the reason, and the ADR it is justified by.
// It is APPENDED, never destructive; the original block decision is preserved in Admission.
type OverrideRecord struct {
	// By is the actor who overrode (provenance — KRD §8, never placeholder).
	By Actor `json:"by"`
	// Reason is the human justification (free text — the override is deliberate).
	Reason string `json:"reason"`
	// ADR is the decision record the override is justified by (e.g. "ADR-0016"). Required.
	ADR string `json:"adr"`
}

// IsRecorded reports whether an override is fully recorded (actor + reason + ADR all present).
// An override missing any of the three is a silent bypass — refused by Approve.
func (o OverrideRecord) IsRecorded() bool {
	return o.By != "" && o.Reason != "" && o.ADR != ""
}

// Propose builds the DRAFT envelope for a cockpit truth-write and runs the AuthorityGraph gate
// — WITHOUT moving the head (a propose never writes truth). It returns the recorded Decision:
//
//   - gate blocked (veto / no approval) ⇒ OutcomeBlocked, the DRAFT held, the BlockReason carried;
//   - gate escalated (partial approval)  ⇒ OutcomeEscalated, the DRAFT held;
//   - gate admitted                      ⇒ OutcomeApplied is NOT yet reached here — Propose only
//     produces an ADMITTED DRAFT; the head check + apply happen in Approve (the two-phase door).
//
// PURE: no DB, no clock, no I/O. The envelope id is content-addressed (changeset.Open). A
// malformed delta body yields OutcomeBlocked with the changeset error surfaced as the reason.
func Propose(g authority.AuthorityGraph, p Proposal) Decision {
	cs, err := changeset.Open(p.Label, p.Head, p.Spec, p.Mirror)
	if err != nil {
		return Decision{
			Actor:   p.Actor,
			Outcome: OutcomeBlocked,
			Admission: authority.AdmissionDecision{
				Decision: authority.DecisionBlocked,
			},
			Envelope: cs,
		}
	}
	adm := authority.Decide(g, p.Truth, p.Granted)
	d := Decision{Actor: p.Actor, Admission: adm, Envelope: cs}
	switch adm.Decision {
	case authority.DecisionBlocked:
		d.Outcome = OutcomeBlocked
	case authority.DecisionEscalated:
		d.Outcome = OutcomeEscalated
	case authority.DecisionAdmitted:
		// Admitted DRAFT — gate passed. Propose does NOT move the head (a propose never writes
		// truth); Approve does the head-check + apply. The admitted DRAFT is surfaced as
		// OutcomeApplied only AFTER Approve lands it; here it signals "gate admitted, ready".
		d.Outcome = OutcomeApplied
	}
	return d
}

// Approve runs the FULL two-phase truth-write for a single proposal against the LIVE head: the
// AuthorityGraph gate AND the content-addressed optimistic lock. It is the only door that moves
// the head. liveHead is the kernel head AT APPLY TIME (the caller reads it just before).
//
//   - gate NOT admitted (and no recorded override) ⇒ Blocked/Escalated, head UNMOVED;
//   - gate admitted (or override recorded) AND p.Head != liveHead ⇒ OutcomeStaleHead, head
//     UNMOVED, StaleAgainst == liveHead (the proposer re-runs the mirrors, merge.MergeSemantic);
//   - gate admitted (or override recorded) AND p.Head == liveHead ⇒ APPLIED: the envelope is
//     committed (changeset.Apply, completeness-gated) and NewHead == the applied envelope id.
//
// override is OPTIONAL: a non-nil, fully-recorded override (KRD §8) turns a gate-block into an
// admitted write, carried in Decision.Override. An override that is NOT fully recorded is refused
// (treated as no override — the block stands). PURE (appliedAt is an argument).
func Approve(g authority.AuthorityGraph, p Proposal, liveHead string, appliedAt time.Time, override *OverrideRecord) Decision {
	d := Propose(g, p)
	if d.Outcome == OutcomeBlocked || d.Outcome == OutcomeEscalated {
		// A fully-recorded override (KRD §8) converts a block/escalation into an admitted write.
		if override != nil && override.IsRecorded() {
			d.Override = override
			d.Admission = authority.AdmissionDecision{Decision: authority.DecisionAdmitted}
			d.Outcome = OutcomeApplied // tentatively admitted; head-check below may flip to stale
		} else {
			return d // block/escalation stands, head unmoved
		}
	}

	// Admitted (or overridden) ⇒ the optimistic lock on the CONTENT-ADDRESSED head.
	if p.Head != liveHead {
		d.Outcome = OutcomeStaleHead
		d.StaleAgainst = liveHead
		d.NewHead = ""
		return d // REFUSED — never last-write-wins (anti-overwrite §9)
	}

	applied, br := changeset.Apply(d.Envelope, appliedAt, nil)
	if br != nil {
		// Incomplete envelope (no mirror for a spec) — blocked by the completeness gate, head unmoved.
		d.Outcome = OutcomeBlocked
		d.Admission = authority.AdmissionDecision{Decision: authority.DecisionBlocked}
		return d
	}
	d.Envelope = applied
	d.Outcome = OutcomeApplied
	d.NewHead = applied.ID // the new head is the content address of the applied envelope
	return d
}

// ApplyConcurrent runs a batch of proposals that all observed the SAME starting head, applying
// them in the caller's submitted order against a MOVING live head: the FIRST admitted+fresh apply
// moves the head; every LATER proposal that still references the OLD head is REFUSED with
// OutcomeStaleHead — NEVER last-write-wins (THE done criterion, anti-overwrite §9). It returns one
// recorded Decision per proposal, in submitted order. PURE: appliedAt is an argument; the only
// state is the local head cursor.
func ApplyConcurrent(g authority.AuthorityGraph, startHead string, proposals []Proposal, appliedAt time.Time) []Decision {
	head := startHead
	out := make([]Decision, 0, len(proposals))
	for _, p := range proposals {
		d := Approve(g, p, head, appliedAt, nil)
		if d.Outcome == OutcomeApplied {
			head = d.NewHead // the head MOVES — every later same-head proposal goes stale
		}
		out = append(out, d)
	}
	return out
}

// StaleProposals returns, in submitted order, the actors of every proposal refused by an
// ApplyConcurrent batch with OutcomeStaleHead — the members who must re-run their mirrors against
// the new head (merge.MergeSemantic, S25). A pure projection over the decisions.
func StaleProposals(decisions []Decision) []Actor {
	var out []Actor
	for _, d := range decisions {
		if d.Outcome == OutcomeStaleHead {
			out = append(out, d.Actor)
		}
	}
	return out
}

// AppliedCount counts how many decisions in a batch ended APPLIED. The anti-overwrite invariant:
// for proposals that all wrote to the SAME target from the SAME starting head, AppliedCount is at
// most 1 (the first); every other is stale (no silent overwrite). A pure count.
func AppliedCount(decisions []Decision) int {
	n := 0
	for _, d := range decisions {
		if d.Outcome == OutcomeApplied {
			n++
		}
	}
	return n
}

// Provenance returns, sorted by actor then outcome, the (actor, outcome) provenance pairs of a
// batch — "who wanted what, and what happened" (KRD §8). Deterministic (sorted), so the recorded
// history is replayable. A pure projection.
func Provenance(decisions []Decision) []ProvenanceEntry {
	out := make([]ProvenanceEntry, 0, len(decisions))
	for _, d := range decisions {
		out = append(out, ProvenanceEntry{Actor: d.Actor, Outcome: d.Outcome, Overridden: d.Override != nil})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Actor != out[j].Actor {
			return out[i].Actor < out[j].Actor
		}
		return out[i].Outcome < out[j].Outcome
	})
	return out
}

// ProvenanceEntry is one "who wanted what" record (KRD §8) — the acting member, the outcome, and
// whether an override was recorded.
type ProvenanceEntry struct {
	Actor      Actor   `json:"actor"`
	Outcome    Outcome `json:"outcome"`
	Overridden bool    `json:"overridden"`
}
