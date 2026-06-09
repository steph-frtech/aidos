// Command truth-approval is the AIDOS Kernel/Auth TRUTH-APPROVAL MCP server (S110; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S110 truth-write approval flow (back/kernel/truthapproval):
// EVERY truth-write via the cockpit passes `propose → ChangeSet → approval` gated by the bound
// AuthorityGraph (approver/veto/escalation, S63) at the right TruthScope, with CONTENT-ADDRESSED
// optimistic-lock concurrency control on the kernel head — two concurrent applies onto the same
// head: the FIRST lands, the SECOND is REFUSED (STALE_HEAD), NEVER last-write-wins (anti-overwrite
// §9). An override of a block is a RECORDED decision (provenance + ADR, KRD §8), never a bypass.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it DECIDES admission and RETURNS the
// envelope the aidos CLI (the only truth-writer) would apply; it writes NOTHING to
// kernel/mirrors/fitness. There is no direct truth-write tool: a cockpit member PROPOSES, the gate
// + the optimistic lock decide.
//
// Tools (one tool = one backend op):
//
//	truth_propose         — propose a cockpit truth-write → run the AuthorityGraph gate (no head move)
//	truth_approve         — the two-phase gate: AuthorityGraph + optimistic-lock on head → apply or refuse
//	truth_apply_concurrent — a batch against ONE start head: at most one lands, the rest go STALE_HEAD
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the judge is
// the deterministic gate + the content-addressed head, never the LLM. Same input → same verdict.
// The reproducibility mirrors (truthapproval_property_test.go + lib/truth-approval.test.ts) pin it.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/truthapproval"
)

// applyAt is the FIXED apply timestamp the server uses so the flow stays a pure function (the
// engine takes applied_at as an argument — CLAUDE.md §6 no arg-less time.Now()).
var applyAt = time.Date(2026, 6, 9, 0, 0, 0, 0, time.UTC)

// ── shared input shapes ──

type graphIn struct {
	Domain     string   `json:"domain" jsonschema:"the AuthorityGraph domain the write is scoped to (e.g. checkout)"`
	TruthKind  string   `json:"truth_kind" jsonschema:"the epistemic kind (one of the seven KRD §13.4 kinds)"`
	Approvers  []string `json:"approvers" jsonschema:"the roles that must ALL grant approval (non-empty)"`
	Veto       []string `json:"veto,omitempty" jsonschema:"the roles that block admission if present (veto dominates)"`
	Escalation []string `json:"escalation,omitempty" jsonschema:"the roles a partial approval is escalated to"`
}

type deltaIn struct {
	Kind   string `json:"kind" jsonschema:"the change_type: add|remove|refine"`
	Target string `json:"target" jsonschema:"the layer/entity the delta touches (e.g. Order.discount)"`
	Body   string `json:"body,omitempty" jsonschema:"the opaque AST payload (verbatim JSON)"`
}

type proposalIn struct {
	Actor     string   `json:"actor" jsonschema:"the proposing member identity (provenance, never placeholder — KRD §8)"`
	Domain    string   `json:"domain" jsonschema:"the truth domain (matches the graph)"`
	TruthKind string   `json:"truth_kind" jsonschema:"the truth epistemic kind"`
	Head      string   `json:"head" jsonschema:"the kernel head (parent-phase content hash) the proposer observed — the optimistic-lock token"`
	Granted   []string `json:"granted" jsonschema:"the roles that have granted approval/veto for THIS proposal"`
	Label     string   `json:"label" jsonschema:"the human name of the envelope"`
	Spec      *deltaIn `json:"spec,omitempty" jsonschema:"the spec plane of the envelope"`
	Mirror    *deltaIn `json:"mirror,omitempty" jsonschema:"the mirror plane (a spec without a mirror is a monster, refused by completeness)"`
}

type overrideIn struct {
	By     string `json:"by" jsonschema:"the actor who overrides (provenance)"`
	Reason string `json:"reason" jsonschema:"the human justification"`
	ADR    string `json:"adr" jsonschema:"the decision record the override is justified by (e.g. ADR-0016)"`
}

type decisionOut struct {
	Actor        string   `json:"actor"`
	Outcome      string   `json:"outcome"` // applied|blocked|escalated|stale_head
	Admission    string   `json:"admission"`
	BlockCode    string   `json:"block_code,omitempty"`
	Explanation  string   `json:"explanation,omitempty"`
	HowToFix     []string `json:"how_to_fix,omitempty"`
	EnvelopeID   string   `json:"envelope_id,omitempty"`
	EnvelopeStat string   `json:"envelope_status,omitempty"`
	NewHead      string   `json:"new_head,omitempty"`
	StaleAgainst string   `json:"stale_against,omitempty"`
	OverrideBy   string   `json:"override_by,omitempty"`
	OverrideADR  string   `json:"override_adr,omitempty"`
}

// ── adapters ──

func toRoles(ss []string) []authority.Role {
	out := make([]authority.Role, 0, len(ss))
	for _, s := range ss {
		out = append(out, authority.Role(s))
	}
	return out
}

func toGraph(g graphIn) authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:     g.Domain,
		TruthKind:  authority.TruthKind(g.TruthKind),
		Approvers:  toRoles(g.Approvers),
		Veto:       toRoles(g.Veto),
		Escalation: toRoles(g.Escalation),
	}
}

func toDelta(d *deltaIn) *changeset.Delta {
	if d == nil {
		return nil
	}
	var body []byte
	if d.Body != "" {
		body = []byte(d.Body)
	}
	return &changeset.Delta{Kind: d.Kind, Target: d.Target, Body: body}
}

