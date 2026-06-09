// Command collab is the AIDOS Runtime/Workbench COLLABORATION MCP server (S113; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S113 collaboration substrate (back/runtime/collab): the
// social plane of a project — identified provenance, comments on ideas/miroirs/changesets, an
// activity feed, real-time presence with concurrent-edit protection, and the AdoptionStage
// ladder surfaced PER PROJECT. Each tool first asks the S62 membership authority "may THIS
// resolved identity perform THIS act?" and stamps the act with the REAL actor (provenance
// never a placeholder). It builds on S110 (a member without administer authority can never
// approve).
//
// THE WALL (CLAUDE.md §2): every tool is BELOW the line — comments/shares/invites/feed/presence
// act directly in the `collab` below-the-line zone; the server writes NO kernel/mirrors/fitness.
// The only truth-implying act (approving a ChangeSet) is the S110/S85 propose→ChangeSet path —
// collab_authorize only AUTHORIZES it and records the provenance; the truth-write stays the
// build-approval/aidos-CLI path.
//
// Tools (one tool = one backend op):
//
//	collab_authorize — the S62/S110 authority gate over a social act (comment/share/invite/approve)
//	collab_comment   — record a content-addressed comment on an idea/miroir/changeset (real author)
//	collab_invite    — record a content-addressed invite/role-grant (administer only; real inviter)
//	collab_feed      — append + project a project's activity feed (real actors, deterministic order)
//	collab_presence  — join a shared canvas / claim the edit lock (two users, no overwrite)
//	collab_stage     — the per-project AdoptionStage ladder (current stage + next dent, gate computed)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the judge is
// the deterministic membership authority + the pure ladder, never the LLM. Same input → same
// verdict. The reproducibility mirrors (collab_property_test.go + lib/collab.test.ts) pin it.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/collab"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ── shared actor resolution ──

// actorInput is the resolved-identity envelope every social tool carries. A blank identity
// is refused UNIDENTIFIED_ACTOR by the pure authority (provenance never a placeholder).
type actorInput struct {
	Identity string `json:"identity" jsonschema:"the resolved caller identity (S61) performing the act — never a placeholder"`
	Project  string `json:"project" jsonschema:"the project the act is scoped to (S53)"`
	Role     string `json:"role,omitempty" jsonschema:"the actor's membership role in the project (owner|editor|viewer); omitted = non-member"`
}

// actor builds a collab.Actor from the envelope; a present, valid role yields a membership
// row, an absent/invalid role yields a non-member (the authority then refuses NOT_A_MEMBER).
func (in actorInput) actor() collab.Actor {
	a := collab.Actor{Identity: in.Identity, ProjectID: in.Project}
	r := membership.Role(in.Role)
	if r.IsValid() {
		if m, err := membership.NewMembership(in.Identity, in.Project, r); err == nil {
			a.Member = &m
		}
	}
	return a
}

func decisionFields(d collab.Decision) (allowed bool, code, explanation string, howToFix []string) {
	if d.Verdict == collab.VerdictAllow {
		return true, "", "", nil
	}
	if d.BlockReason != nil {
		return false, string(d.BlockReason.Code), d.BlockReason.Explanation, d.BlockReason.HowToFix
	}
	return false, "DENIED", "", nil
}

// ── collab_authorize ──

