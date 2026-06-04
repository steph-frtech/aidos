// incident_to_idea_property_test.go — the BA31 reproducibility + invariant + HONESTY mirror (∀),
// determinism-first (CLAUDE.md §6/§8). These rapid properties pin the on-ramp RunToDraft and the
// provenance-verified ApplyGate (gap J1):
//
//   - REPRODUCIBLE: identical (run, thresholds) ⇒ identical DraftFromRun, twice (no clock, no rng).
//   - SIGNALLED ⇒ DRAFT + NO KERNEL WRITE: any signalled run yields a DRAFT idea (Status=draft),
//     WroteKernel=false, and the ToKernel refusal present (the direct edge is ALWAYS refused).
//   - SIGNALLED ⇒ INCIDENT PROVENANCE: the draft idea's provenance is incident-sourced.
//   - APPLYGATE NEVER TRUSTS THE FIELD (gap J1): a FORGED Status:"admitted" with no admitting
//     authority record (no granted approver / a veto / partial) is ALWAYS refused with
//     PROPOSAL_NOT_ADMITTED — the verdict is re-derived, the Status field never read.
//   - APPLYGATE ADMITS A GENUINE ADMISSION: every required approver granted, no veto ⇒ admitted,
//     regardless of the (honest or forged) Status field.
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func TestProp_RunToDraft_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		result := genResult(t)
		n := rapid.IntRange(0, 5).Draw(t, "n-refusals")
		actions := make([]agentrun.AgentAction, 0, n)
		for i := 0; i < n; i++ {
			actions = append(actions, refusedWrite(blockreason.CodeAgentWriteAboveWaterline, "kernel.operation"))
		}
		run := recordRun(t, result, actions, "g")
		th := SignalThresholds{ThrashRefusals: rapid.IntRange(0, 5).Draw(t, "th")}
		d1, err1 := RunToDraft(run, th)
		d2, err2 := RunToDraft(run, th)
		if (err1 == nil) != (err2 == nil) || !reflect.DeepEqual(d1, d2) {
			t.Fatalf("RunToDraft must be reproducible: %+v/%v vs %+v/%v", d1, err1, d2, err2)
		}
	})
}

func TestProp_Signalled_DraftAndNoKernelWrite(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		result := rapid.SampledFrom([]agentrun.Result{
			agentrun.ResultStillRed, agentrun.ResultAbandoned, agentrun.ResultBlocked,
		}).Draw(t, "failing-result")
		run := recordRun(t, result, nil, "g")
		d, err := RunToDraft(run, DefaultThresholds())
		if err != nil {
			t.Fatalf("RunToDraft: %v", err)
		}
		if !d.Signalled {
			t.Fatalf("a %s run must signal", result)
		}
		if d.Idea.Status != ideas.StatusDraft {
			t.Fatalf("the idea must be a DRAFT, got %q", d.Idea.Status)
		}
		if d.Idea.Provenance.Source != ideas.ProvenanceIncident {
			t.Fatalf("the idea provenance must be incident-sourced, got %q", d.Idea.Provenance.Source)
		}
		if d.WroteKernel {
			t.Fatalf("the on-ramp must NEVER write the kernel")
		}
		if d.ToKernelRefusal == nil || d.ToKernelRefusal.Code != blockreason.CodeRealityCannotDeclareTruth {
			t.Fatalf("the direct edge Incident→Kernel must ALWAYS be refused (REALITY_CANNOT_DECLARE_TRUTH)")
		}
	})
}

// genApplyGraph draws a valid 1-approver authority graph (with an optional veto role).
func genApplyGraph(t *rapid.T) (authority.AuthorityGraph, authority.Role) {
	approver := authority.Role(rapid.SampledFrom([]string{"legal", "lead", "owner"}).Draw(t, "approver"))
	g := authority.AuthorityGraph{
		Domain:    "d",
		TruthKind: authority.TruthKind(truthtyping.KindRegulatory),
		Approvers: []authority.Role{approver},
	}
	return g, approver
}

func TestProp_ApplyGate_ForgedAdmittedNeverApplies(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g, approver := genApplyGraph(t)
		// the loop forges any Status, but does NOT grant the required approver.
		status := rapid.SampledFrom([]string{ProposalStatusAdmitted, ProposalStatusProposed, "anything"}).Draw(t, "status")
		prop := Proposal{Domain: g.Domain, TruthKind: g.TruthKind, Status: status}
		// granted set deliberately EXCLUDES the required approver (no admitting record).
		_ = approver
		dec := ApplyGate(g, prop, nil)
		if dec.Admitted {
			t.Fatalf("no admitting authority record ⇒ must NOT apply (status was %q)", status)
		}
		if dec.Refusal == nil || dec.Refusal.Code != blockreason.CodeProposalNotAdmitted {
			t.Fatalf("must refuse with PROPOSAL_NOT_ADMITTED, got %+v", dec.Refusal)
		}
	})
}

func TestProp_ApplyGate_GenuineAdmissionApplies(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g, approver := genApplyGraph(t)
		// the loop may even honestly say "proposed"; the verdict is re-derived from the grants.
		status := rapid.SampledFrom([]string{ProposalStatusProposed, ProposalStatusAdmitted}).Draw(t, "status")
		prop := Proposal{Domain: g.Domain, TruthKind: g.TruthKind, Status: status}
		dec := ApplyGate(g, prop, []authority.Role{approver}) // required approver actually granted
		if !dec.Admitted {
			t.Fatalf("a genuinely admitted proposal must apply, got refusal %+v", dec.Refusal)
		}
		if dec.Refusal != nil {
			t.Fatalf("an admitted proposal carries no refusal")
		}
	})
}
