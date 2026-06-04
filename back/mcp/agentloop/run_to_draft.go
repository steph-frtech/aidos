// run_to_draft.go — BA31: the on-ramp tool (agentloop_run_to_draft) and the provenance-verified
// apply gate tool (agentloop_apply_gate), wired into the agentloop MCP server (gap J1; ADR 0009 —
// one tool = one backend op). Both are deterministic and READ-ONLY (they write NO truth).
//
// agentloop_run_to_draft drives a failed/abandoned/green-hollow run through the S43 RealityMirror
// (Observe → Learn → ToIdea) to a DRAFT idea — PROPOSED, never applied. It re-asserts the wall: the
// direct edge Incident→Kernel is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH); WroteTruth is always
// false. The only legal door stays idea → mirror → /goal → approval.
//
// agentloop_apply_gate re-derives the admission verdict from the S16 authority graph + the roles
// actually granted — it NEVER trusts a Proposal's self-asserted Status field. A forged
// Status:"admitted" with no admitting authority record is refused PROPOSAL_NOT_ADMITTED, fail-closed.
//
// READ-ONLY VIEW, DETERMINISTIC (§6/§8): the server holds no DB; it pairs the shared declared runs
// with the PURE agentloop.RunToDraft / agentloop.ApplyGate engines (the AUTHORITY). THE WALL: no
// truth is written.
package main

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// ── agentloop_run_to_draft ──

type runToDraftInput struct {
	Agent          string `json:"agent,omitempty" jsonschema:"optional filter: only runs by this CoucheAgent @version"`
	Goal           string `json:"goal,omitempty" jsonschema:"optional filter: only runs serving this /goal"`
	Result         string `json:"result,omitempty" jsonschema:"optional filter: terminal result (green|still_red|blocked|abandoned)"`
	ThrashRefusals int    `json:"thrash_refusals,omitempty" jsonschema:"declared knob: green-run refusal count flagged as hollow (0 = default)"`
}

// draftEntry is one run mapped to its DRAFT idea: the recurring incident id (identity-by-pattern),
// the idea id + status + provenance, the cause-sketch hypothesis, the OpenQuestion (when proposes is
// unpinned), and the kernel refusal proving no truth was declared.
type draftEntry struct {
	RunID          string `json:"run_id"`
	Goal           string `json:"goal"`
	Result         string `json:"result"`
	Signalled      bool   `json:"signalled"`
	Severity       string `json:"severity"`
	Pattern        string `json:"pattern"`
	IncidentID     string `json:"incident_id"`     // recurring incident id (collapses by pattern)
	IdeaID         string `json:"idea_id"`         // the DRAFT idea id
	IdeaStatus     string `json:"idea_status"`     // always "draft"
	Provenance     string `json:"provenance"`      // idea provenance detail (the incident ref)
	CauseSketch    string `json:"cause_sketch"`    // HYPOTHESIS, never a truth
	ProposesPinned bool   `json:"proposes_pinned"` // false ⇒ OpenQuestion recorded
	OpenQuestion   string `json:"open_question,omitempty"`
	WroteKernel    bool   `json:"wrote_kernel"`   // always false
	KernelRefusal  string `json:"kernel_refusal"` // REALITY_CANNOT_DECLARE_TRUTH (the direct edge is refused)
}

type runToDraftOutput struct {
	Entries []draftEntry `json:"entries"`
	// PatternRecurrence counts how many reported runs collapse to each recurring incident id (the
	// identity-by-pattern proof: distinct runs of the same mode share one id, so the count climbs).
	PatternRecurrence map[string]int `json:"pattern_recurrence"`
	// WroteTruth is ALWAYS false — the on-ramp proposes a DRAFT idea, it declares no truth.
	WroteTruth bool `json:"wrote_truth"`
}

