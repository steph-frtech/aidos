// Command build-approval is the AIDOS Runtime/Auth BUILD-APPROVAL MCP server (S85; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S85 approval seam (back/runtime/buildloop/approval): when
// the build-loop service (S83) reaches green over a truth-implying goal, it PROPOSES a ChangeSet
// (proposed, NEVER admitted); a HUMAN holding the scope's authority (S52 + S63) approves it from
// the Workbench /build-approvals inbox; only THEN does the truth land. The two done-criteria the
// server enforces at the MCP boundary:
//
//  1. An agent DIRECT write above the waterline is refused AGENT_WRITE_ABOVE_WATERLINE
//     (approval_propose only ever yields `proposed`; there is no truth-write tool).
//  2. A proposed truth requires HUMAN approval before it lands (approval_decide admits ONLY on
//     a real human holding the scope's authority — INSUFFICIENT_AUTHORITY otherwise).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it folds the proposal/approval/inbox
// gates as VALUES and writes NOTHING. There is no tool that writes a truth: a green build PROPOSES,
// a human ADMITS via the authority graph; the kernel/mirrors/fitness stay SELECT-only to the agent.
// The downstream kernel write stays the aidos CLI role through /goal once a human admits.
//
// Tools (one tool = one backend op):
//
//	approval_propose — propose a truth the loop's work implied → a `proposed` ChangeSet (never admitted)
//	approval_decide  — the human-approval gate (S63): admit ONLY a real human holding scope authority
//	approval_inbox   — the per-project inbox of pending agent proposals with their mirrors
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the judge is
// the deterministic wall + authority graph, never the LLM. Same input → same verdict. The
// reproducibility mirrors (approval_property_test.go + lib/build-approval.test.ts) pin it.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/authoritybinding"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/approval"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ── Tool I/O types (flat, JSON-schema-tagged for the picker) ──

type proposeInput struct {
	Project   string `json:"project" jsonschema:"the project the truth is scoped to (S53)"`
	AgentID   string `json:"agent_id" jsonschema:"the governed build-loop agent identity that proposed (provenance — an AGENT, never a human)"`
	AgentRun  string `json:"agent_run,omitempty" jsonschema:"the AgentRun content-address whose green build produced this proposal (S52)"`
	Target    string `json:"target" jsonschema:"the write target the truth would write; an above-waterline target (kernel/mirrors/fitness) is a truth"`
	Domain    string `json:"domain" jsonschema:"the kernel domain (the AuthorityGraph scope, e.g. checkout)"`
	TruthKind string `json:"truth_kind" jsonschema:"the epistemic kind (one of the seven KRD §13.4 kinds)"`
	Mirror    string `json:"mirror" jsonschema:"the mirror that PROVES the truth; empty is refused MISSING_MIRROR (a monster)"`
	DiffHash  string `json:"diff_hash,omitempty" jsonschema:"the content-hash of the green diff that produced this truth"`
}

type proposalOut struct {
	ID              string   `json:"id"`
	Status          string   `json:"status"` // always "proposed" out of propose
	Project         string   `json:"project"`
	ProposedByAgent string   `json:"proposed_by_agent"`
	Target          string   `json:"target"`
	Domain          string   `json:"domain"`
	TruthKind       string   `json:"truth_kind"`
	Mirror          string   `json:"mirror"`
	DiffHash        string   `json:"diff_hash,omitempty"`
	AgentRun        string   `json:"agent_run,omitempty"`
	Route           []string `json:"route,omitempty"`
}

type proposeOutput struct {
	Proposed    bool         `json:"proposed"`             // true iff a `proposed` ChangeSet was minted
	Proposal    *proposalOut `json:"proposal,omitempty"`   //
	BlockCode   string       `json:"block_code,omitempty"` // AGENT_WRITE_ABOVE_WATERLINE / MISSING_MIRROR / NOT_A_TRUTH_WRITE
	Explanation string       `json:"explanation,omitempty"`
	HowToFix    []string     `json:"how_to_fix,omitempty"`
}