func toProposal(p proposalIn) truthapproval.Proposal {
	return truthapproval.Proposal{
		Actor:   truthapproval.Actor(p.Actor),
		Truth:   authority.Truth{Domain: p.Domain, TruthKind: authority.TruthKind(p.TruthKind)},
		Head:    p.Head,
		Granted: toRoles(p.Granted),
		Label:   p.Label,
		Spec:    toDelta(p.Spec),
		Mirror:  toDelta(p.Mirror),
	}
}

func toDecisionOut(d truthapproval.Decision) decisionOut {
	out := decisionOut{
		Actor:        string(d.Actor),
		Outcome:      string(d.Outcome),
		Admission:    string(d.Admission.Decision),
		EnvelopeID:   d.Envelope.ID,
		EnvelopeStat: string(d.Envelope.Status),
		NewHead:      d.NewHead,
		StaleAgainst: d.StaleAgainst,
	}
	if d.Admission.BlockReason != nil {
		out.BlockCode = string(d.Admission.BlockReason.Code)
		out.Explanation = d.Admission.BlockReason.Explanation
		out.HowToFix = d.Admission.BlockReason.HowToFix
	}
	if d.Override != nil {
		out.OverrideBy = string(d.Override.By)
		out.OverrideADR = d.Override.ADR
	}
	return out
}

func toOverride(o *overrideIn) *truthapproval.OverrideRecord {
	if o == nil {
		return nil
	}
	return &truthapproval.OverrideRecord{By: truthapproval.Actor(o.By), Reason: o.Reason, ADR: o.ADR}
}

// ── tools ──

type proposeInput struct {
	Graph    graphIn    `json:"graph"`
	Proposal proposalIn `json:"proposal"`
}

func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, decisionOut, error) {
	d := truthapproval.Propose(toGraph(in.Graph), toProposal(in.Proposal))
	return nil, toDecisionOut(d), nil
}

type approveInput struct {
	Graph    graphIn     `json:"graph"`
	Proposal proposalIn  `json:"proposal"`
	LiveHead string      `json:"live_head" jsonschema:"the kernel head AT APPLY TIME (read just before); a proposal whose head != live_head is refused STALE_HEAD"`
	Override *overrideIn `json:"override,omitempty" jsonschema:"an OPTIONAL fully-recorded override (KRD §8) — converts a gate block into an admitted write; an unrecorded override is ignored"`
}

func approveTool(_ context.Context, _ *mcp.CallToolRequest, in approveInput) (*mcp.CallToolResult, decisionOut, error) {
	d := truthapproval.Approve(toGraph(in.Graph), toProposal(in.Proposal), in.LiveHead, applyAt, toOverride(in.Override))
	return nil, toDecisionOut(d), nil
}

type concurrentInput struct {
	Graph     graphIn      `json:"graph"`
	StartHead string       `json:"start_head" jsonschema:"the head ALL proposals observed; the first admitted+fresh apply moves it, the rest go STALE_HEAD"`
	Proposals []proposalIn `json:"proposals" jsonschema:"the concurrent proposals, in submitted order"`
}

type concurrentOutput struct {
	Decisions    []decisionOut `json:"decisions"`
	AppliedCount int           `json:"applied_count"` // anti-overwrite §9: ≤ 1 for same-target same-head proposals
	Stale        []string      `json:"stale"`         // the actors who must re-run their mirrors (merge-semantic, S25)
}

func concurrentTool(_ context.Context, _ *mcp.CallToolRequest, in concurrentInput) (*mcp.CallToolResult, concurrentOutput, error) {
	ps := make([]truthapproval.Proposal, 0, len(in.Proposals))
	for _, p := range in.Proposals {
		ps = append(ps, toProposal(p))
	}
	ds := truthapproval.ApplyConcurrent(toGraph(in.Graph), in.StartHead, ps, applyAt)
	out := concurrentOutput{Decisions: make([]decisionOut, 0, len(ds)), AppliedCount: truthapproval.AppliedCount(ds)}
	for _, d := range ds {
		out.Decisions = append(out.Decisions, toDecisionOut(d))
	}
	for _, a := range truthapproval.StaleProposals(ds) {
		out.Stale = append(out.Stale, string(a))
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-truth-approval", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "truth_propose", Description: "S110: propose a cockpit truth-write — build the DRAFT ChangeSet envelope and run the AuthorityGraph gate (S63). A veto dominates (blocked/VETOED); no approver granted is blocked/MISSING_AUTHORITY_APPROVAL; partial approval is escalated; all approvers is admitted (ready for truth_approve). Propose does NOT move the head — a propose never writes truth (the wall)."}, proposeTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "truth_approve", Description: "S110: the two-phase truth-write — the AuthorityGraph gate AND the content-addressed optimistic lock on the kernel head. Admitted (or a fully-recorded override, KRD §8) AND a FRESH head (proposal.head == live_head) ⇒ APPLIED, the head moves to the envelope id. A moved head ⇒ refused STALE_HEAD (NEVER last-write-wins, anti-overwrite §9) — the proposer re-runs the mirrors against the new head (merge-semantic, S25)."}, approveTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "truth_apply_concurrent", Description: "S110: apply a BATCH of proposals that all observed ONE start head, in submitted order against a moving live head. At most ONE write lands (applied_count ≤ 1 for same-target same-head proposals); every later same-head proposal is refused STALE_HEAD and surfaces in `stale` (the members who re-run their mirrors). No silent overwrite (anti-overwrite §9)."}, concurrentTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("truth-approval: run: %w", err))
	}
}
