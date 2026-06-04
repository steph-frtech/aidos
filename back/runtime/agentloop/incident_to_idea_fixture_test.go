// incident_to_idea_fixture_test.go — the BA31 fixture mirror (N2): state → command → events
// for the on-ramp RunToDraft and the provenance-verified ApplyGate. The COMMAND is RunToDraft(run)
// / ApplyGate(graph, proposal, granted); the EVENTS are the DRAFT idea (Status=draft, provenance
// incident:<pattern>), the NO-kernel-write proof, the always-present ToKernel refusal, the
// recurrence collapse across two runs of one pattern (fault-injection), and the PROPOSAL_NOT_ADMITTED
// refusal of a FORGED Status:"admitted" with no admitting authority record (gap J1).
//
// This is the BEHAVIOUR spec (Mandat A): a means-test toward the human/reality red, never a new
// truth. mirror record: reflects=runtime.agent_run "incident_to_idea" · test_kind=fixture ·
// cert_language=fixture · authority=above · liveness=alive.
package agentloop

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Row 1 — given an ABANDONED run (budget breached mid-run), when RunToDraft ⇒ a DRAFT idea
// (Status=draft) with incident provenance, WroteKernel=false, and the direct edge refused.
func TestFixture_AbandonedRun_ProducesDraftIdea_NoKernelWrite(t *testing.T) {
	run := mk(t, agentrun.ResultAbandoned, nil, "S99")
	d, err := RunToDraft(run, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft: %v", err)
	}
	if !d.Signalled {
		t.Fatalf("an abandoned run must signal")
	}
	if d.Idea.Status != ideas.StatusDraft {
		t.Fatalf("idea must be a DRAFT, got %q", d.Idea.Status)
	}
	if d.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Fatalf("idea provenance must be incident, got %q", d.Idea.Provenance.Source)
	}
	if d.Idea.Provenance.Detail == "" {
		t.Fatalf("idea provenance detail (the incident ref) must be set")
	}
	if d.WroteKernel {
		t.Fatalf("the on-ramp must NEVER write the kernel")
	}
	if d.ToKernelRefusal == nil {
		t.Fatalf("the direct edge Incident→Kernel must ALWAYS be refused")
	}
	if d.ToKernelRefusal.Code != blockreason.CodeRealityCannotDeclareTruth {
		t.Fatalf("the refusal must be REALITY_CANNOT_DECLARE_TRUTH, got %q", d.ToKernelRefusal.Code)
	}
	// the loop traced back: incident.IdeaID == idea.ID
	if d.Incident.IdeaID != d.Idea.ID {
		t.Fatalf("the incident must point back at the draft idea (IdeaID=%q, idea=%q)", d.Incident.IdeaID, d.Idea.ID)
	}
}

// Row 2 — given an ORDINARY GREEN run, when RunToDraft ⇒ NO signal, NO idea invented.
func TestFixture_OrdinaryGreen_NoDraft(t *testing.T) {
	run := mk(t, agentrun.ResultGreen, nil, "S99")
	d, err := RunToDraft(run, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft: %v", err)
	}
	if d.Signalled {
		t.Fatalf("an ordinary green run must NOT signal")
	}
	if d.Idea.ID != "" {
		t.Fatalf("no idea must be invented for an ordinary green run")
	}
	if d.WroteKernel {
		t.Fatalf("WroteKernel must be false")
	}
}

// Row 3 — given a GREEN run that THRASHED against the wall (refusals ≥ threshold), when RunToDraft
// ⇒ a LOW-severity DRAFT idea (gap I1, a green-hollow signal).
func TestFixture_GreenHollow_ProducesLowSeverityDraft(t *testing.T) {
	actions := []agentrun.AgentAction{
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel/x"),
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel/y"),
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel/z"),
	}
	run := mk(t, agentrun.ResultGreen, actions, "S99")
	d, err := RunToDraft(run, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft: %v", err)
	}
	if !d.Signalled {
		t.Fatalf("a thrashing green run must signal (green-hollow, gap I1)")
	}
	if d.Pattern.Severity != SeverityLow {
		t.Fatalf("green-hollow severity must be LOW, got %q", d.Pattern.Severity)
	}
	if d.Idea.Status != ideas.StatusDraft {
		t.Fatalf("idea must be a DRAFT")
	}
}