type authorizeInput struct {
	actorInput
	Act string `json:"act" jsonschema:"the social act to authorize: comment|share|invite|approve"`
}
type authorizeOutput struct {
	Allowed     bool     `json:"allowed"`
	Code        string   `json:"code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func authorize(_ context.Context, _ *mcp.CallToolRequest, in authorizeInput) (*mcp.CallToolResult, authorizeOutput, error) {
	d := collab.Authorize(in.actor(), collab.Act(in.Act))
	ok, code, expl, fix := decisionFields(d)
	return nil, authorizeOutput{Allowed: ok, Code: code, Explanation: expl, HowToFix: fix}, nil
}

// ── collab_comment ──

type commentInput struct {
	actorInput
	TargetKind string `json:"target_kind" jsonschema:"what the comment anchors to: idea|mirror|changeset"`
	TargetID   string `json:"target_id" jsonschema:"the commented record's id"`
	Body       string `json:"body" jsonschema:"the comment text (non-empty)"`
}
type commentOutput struct {
	Recorded    bool     `json:"recorded"`
	ID          string   `json:"id,omitempty"`
	Author      string   `json:"author,omitempty"` // the REAL actor — never a placeholder.
	TargetKind  string   `json:"target_kind,omitempty"`
	TargetID    string   `json:"target_id,omitempty"`
	Code        string   `json:"code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func comment(_ context.Context, _ *mcp.CallToolRequest, in commentInput) (*mcp.CallToolResult, commentOutput, error) {
	c, d, err := in.actor().Comment(collab.TargetKind(in.TargetKind), in.TargetID, in.Body)
	if err != nil {
		return nil, commentOutput{}, err
	}
	if d.Verdict != collab.VerdictAllow {
		_, code, expl, fix := decisionFields(d)
		return nil, commentOutput{Recorded: false, Code: code, Explanation: expl, HowToFix: fix}, nil
	}
	return nil, commentOutput{
		Recorded: true, ID: c.ID, Author: c.Author,
		TargetKind: string(c.TargetKind), TargetID: c.TargetID,
	}, nil
}

// ── collab_invite ──