func (s *server) runToDraft(_ context.Context, _ *mcp.CallToolRequest, in runToDraftInput) (*mcp.CallToolResult, runToDraftOutput, error) {
	th := agentloop.DefaultThresholds()
	if in.ThrashRefusals > 0 {
		th.ThrashRefusals = in.ThrashRefusals
	}
	runs := append(ledgerRuns(), signalScenarios()...)
	matches := func(r agentrun.AgentRun) bool {
		if in.Agent != "" && r.Agent != in.Agent {
			return false
		}
		if in.Goal != "" && r.Goal != in.Goal {
			return false
		}
		if in.Result != "" && string(r.Result) != in.Result {
			return false
		}
		return true
	}
	entries := make([]draftEntry, 0, len(runs))
	recurrence := map[string]int{}
	for _, r := range runs {
		if !matches(r) {
			continue
		}
		d, err := agentloop.RunToDraft(r, th)
		if err != nil {
			return nil, runToDraftOutput{}, err
		}
		e := draftEntry{RunID: r.ID, Goal: r.Goal, Result: string(r.Result), Signalled: d.Signalled, WroteKernel: d.WroteKernel}
		if d.Signalled {
			e.Severity = string(d.Pattern.Severity)
			e.Pattern = d.Pattern.Pattern
			e.IncidentID = d.Incident.ID
			e.IdeaID = d.Idea.ID
			e.IdeaStatus = string(d.Idea.Status)
			e.Provenance = d.Idea.Provenance.Detail
			e.CauseSketch = d.Idea.Intent
			e.ProposesPinned = d.ProposesPinned
			e.OpenQuestion = d.OpenQuestion
			if d.ToKernelRefusal != nil {
				e.KernelRefusal = string(d.ToKernelRefusal.Code)
			}
			recurrence[d.Incident.ID]++
		}
		entries = append(entries, e)
	}
	return nil, runToDraftOutput{Entries: entries, PatternRecurrence: recurrence, WroteTruth: false}, nil
}

// ── agentloop_apply_gate ──

type applyGateInput struct {
	Domain    string   `json:"domain" jsonschema:"the authority graph's domain governing the targeted truth"`
	TruthKind string   `json:"truth_kind" jsonschema:"the epistemic truth_kind (KRD §13.4)"`
	Approvers []string `json:"approvers" jsonschema:"the required approver roles (all must grant to admit)"`
	Veto      []string `json:"veto,omitempty" jsonschema:"roles that block admission if present"`
	Status    string   `json:"status,omitempty" jsonschema:"the proposal's SELF-ASSERTED status — NEVER trusted (proposed|admitted)"`
	Granted   []string `json:"granted,omitempty" jsonschema:"the roles that ACTUALLY granted approval/veto"`
}

type applyGateOutput struct {
	// Admitted is the RE-DERIVED verdict (from the authority graph), never the self-asserted field.
	Admitted bool `json:"admitted"`
	// RefusalCode is the BlockReason code when not admitted (PROPOSAL_NOT_ADMITTED), else empty.
	RefusalCode string `json:"refusal_code,omitempty"`
	// Explanation / HowToFix surface the actionable door when refused.
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
	// WroteTruth is ALWAYS false — the gate emits a verdict, it writes no truth.
	WroteTruth bool `json:"wrote_truth"`
}

func (s *server) applyGate(_ context.Context, _ *mcp.CallToolRequest, in applyGateInput) (*mcp.CallToolResult, applyGateOutput, error) {
	roles := func(xs []string) []authority.Role {
		out := make([]authority.Role, 0, len(xs))
		for _, x := range xs {
			out = append(out, authority.Role(x))
		}
		return out
	}
	g := authority.AuthorityGraph{
		Domain:    in.Domain,
		TruthKind: authority.TruthKind(in.TruthKind),
		Approvers: roles(in.Approvers),
		Veto:      roles(in.Veto),
	}
	prop := agentloop.Proposal{Domain: in.Domain, TruthKind: authority.TruthKind(in.TruthKind), Status: in.Status}
	dec := agentloop.ApplyGate(g, prop, roles(in.Granted))
	out := applyGateOutput{Admitted: dec.Admitted, WroteTruth: false}
	if dec.Refusal != nil {
		out.RefusalCode = string(dec.Refusal.Code)
		out.Explanation = dec.Refusal.Explanation
		out.HowToFix = dec.Refusal.HowToFix
	}
	return nil, out, nil
}