type decideInput struct {
	// The proposal under decision (its truth scope is what authority keys on).
	Project         string `json:"project" jsonschema:"the project the proposal is scoped to"`
	ProposalID      string `json:"proposal_id" jsonschema:"the content-address of the proposal being decided"`
	Domain          string `json:"domain" jsonschema:"the AuthorityGraph domain of the truth (e.g. checkout)"`
	TruthKind       string `json:"truth_kind" jsonschema:"the epistemic kind of the truth"`
	Mirror          string `json:"mirror" jsonschema:"the mirror proving the truth (carried so the decision is over a proven truth)"`
	Target          string `json:"target" jsonschema:"the truth write target"`
	ProposedByAgent string `json:"proposed_by_agent" jsonschema:"the agent that proposed it (provenance)"`
	// The acting human + the scope authority graph + the member + the declared bindings (S62/S63).
	ActorIdentity string               `json:"actor_identity" jsonschema:"the resolved acting human identity (accounts.users.id, S61); a placeholder is refused"`
	ActorDisplay  string               `json:"actor_display" jsonschema:"the human-readable acting name"`
	MemberRole    string               `json:"member_role" jsonschema:"the acting human's project membership role: owner|editor|viewer (empty ⇒ non-member, grants nothing)"`
	Approvers     []string             `json:"approvers" jsonschema:"the AuthorityGraph approver roles the scope requires"`
	Bindings      []authorityBindingIn `json:"bindings,omitempty" jsonschema:"the declared member-role × domain → authority-role bindings (S63)"`
}

type authorityBindingIn struct {
	Domain         string   `json:"domain,omitempty" jsonschema:"the domain this binding awards roles in (empty ⇒ wildcard)"`
	MinProjectRole string   `json:"min_project_role" jsonschema:"the membership role floor: owner|editor|viewer"`
	Roles          []string `json:"roles" jsonschema:"the authority roles awarded to a qualifying member"`
}

type decideOutput struct {
	Status       string   `json:"status"` // proposed | admitted
	Admitted     bool     `json:"admitted"`
	GrantedRoles []string `json:"granted_roles,omitempty"`
	BlockCode    string   `json:"block_code,omitempty"` // INSUFFICIENT_AUTHORITY | PLACEHOLDER_ACTOR
	Explanation  string   `json:"explanation,omitempty"`
	HowToFix     []string `json:"how_to_fix,omitempty"`
}

type inboxInput struct {
	Project   string         `json:"project" jsonschema:"the project to surface pending proposals for"`
	Proposals []proposeInput `json:"proposals" jsonschema:"the candidate proposals (re-proposed deterministically; the gate filters to this project's pending ones)"`
}

type inboxOutput struct {
	Project string        `json:"project"`
	Pending []proposalOut `json:"pending"`
}

// ── pure adapters into the S85 package ──

func toProposalOut(p approval.AgentTruthProposal) proposalOut {
	return proposalOut{
		ID:              p.ID,
		Status:          string(p.Status),
		Project:         p.Project,
		ProposedByAgent: p.ProposedByAgent,
		Target:          p.Truth.Target,
		Domain:          p.Truth.Domain,
		TruthKind:       string(p.Truth.TruthKind),
		Mirror:          p.Truth.Mirror,
		DiffHash:        p.Truth.DiffHash,
		AgentRun:        p.AgentRun,
		Route:           p.Route,
	}
}

// govSpec builds the governed build-loop spec for an agent id — ALWAYS PeutModifierNoyau:false
// (the wall). The spec only carries the propose right and the identity for provenance.
func govSpec(agentID string) agentlayer.AgentSpec {
	return agentlayer.AgentSpec{ID: agentID, Role: "executor", PeutProposerVerite: true}
}

// propose is the approval_propose tool: propose a truth the loop's work implied. PURE.
func propose(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	p, br := approval.ProposeTruth(govSpec(in.AgentID), in.Project, in.AgentRun, approval.TruthWrite{
		Target:    in.Target,
		Domain:    in.Domain,
		TruthKind: authority.TruthKind(in.TruthKind),
		Mirror:    in.Mirror,
		DiffHash:  in.DiffHash,
	})
	if br != nil {
		return nil, proposeOutput{
			Proposed:    false,
			BlockCode:   string(br.Code),
			Explanation: br.Explanation,
			HowToFix:    br.HowToFix,
		}, nil
	}
	out := toProposalOut(p)
	return nil, proposeOutput{Proposed: true, Proposal: &out}, nil
}