type inviteInput struct {
	actorInput
	Invitee string `json:"invitee" jsonschema:"the identity to invite/grant a role to"`
	Grant   string `json:"grant" jsonschema:"the role to grant: owner|editor|viewer"`
}
type inviteOutput struct {
	Recorded    bool     `json:"recorded"`
	ID          string   `json:"id,omitempty"`
	Inviter     string   `json:"inviter,omitempty"` // the REAL actor — never a placeholder.
	Invitee     string   `json:"invitee,omitempty"`
	Grant       string   `json:"grant,omitempty"`
	Code        string   `json:"code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func invite(_ context.Context, _ *mcp.CallToolRequest, in inviteInput) (*mcp.CallToolResult, inviteOutput, error) {
	iv, d, err := in.actor().Invite(in.Invitee, membership.Role(in.Grant))
	if err != nil {
		return nil, inviteOutput{}, err
	}
	if d.Verdict != collab.VerdictAllow {
		_, code, expl, fix := decisionFields(d)
		return nil, inviteOutput{Recorded: false, Code: code, Explanation: expl, HowToFix: fix}, nil
	}
	return nil, inviteOutput{
		Recorded: true, ID: iv.ID, Inviter: iv.Inviter, Invitee: iv.Invitee, Grant: string(iv.Role),
	}, nil
}

// ── collab_feed ──

type feedEntryIn struct {
	Identity string `json:"identity" jsonschema:"the actor of this feed entry (real identity)"`
	Project  string `json:"project" jsonschema:"the project scope"`
	Act      string `json:"act" jsonschema:"the act: comment|share|invite|approve"`
	Target   string `json:"target" jsonschema:"a description/ref of what was acted on"`
	Seq      int    `json:"seq" jsonschema:"the monotone sequence number (deterministic order, not a clock)"`
}
type feedInput struct {
	Append  *feedEntryIn  `json:"append,omitempty" jsonschema:"an entry to append (authorized + stamped before recording)"`
	Entries []feedEntryIn `json:"entries,omitempty" jsonschema:"existing entries to project into the canonical feed order"`
}
type feedOut struct {
	ID     string `json:"id"`
	Actor  string `json:"actor"`
	Act    string `json:"act"`
	Target string `json:"target"`
	Seq    int    `json:"seq"`
}
type feedOutput struct {
	Feed        []feedOut `json:"feed"`
	Code        string    `json:"code,omitempty"`
	Explanation string    `json:"explanation,omitempty"`
	HowToFix    []string  `json:"how_to_fix,omitempty"`
}

func toFeedOut(e collab.FeedEntry) feedOut {
	return feedOut{ID: e.ID, Actor: e.Actor, Act: string(e.Act), Target: e.Target, Seq: e.Seq}
}

func feed(_ context.Context, _ *mcp.CallToolRequest, in feedInput) (*mcp.CallToolResult, feedOutput, error) {
	var entries []collab.FeedEntry
	for _, e := range in.Entries {
		fe, d, err := collab.Actor{Identity: e.Identity, ProjectID: e.Project}.Record(collab.Act(e.Act), e.Target, e.Seq)
		if err != nil {
			return nil, feedOutput{}, err
		}
		if d.Verdict != collab.VerdictAllow { // an unidentified historical actor is dropped (never recorded).
			continue
		}
		entries = append(entries, fe)
	}
	if in.Append != nil {
		a := in.Append
		fe, d, err := collab.Actor{Identity: a.Identity, ProjectID: a.Project}.Record(collab.Act(a.Act), a.Target, a.Seq)
		if err != nil {
			return nil, feedOutput{}, err
		}
		if d.Verdict != collab.VerdictAllow {
			_, code, expl, fix := decisionFields(d)
			return nil, feedOutput{Code: code, Explanation: expl, HowToFix: fix}, nil
		}
		entries = append(entries, fe)
	}
	ordered := collab.Feed(entries)
	out := make([]feedOut, 0, len(ordered))
	for _, e := range ordered {
		out = append(out, toFeedOut(e))
	}
	return nil, feedOutput{Feed: out}, nil
}

// ── collab_presence ──

type presenceIn struct {
	Identity string `json:"identity" jsonschema:"the user joining/editing the canvas (real identity)"`
	Project  string `json:"project" jsonschema:"the project scope"`
}
type presenceInput struct {
	CanvasID string       `json:"canvas_id" jsonschema:"the shared surface (a canvas S75 / a mirror S68)"`
	Project  string       `json:"project" jsonschema:"the project the canvas belongs to"`
	Present  []presenceIn `json:"present,omitempty" jsonschema:"users already present on the canvas"`
	Join     *presenceIn  `json:"join,omitempty" jsonschema:"a user joining the canvas (adds, never overwrites)"`
	ClaimBy  string       `json:"claim_lock_by,omitempty" jsonschema:"identity claiming the edit lock (never silently steals a held lock)"`
}
type presenceOutput struct {
	CanvasID    string   `json:"canvas_id"`
	Present     []string `json:"present"` // the distinct identities present (sorted).
	Count       int      `json:"count"`   // PresentCount.
	LockHolder  string   `json:"lock_holder,omitempty"`
	Code        string   `json:"code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func buildCanvas(in presenceInput) collab.Canvas {
	c := collab.Canvas{CanvasID: in.CanvasID, ProjectID: in.Project}
	for _, p := range in.Present {
		c, _ = c.Join(collab.Actor{Identity: p.Identity, ProjectID: p.Project})
	}
	return c
}

func presenceOut(c collab.Canvas, d collab.Decision) presenceOutput {
	out := presenceOutput{CanvasID: c.CanvasID, Count: c.PresentCount(), LockHolder: c.LockHolder}
	for _, p := range c.Present {
		out.Present = append(out.Present, p.Identity)
	}
	if d.Verdict != collab.VerdictAllow {
		_, code, expl, fix := decisionFields(d)
		out.Code, out.Explanation, out.HowToFix = code, expl, fix
	}
	return out
}

func presence(_ context.Context, _ *mcp.CallToolRequest, in presenceInput) (*mcp.CallToolResult, presenceOutput, error) {
	c := buildCanvas(in)
	last := collab.Decision{Verdict: collab.VerdictAllow}
	if in.Join != nil {
		c, last = c.Join(collab.Actor{Identity: in.Join.Identity, ProjectID: in.Join.Project})
	}
	if in.ClaimBy != "" {
		c, last = c.ClaimLock(collab.Actor{Identity: in.ClaimBy, ProjectID: in.Project})
	}
	return nil, presenceOut(c, last), nil
}

