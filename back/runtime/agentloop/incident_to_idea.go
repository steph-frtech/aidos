// incident_to_idea.go — BA31: the LOOP EMITS THE SIGNAL on a failed/abandoned/green-hollow
// terminal, feeding reality.Observe → Learn → ToIdea to produce an ideas.Idea DRAFT — PROPOSED,
// NEVER APPLIED. This file is the on-ramp that connects a build-agent run (BA30's RunToSignal)
// to the S43 RealityMirror engine, the ONLY legal door from production reality into the kernel:
//
//	AgentRun → RunToSignal → reality.Observe → reality.Learn → reality.ToIdea → ideas.Idea(DRAFT)
//	                                                                              ↓ [human]
//	                                                            Mirror → /goal → authority → Kernel
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING and declares NO truth. RunToDraft returns
// a DraftFromRun VALUE: a draft idea (Status=draft) carrying provenance "incident:<pattern>",
// plus the proof WroteKernel==false and the reality.ToKernel refusal (REALITY_CANNOT_DECLARE_TRUTH)
// re-asserted — the direct edge Incident→Kernel is ALWAYS refused. The far edge stays idea →
// mirror → /goal → human approval. The on-ramp PROPOSES; it never governs.
//
// PROVENANCE-VERIFIED APPLY (gap J1). An agent builds structs FREELY — a buggy or malicious loop
// can forge a Proposal{Status:"admitted"} in memory and hand it to the apply path. ApplyGate
// NEVER trusts that self-asserted field. It RE-DERIVES the admission verdict from the S16
// authority graph + the roles actually granted (authority.Decide), and admits ONLY when the
// re-derived verdict is `admitted`. A forged "admitted" with no admitting authority record is
// refused with PROPOSAL_NOT_ADMITTED, fail-closed. The transition proposed→admitted lives in S16;
// BA31 re-asserts it at the apply seam (the agent constructs the struct; the apply verifies the
// provenance, never the field).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE and TOTAL — a switch and a
// pipe over the reality engine, never an LLM "decide if this run should become an idea" agent.
// Same run + thresholds + authority graph + grants ⇒ same draft / same apply verdict. The
// reproducibility mirror incident_to_idea_property_test.go pins it. The cause_sketch carried into
// the idea is an explicit HYPOTHESIS (reality's CauseSketch), never a falsifiable truth.
package agentloop

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// DraftFromRun is the typed result of the BA31 on-ramp: the DRAFT idea a failed/hollow run
// sketched, plus the recurring incident it was observed as, the PatternSignal that produced it,
// and the explicit no-kernel-write / always-refused-direct-edge proofs. It is a VALUE — RunToDraft
// writes nothing.
type DraftFromRun struct {
	// Signalled reports whether the run produced a signal at all. An ordinary green run yields
	// Signalled=false and an otherwise-zero DraftFromRun (no idea invented). Failed / abandoned /
	// blocked / green-hollow runs yield Signalled=true.
	Signalled bool `json:"signalled"`
	// Pattern is the BA30 gateway result (signal + pattern key + severity + cause sketch +
	// provenance). Zero when Signalled is false.
	Pattern PatternSignal `json:"pattern,omitempty"`
	// Incident is the reality.Incident the signal was OBSERVED as — content-addressed on the
	// PATTERN (gap I2), so two runs of the same failure mode share an id and Recurrence climbs.
	// Its IdeaID is set (the loop traced back). Zero when Signalled is false.
	Incident reality.Incident `json:"incident,omitempty"`
	// Idea is the DRAFT candidate-truth (Status=draft) the incident sketched. It carries no
	// version and no mirror; it must STILL acquire its mirror via /goal to reach the kernel. Zero
	// when Signalled is false.
	Idea ideas.Idea `json:"idea,omitempty"`
	// ProposesPinned / OpenQuestion mirror reality.Learn's honesty: when the signal does not pin a
	// `proposes` kind, ProposesPinned is false and OpenQuestion carries the recorded uncertainty
	// (never a guess, §8).
	ProposesPinned bool   `json:"proposes_pinned"`
	OpenQuestion   string `json:"open_question,omitempty"`
	// WroteKernel is ALWAYS false — the on-ramp performs no kernel write. The field exists so the
	// no-kernel-write guarantee is explicit and testable.
	WroteKernel bool `json:"wrote_kernel"`
	// ToKernelRefusal is the reality.ToKernel refusal re-asserted at the on-ramp:
	// REALITY_CANNOT_DECLARE_TRUTH — the direct edge Incident→Kernel is ALWAYS refused, regardless
	// of recurrence. Non-nil whenever Signalled is true (a signal can NEVER take the direct edge).
	ToKernelRefusal *blockreason.BlockReason `json:"to_kernel_refusal,omitempty"`
}

