// Command behavior-capture is the AIDOS Runtime behavior-capture MCP server (S67; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S67 (back/runtime/behaviorcapture): at idea-capture the
// reusable behaviours library (S79/S76) is surfaced; attaching one DRY-RUN-EXPANDS it — in
// attributes / relations / operations / policies / fixtures — as a DRAFT ChangeSet PROPOSAL,
// produced by the ONE authoritative behavior.Expand (S76), never a second implementation.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the surfaced library,
// the dry-run expansion + its DRAFT ChangeSet proposal as VALUES, and writes NOTHING.
// Persistence of the proposed DRAFT rides the changeset door (S20) under human approval;
// freezing the expanded source into the kernel stays the /goal flow. This server never touches
// a DB, never touches the kernel/mirrors/fitness. There is deliberately no apply tool.
//
// Tools (one tool = one backend op):
//
//	behavior_library          — the reusable behaviours surfaced at capture (S76 catalogue, canonical order)
//	behavior_attach_at_capture — attach a behavior at a capture → a DRAFT ChangeSet proposal + the expansion preview
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O. The expansion is code (S76's catalogue), never an LLM judgment; same input →
// byte-identical output (behaviorcapture_property_test.go pins it). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/runtime/behaviorcapture"
)

// ── Tool I/O types ──

type libraryInput struct{}

type libraryOutput struct {
	// Behaviors is the reusable behaviours surfaced at capture (S76 catalogue, canonical order).
	Behaviors []string `json:"behaviors"`
}

type shapeInput struct {
	Attributes []string `json:"attributes,omitempty" jsonschema:"attribute names already on the entity (idempotence)"`
	Relations  []string `json:"relations,omitempty" jsonschema:"relation names already on the entity"`
	Operations []string `json:"operations,omitempty" jsonschema:"operation names already on the entity"`
	Policies   []string `json:"policies,omitempty" jsonschema:"policy names already on the entity"`
	Fixtures   []string `json:"fixtures,omitempty" jsonschema:"fixture names already on the entity"`
}

type attachInput struct {
	IdeaRef     string     `json:"idea_ref" jsonschema:"the captured idea the behavior is attached to; required"`
	Behavior    string     `json:"behavior" jsonschema:"the catalogue behavior kind (e.g. ownable|soft-deletable|auditable)"`
	Entity      string     `json:"entity" jsonschema:"the entity the behavior is attached to"`
	Existing    shapeInput `json:"existing,omitempty" jsonschema:"the entity's current shape (for idempotent expansion)"`
	ParentPhase string     `json:"parent_phase" jsonschema:"the stable phase the DRAFT ChangeSet moves from"`
}

type pieceOutput struct {
	Attributes []behavior.Attribute `json:"attributes,omitempty"`
	Relations  []behavior.Relation  `json:"relations,omitempty"`
	Operations []behavior.Operation `json:"operations,omitempty"`
	Policies   []behavior.Policy    `json:"policies,omitempty"`
	Fixtures   []behavior.Fixture   `json:"fixtures,omitempty"`
}

type attachOutput struct {
	// OK is true iff the attach produced a proposal (no refusal).
	OK bool `json:"ok"`
	// Error is the actionable refusal message when OK is false (ErrNoIdea / S76's unknown-behavior
	// / S76's no-entity) — verbatim, never invented.
	Error string `json:"error,omitempty"`

	IdeaRef       string      `json:"idea_ref,omitempty"`
	Behavior      string      `json:"behavior,omitempty"`
	Entity        string      `json:"entity,omitempty"`
	ExpansionID   string      `json:"expansion_id,omitempty"`
	WroteKernel   bool        `json:"wrote_kernel"` // ALWAYS false (the wall)
	ChangeSetRef  string      `json:"changeset_ref,omitempty"`
	ChangeSetMode string      `json:"changeset_status,omitempty"` // always DRAFT on success
	ProposalID    string      `json:"proposal_id,omitempty"`
	PieceCount    int         `json:"piece_count,omitempty"`
	Preview       []string    `json:"preview,omitempty"` // sorted piece names
	Pieces        pieceOutput `json:"pieces,omitempty"`
}

// library is the behavior_library tool: the reusable behaviours surfaced at capture, in S76's
// canonical order — the capture screen's catalogue. PURE.
func library(_ context.Context, _ *mcp.CallToolRequest, _ libraryInput) (*mcp.CallToolResult, libraryOutput, error) {
	cat := behaviorcapture.Library()
	out := make([]string, 0, len(cat))
	for _, k := range cat {
		out = append(out, string(k))
	}
	return nil, libraryOutput{Behaviors: out}, nil
}

// attach is the behavior_attach_at_capture tool: attach a behavior at a capture → the dry-run
// expansion + its DRAFT ChangeSet PROPOSAL, via the ONE authoritative behavior.Expand (S76).
// Writes NOTHING; persistence rides the changeset door under approval (the wall). PURE.
func attach(_ context.Context, _ *mcp.CallToolRequest, in attachInput) (*mcp.CallToolResult, attachOutput, error) {
	a := behaviorcapture.Attachment{
		Behavior: behaviorcapture.Behavior(in.Behavior),
		Entity:   in.Entity,
		Existing: behavior.Shape{
			Attributes: in.Existing.Attributes,
			Relations:  in.Existing.Relations,
			Operations: in.Existing.Operations,
			Policies:   in.Existing.Policies,
			Fixtures:   in.Existing.Fixtures,
		},
	}
	p, err := behaviorcapture.AttachBehaviorAtCapture(in.IdeaRef, a, in.ParentPhase)
	if err != nil {
		return nil, attachOutput{OK: false, Error: err.Error()}, nil
	}
	pid, err := behaviorcapture.ProposalID(p)
	if err != nil {
		return nil, attachOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, attachOutput{
		OK:            true,
		IdeaRef:       p.IdeaRef,
		Behavior:      string(p.Expansion.Behavior),
		Entity:        p.Expansion.Entity,
		ExpansionID:   p.Expansion.ExpansionID,
		WroteKernel:   p.Expansion.WroteKernel,
		ChangeSetRef:  p.ChangeSet.ID,
		ChangeSetMode: string(p.ChangeSet.Status),
		ProposalID:    pid,
		PieceCount:    behaviorcapture.PieceCount(p),
		Preview:       behaviorcapture.PreviewNames(p),
		Pieces: pieceOutput{
			Attributes: p.Expansion.Attributes,
			Relations:  p.Expansion.Relations,
			Operations: p.Expansion.Operations,
			Policies:   p.Expansion.Policies,
			Fixtures:   p.Expansion.Fixtures,
		},
	}, nil
}

// newMCPServer builds the MCP server and registers the two behavior-capture tools. There is
// deliberately NO apply tool: applying the DRAFT is S20's commit-gate, freezing is the /goal
// flow — this server is pure computation (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-behavior-capture", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_library", Description: "S67: the reusable behaviours library surfaced at idea-capture (the S76 catalogue, canonical order). Read-only."}, library)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_attach_at_capture", Description: "S67: attach a behavior at a capture → a DRAFT ChangeSet proposal (the dry-run expansion of attributes/relations/operations/policies/fixtures) via the ONE authoritative S76 Expand. byte-identical to S76; writes nothing (the wall)."}, attach)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("behavior-capture: run: %w", err))
	}
}