// ── collab_stage ──

type stageInput struct {
	Project      string   `json:"project" jsonschema:"the project whose AdoptionStage ladder to compute"`
	Capabilities []string `json:"capabilities,omitempty" jsonschema:"the project's live capability view (drives the ladder)"`
}
type stageGapOut struct {
	Stage   string `json:"stage"`
	Missing string `json:"missing"`
	Reason  string `json:"reason"`
}
type stageOutput struct {
	Project      string        `json:"project"`
	Current      string        `json:"current"`
	Next         string        `json:"next,omitempty"`
	NextGaps     []stageGapOut `json:"next_gaps,omitempty"`
	AllSatisfied bool          `json:"all_satisfied"`
	CanAdvance   bool          `json:"can_advance"`
	GateReason   string        `json:"gate_reason,omitempty"`
}

func stage(_ context.Context, _ *mcp.CallToolRequest, in stageInput) (*mcp.CallToolResult, stageOutput, error) {
	caps := make([]adoption.Capability, 0, len(in.Capabilities))
	for _, c := range in.Capabilities {
		caps = append(caps, adoption.Capability(c))
	}
	ps := collab.StageFor(in.Project, caps)
	ok, reason := ps.CanAdvance()
	out := stageOutput{
		Project:      in.Project,
		Current:      string(ps.CurrentStage()),
		Next:         string(ps.NextStage()),
		AllSatisfied: ps.Plan.AllSatisfied,
		CanAdvance:   ok,
	}
	for _, g := range ps.Plan.NextGaps {
		out.NextGaps = append(out.NextGaps, stageGapOut{Stage: string(g.Stage), Missing: string(g.Missing), Reason: g.Reason})
	}
	if reason != nil {
		out.GateReason = reason.Explanation
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-collab", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_authorize", Description: "S113: the S62/S110 authority gate over a social act (comment|share|invite|approve). An unidentified actor is refused UNIDENTIFIED_ACTOR (provenance never a placeholder); a non-member NOT_A_MEMBER; a member without administer authority is refused ROLE_FORBIDDEN for invite/approve (a member without authority can never approve). Pure — the membership authority is the judge, never the LLM."}, authorize)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_comment", Description: "S113: record a content-addressed comment on an idea|mirror|changeset, stamped with the REAL acting user (provenance never a placeholder). Any member may comment; an unidentified actor or empty body is refused. Below the line — writes no truth."}, comment)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_invite", Description: "S113: record a content-addressed invite/role-grant, stamped with the REAL inviter. Administer (owner) only — a viewer/editor is refused ROLE_FORBIDDEN. It records WHO invited WHOM with what role; the membership row itself is the S62 below-the-line store."}, invite)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_feed", Description: "S113: append to + project a project's append-only activity feed. Every entry is stamped with the REAL actor (an unidentified historical actor is dropped, an unidentified append refused). The order is deterministic (Seq, then id) — no clock."}, feed)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_presence", Description: "S113: real-time presence on a shared canvas (S75) / mirror (S68). Joining ADDS a presence — two users see each other WITHOUT overwriting. Claiming the edit lock never silently steals a held lock (a concurrent claim is refused). Pure — deterministic present set."}, presence)
	mcp.AddTool(srv, &mcp.Tool{Name: "collab_stage", Description: "S113: the per-project AdoptionStage ladder (§82.5) surfaced in product — the project's CURRENT stage and the NEXT dent (the smallest ratchet that clicks) with its blocking gaps. The advance is COMPUTED (can_advance true only when the next dent's gate is reached — done is computed), never declared. Pure — delegates to the S47 ladder."}, stage)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("collab: run: %w", err))
	}
}