// RunToDraft is the BA31 PIPELINE: it runs the BA30 gateway (RunToSignal), and — for a signalled
// run — observes the signal as a content-addressed incident, learns it into a DRAFT idea, traces
// the loop back (incident.IdeaID = idea.id), and re-asserts the wall (reality.ToKernel always
// refuses the direct edge). An ordinary green run yields (DraftFromRun{Signalled:false}, nil) — NO
// idea invented. PURE, TOTAL: same run + thresholds ⇒ same draft; no clock, no rng, no I/O, no
// LLM, no kernel write. The error path is only reality's own marshal error (never a wall bypass).
func RunToDraft(run agentrun.AgentRun, th SignalThresholds) (DraftFromRun, error) {
	ps, ok := RunToSignal(run, th)
	if !ok {
		// Ordinary green run: no signal, no idea. WroteKernel stays false (the guarantee holds
		// trivially — nothing happened).
		return DraftFromRun{Signalled: false, WroteKernel: false}, nil
	}

	// Observe the signal as a content-addressed incident (built ENTIRELY from the pattern — no run
	// id in the address, so two runs of the same pattern collapse, gap I2).
	inc, err := reality.Observe(ps.ToObserveInput())
	if err != nil {
		return DraftFromRun{}, fmt.Errorf("agentloop: run-to-draft: observe: %w", err)
	}

	// Learn the incident into a DRAFT idea (proposes inferred only when pinned; else OpenQuestion).
	cand, err := reality.Learn(inc)
	if err != nil {
		return DraftFromRun{}, fmt.Errorf("agentloop: run-to-draft: learn: %w", err)
	}

	// Trace the loop back: the incident now points at the draft idea it produced.
	inc = reality.LearnedIncident(inc, cand)

	// Re-assert the wall at the on-ramp: the direct edge Incident→Kernel is ALWAYS refused.
	refusal := reality.ToKernel(inc)

	return DraftFromRun{
		Signalled:       true,
		Pattern:         ps,
		Incident:        inc,
		Idea:            reality.ToIdea(cand),
		ProposesPinned:  cand.ProposesPinned,
		OpenQuestion:    cand.OpenQuestion,
		WroteKernel:     cand.WroteKernel, // always false
		ToKernelRefusal: refusal,          // always non-nil (REALITY_CANNOT_DECLARE_TRUTH)
	}, nil
}

// Proposal is the apply-path struct an agent loop hands to ApplyGate (gap J1). The agent builds it
// FREELY — Status is a SELF-ASSERTED field the loop fills, NEVER a fact ApplyGate trusts. The
// {Domain, TruthKind} key identifies which authority graph governs the targeted truth; Status is
// the loop's CLAIM about admission. ApplyGate ignores Status and re-derives the verdict.
type Proposal struct {
	// Domain + TruthKind key the S16 authority graph that governs this proposal's targeted truth.
	Domain    string              `json:"domain"`
	TruthKind authority.TruthKind `json:"truth_kind"`
	// Status is the loop's SELF-ASSERTED admission claim ("proposed" | "admitted"). It is NEVER
	// trusted by ApplyGate — a forged "admitted" with no admitting authority record is refused.
	Status string `json:"status"`
	// IdeaID is the draft idea this proposal would apply (carried for provenance / the panel).
	IdeaID string `json:"idea_id,omitempty"`
}

const (
	// ProposalStatusProposed — the honest initial state: a proposal awaiting admission.
	ProposalStatusProposed = "proposed"
	// ProposalStatusAdmitted — the loop's CLAIM that the proposal is admitted. NEVER trusted; the
	// apply re-derives the verdict from the authority graph.
	ProposalStatusAdmitted = "admitted"
)

// ApplyDecision is ApplyGate's verdict: whether the proposal may apply, and — when refused — the
// actionable BlockReason. Admitted is true ONLY when the re-derived authority verdict is
// `admitted`; a forged Status:"admitted" with no admitting record yields Admitted=false +
// PROPOSAL_NOT_ADMITTED.
type ApplyDecision struct {
	// Admitted reports whether the proposal may apply (the RE-DERIVED verdict, not the field).
	Admitted bool `json:"admitted"`
	// Refusal is the actionable BlockReason when Admitted is false (nil otherwise). When the
	// re-derived verdict is `admitted` it is nil; when the loop forged Status:"admitted" without
	// an admitting authority record it is PROPOSAL_NOT_ADMITTED; when authority genuinely blocks /
	// escalates it carries the S16 refusal verbatim.
	Refusal *blockreason.BlockReason `json:"refusal,omitempty"`
}

// ApplyGate is the BA31 PROVENANCE-VERIFIED apply seam (gap J1). It NEVER trusts the proposal's
// self-asserted Status field. It RE-DERIVES the admission verdict from the S16 authority graph
// (g) over the targeted truth ({prop.Domain, prop.TruthKind}) given the roles actually granted
// (granted), via authority.Decide — and admits ONLY when that re-derived verdict is `admitted`.
//
// A buggy/malicious loop that forges Proposal{Status:"admitted"} but cannot show an admitting
// authority record (no granted approver / a veto / partial approval) is refused with
// PROPOSAL_NOT_ADMITTED, fail-closed — the transition proposed→admitted lives in S16, re-asserted
// here. PURE, TOTAL: same graph + truth + grants ⇒ same verdict; no clock, no rng, no I/O, no LLM,
// no kernel write. The agent constructs the struct; the apply verifies the provenance.
func ApplyGate(g authority.AuthorityGraph, prop Proposal, granted []authority.Role) ApplyDecision {
	// RE-DERIVE the verdict from the authority graph — the Status field is NEVER read.
	dec := authority.Decide(g, authority.Truth{Domain: prop.Domain, TruthKind: prop.TruthKind}, granted)
	if dec.Decision == authority.DecisionAdmitted {
		return ApplyDecision{Admitted: true}
	}
	// Not admitted. Whether the loop forged Status:"admitted" or honestly said "proposed", the
	// apply refuses — the wall surfaces the BA31 PROPOSAL_NOT_ADMITTED door (it names why the
	// self-asserted field was ignored and how to obtain a real admission). The S16 verdict's own
	// reason (veto / missing approval / escalation) rides the explanation context via the door.
	br := blockreason.For(blockreason.CodeProposalNotAdmitted)
	return ApplyDecision{Admitted: false, Refusal: &br}
}