// Row 4 — FAULT-INJECTION: two DISTINCT runs sharing a failure mode collapse into ONE recurring
// incident (identity-by-pattern, gap I2) — the same incident id, so Recurrence can climb. A
// "harden-the-harness" idea surfaces from the recurring pattern.
func TestFixture_RecurringPattern_CollapsesToOneIncident(t *testing.T) {
	// Two distinct runs (different ids: different goals/timestamps) but the SAME failure mode.
	r1 := mk(t, agentrun.ResultStillRed, []agentrun.AgentAction{
		refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel/a"),
	}, "S101")
	r2, err := agentrun.Record(agentrun.AgentRun{
		Agent: "builder@v1", Goal: "S202", RedWorkItem: "S202.r1", ContextPack: "pack2",
		Actions:   []agentrun.AgentAction{refused(t, blockreason.CodeAgentWriteAboveWaterline, "kernel/b")},
		Result:    agentrun.ResultStillRed,
		StartedAt: "2026-06-05T09:00:00Z", EndedAt: "2026-06-05T09:09:00Z",
	})
	if err != nil {
		t.Fatalf("Record r2: %v", err)
	}
	if r1.ID == r2.ID {
		t.Fatalf("the two runs must be DISTINCT (different run ids)")
	}
	d1, err := RunToDraft(r1, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft r1: %v", err)
	}
	d2, err := RunToDraft(r2, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft r2: %v", err)
	}
	if d1.Pattern.Pattern != d2.Pattern.Pattern {
		t.Fatalf("two runs of the same failure mode must share a pattern: %q vs %q", d1.Pattern.Pattern, d2.Pattern.Pattern)
	}
	if d1.Incident.ID != d2.Incident.ID {
		t.Fatalf("identity-by-pattern: the recurring incident must collapse to ONE id (got %q vs %q)", d1.Incident.ID, d2.Incident.ID)
	}
	// and the draft idea is the SAME content-addressed candidate (the recurring harden-the-harness idea).
	if d1.Idea.ID != d2.Idea.ID {
		t.Fatalf("the recurring incident must produce the SAME draft idea id")
	}
}

// Row 5 — gap J1: a FORGED Proposal{Status:"admitted"} with NO admitting authority record (no
// approver granted) is REFUSED with PROPOSAL_NOT_ADMITTED. The Status field is NEVER trusted.
func TestFixture_ForgedAdmitted_Refused(t *testing.T) {
	g := authority.AuthorityGraph{
		Domain:    "billing",
		TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
		Approvers: []authority.Role{"legal"},
	}
	forged := Proposal{
		Domain:    "billing",
		TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
		Status:    ProposalStatusAdmitted, // the loop FORGED "admitted"
		IdeaID:    "forged",
	}
	// NO role granted — the authority graph does NOT admit. The forged field must be ignored.
	dec := ApplyGate(g, forged, nil)
	if dec.Admitted {
		t.Fatalf("a forged Status:\"admitted\" with no admitting authority record must NOT apply")
	}
	if dec.Refusal == nil || dec.Refusal.Code != blockreason.CodeProposalNotAdmitted {
		t.Fatalf("the refusal must be PROPOSAL_NOT_ADMITTED, got %+v", dec.Refusal)
	}
	if len(dec.Refusal.HowToFix) == 0 {
		t.Fatalf("the refusal must name the door (how_to_fix non-empty)")
	}
}

// Row 6 — gap J1 (the other side): a GENUINE admission (every required approver granted, no veto)
// passes ApplyGate. The verdict is RE-DERIVED from the authority graph, not the Status field —
// here even an honest "proposed" status applies because the authority record admits it.
func TestFixture_GenuineAdmission_Applies(t *testing.T) {
	g := authority.AuthorityGraph{
		Domain:    "billing",
		TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
		Approvers: []authority.Role{"legal"},
	}
	honest := Proposal{
		Domain:    "billing",
		TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
		Status:    ProposalStatusProposed, // honestly "proposed", not "admitted"
	}
	dec := ApplyGate(g, honest, []authority.Role{"legal"}) // the required approver actually granted
	if !dec.Admitted {
		t.Fatalf("a genuinely admitted proposal must apply (verdict re-derived from authority), got refusal %+v", dec.Refusal)
	}
	if dec.Refusal != nil {
		t.Fatalf("an admitted proposal carries no refusal")
	}
}

// Row 7 — the cause sketch carried into the idea is an explicit HYPOTHESIS (never a truth).
func TestFixture_CauseSketch_IsHypothesis(t *testing.T) {
	run := mk(t, agentrun.ResultStillRed, nil, "S99")
	d, err := RunToDraft(run, DefaultThresholds())
	if err != nil {
		t.Fatalf("RunToDraft: %v", err)
	}
	if !strings.Contains(d.Idea.Intent, "HYPOTHESIS") {
		t.Fatalf("the idea intent (cause sketch) must be an explicit hypothesis, got %q", d.Idea.Intent)
	}
}