// decide is the approval_decide tool: the human-approval gate (S63). PURE.
func decide(_ context.Context, _ *mcp.CallToolRequest, in decideInput) (*mcp.CallToolResult, decideOutput, error) {
	p := approval.AgentTruthProposal{
		ID:              in.ProposalID,
		Status:          approval.StatusProposed,
		Project:         in.Project,
		ProposedByAgent: in.ProposedByAgent,
		Truth: approval.TruthWrite{
			Target: in.Target, Domain: in.Domain, TruthKind: authority.TruthKind(in.TruthKind), Mirror: in.Mirror,
		},
	}
	graph := authority.AuthorityGraph{
		Domain:    in.Domain,
		TruthKind: authority.TruthKind(in.TruthKind),
		Approvers: toRoles(in.Approvers),
	}
	actor := authoritybinding.RealActor{Identity: in.ActorIdentity, Display: in.ActorDisplay}
	var m *membership.Membership
	if r := membership.Role(in.MemberRole); r.IsValid() {
		m = &membership.Membership{Identity: in.ActorIdentity, ProjectID: in.Project, Role: r}
	}
	d := approval.Decide(p, graph, actor, m, toBindings(in.Bindings))

	out := decideOutput{Status: string(d.Status), Admitted: d.Status == approval.StatusAdmitted}
	for _, r := range d.Decision.GrantedRoles {
		out.GrantedRoles = append(out.GrantedRoles, string(r))
	}
	if d.BlockReason != nil {
		out.BlockCode = string(d.BlockReason.Code)
		out.Explanation = d.BlockReason.Explanation
		out.HowToFix = d.BlockReason.HowToFix
	}
	return nil, out, nil
}

// inbox is the approval_inbox tool: the per-project pending-proposal projection. PURE.
func inbox(_ context.Context, _ *mcp.CallToolRequest, in inboxInput) (*mcp.CallToolResult, inboxOutput, error) {
	all := make([]approval.AgentTruthProposal, 0, len(in.Proposals))
	for _, pr := range in.Proposals {
		p, br := approval.ProposeTruth(govSpec(pr.AgentID), pr.Project, pr.AgentRun, approval.TruthWrite{
			Target: pr.Target, Domain: pr.Domain, TruthKind: authority.TruthKind(pr.TruthKind), Mirror: pr.Mirror, DiffHash: pr.DiffHash,
		})
		if br != nil {
			continue // a malformed candidate is simply not surfaced (it never minted a proposal)
		}
		all = append(all, p)
	}
	ib := approval.BuildInbox(in.Project, all)
	out := inboxOutput{Project: ib.Project, Pending: make([]proposalOut, 0, len(ib.Pending))}
	for _, p := range ib.Pending {
		out.Pending = append(out.Pending, toProposalOut(p))
	}
	return nil, out, nil
}

func toRoles(ss []string) []authority.Role {
	out := make([]authority.Role, 0, len(ss))
	for _, s := range ss {
		out = append(out, authority.Role(s))
	}
	return out
}

func toBindings(bs []authorityBindingIn) []authoritybinding.AuthorityRoleBinding {
	out := make([]authoritybinding.AuthorityRoleBinding, 0, len(bs))
	for _, b := range bs {
		out = append(out, authoritybinding.AuthorityRoleBinding{
			Domain:         b.Domain,
			MinProjectRole: membership.Role(b.MinProjectRole),
			Roles:          toRoles(b.Roles),
		})
	}
	return out
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-build-approval", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "approval_propose", Description: "S85: when the build loop's work implies a truth, PROPOSE a ChangeSet (proposed, NEVER admitted). An above-waterline truth target is the only legitimate input; a below-the-line target is refused NOT_A_TRUTH_WRITE; a truth with no mirror is refused MISSING_MIRROR (a monster). There is NO truth-write tool — the agent owns implementation, never truth (the wall)."}, propose)
	mcp.AddTool(srv, &mcp.Tool{Name: "approval_decide", Description: "S85: the HUMAN-approval gate (S52 + S63). A proposed truth lands (admitted) ONLY when a REAL human holding the scope's authority approves; a member without that authority is refused INSUFFICIENT_AUTHORITY, a placeholder actor PLACEHOLDER_ACTOR, and the proposal STAYS proposed. The verdict is re-derived from the authority graph + the member's real roles — never the proposal's self-asserted status."}, decide)
	mcp.AddTool(srv, &mcp.Tool{Name: "approval_inbox", Description: "S85: the per-project APPROVAL INBOX — the pending `proposed` agent proposals awaiting human approval, each carrying its mirror (no headless approval: the human approves WHAT IS PROVEN). Admitted (landed) proposals are excluded; project-isolated; stable sorted order."}, inbox)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("build-approval: run: %w", err))
	}
}
