// Command behavior-expander is the AIDOS Kernel behavior-expander MCP server (S76; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S76 (back/kernel/behavior): the behavior RECORD (ownable,
// versioned, taggable, localizable) and the ONE authoritative, deterministic Expand — the single
// function that turns a behavior attached to an entity into its attributes / relations / operations
// / policies / fixtures, and Propose, which wraps that dry-run into a DRAFT ChangeSet (never applied).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the catalogue, a record
// validation verdict, the dry-run expansion and its DRAFT ChangeSet proposal as VALUES, and writes
// NOTHING. There is deliberately no apply tool: applying the DRAFT is S20's commit-gate, freezing the
// expanded source into the kernel stays the /goal flow. This server never touches a DB, never the
// kernel/mirrors/fitness.
//
// Tools (one tool = one backend op):
//
//	behavior_catalogue       — the declared behavior-macro kinds in canonical order (read-only)
//	behavior_validate_record — validate a behavior record (ownable/versioned/taggable/localizable)
//	behavior_expand          — run the ONE Expand → the dry-run expansion (the single function)
//	behavior_propose         — Expand + wrap into a DRAFT ChangeSet (never applied — the wall)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng,
// no I/O. The expansion is code (S76's catalogue), never an LLM judgment; same input → byte-identical
// output (main_test.go + the package property mirror pin it). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
)

// ── Tool I/O types ──

type catalogueInput struct{}

type catalogueOutput struct {
	Behaviors []string `json:"behaviors"`
}

type recordInput struct {
	Kind    string            `json:"kind" jsonschema:"the catalogue behavior kind (ownable|soft-deletable|auditable)"`
	Owner   string            `json:"owner" jsonschema:"the record owner (ownable) — required"`
	Version int               `json:"version" jsonschema:"the record version (versioned) — >= 1"`
	Tags    []string          `json:"tags,omitempty" jsonschema:"free classification tags (taggable)"`
	Labels  map[string]string `json:"labels" jsonschema:"per-locale display labels (localizable); a 'fr' label is required"`
}

func (r recordInput) toRecord() behavior.Record {
	return behavior.Record{
		Kind:    behavior.Kind(r.Kind),
		Owner:   r.Owner,
		Version: r.Version,
		Tags:    r.Tags,
		Labels:  r.Labels,
	}
}

type validateOutput struct {
	// OK is true iff the record is well-formed (ownable/versioned/taggable/localizable).
	OK bool `json:"ok"`
	// Error is the actionable refusal message when OK is false — verbatim from S76, never invented.
	Error string `json:"error,omitempty"`
	// RecordID is the content-address of a valid record's identity.
	RecordID string `json:"record_id,omitempty"`
}

type shapeInput struct {
	Attributes []string `json:"attributes,omitempty" jsonschema:"attribute names already on the entity (idempotence)"`
	Relations  []string `json:"relations,omitempty" jsonschema:"relation names already on the entity"`
	Operations []string `json:"operations,omitempty" jsonschema:"operation names already on the entity"`
	Policies   []string `json:"policies,omitempty" jsonschema:"policy names already on the entity"`
	Fixtures   []string `json:"fixtures,omitempty" jsonschema:"fixture names already on the entity"`
}

func (s shapeInput) toShape() behavior.Shape {
	return behavior.Shape{
		Attributes: s.Attributes,
		Relations:  s.Relations,
		Operations: s.Operations,
		Policies:   s.Policies,
		Fixtures:   s.Fixtures,
	}
}

type expandInput struct {
	Behavior string     `json:"behavior" jsonschema:"the catalogue behavior kind"`
	Entity   string     `json:"entity" jsonschema:"the entity the behavior is attached to"`
	Existing shapeInput `json:"existing,omitempty" jsonschema:"the entity's current shape (for idempotent expansion)"`
}

type pieceOutput struct {
	Attributes []behavior.Attribute `json:"attributes,omitempty"`
	Relations  []behavior.Relation  `json:"relations,omitempty"`
	Operations []behavior.Operation `json:"operations,omitempty"`
	Policies   []behavior.Policy    `json:"policies,omitempty"`
	Fixtures   []behavior.Fixture   `json:"fixtures,omitempty"`
}

type expandOutput struct {
	OK          bool        `json:"ok"`
	Error       string      `json:"error,omitempty"`
	Behavior    string      `json:"behavior,omitempty"`
	Entity      string      `json:"entity,omitempty"`
	ExpansionID string      `json:"expansion_id,omitempty"`
	WroteKernel bool        `json:"wrote_kernel"` // ALWAYS false (the wall)
	PieceCount  int         `json:"piece_count,omitempty"`
	Preview     []string    `json:"preview,omitempty"` // sorted piece names
	Pieces      pieceOutput `json:"pieces,omitempty"`
}

type proposeInput struct {
	Record      recordInput `json:"record" jsonschema:"the behavior record being attached (ownable/versioned/taggable/localizable)"`
	Entity      string      `json:"entity" jsonschema:"the entity the behavior is attached to"`
	Existing    shapeInput  `json:"existing,omitempty" jsonschema:"the entity's current shape (for idempotent expansion)"`
	ParentPhase string      `json:"parent_phase" jsonschema:"the stable phase the DRAFT ChangeSet moves from"`
}

type proposeOutput struct {
	OK              bool        `json:"ok"`
	Error           string      `json:"error,omitempty"`
	Behavior        string      `json:"behavior,omitempty"`
	Entity          string      `json:"entity,omitempty"`
	ExpansionID     string      `json:"expansion_id,omitempty"`
	WroteKernel     bool        `json:"wrote_kernel"` // ALWAYS false (the wall)
	ChangeSetRef    string      `json:"changeset_ref,omitempty"`
	ChangeSetStatus string      `json:"changeset_status,omitempty"` // always DRAFT on success
	RecordID        string      `json:"record_id,omitempty"`
	PieceCount      int         `json:"piece_count,omitempty"`
	Preview         []string    `json:"preview,omitempty"`
	Pieces          pieceOutput `json:"pieces,omitempty"`
}

func toPieces(e behavior.Expansion) pieceOutput {
	return pieceOutput{
		Attributes: e.Attributes,
		Relations:  e.Relations,
		Operations: e.Operations,
		Policies:   e.Policies,
		Fixtures:   e.Fixtures,
	}
}

// catalogueTool returns the declared catalogue in canonical order — the library a screen renders. PURE.
func catalogueTool(_ context.Context, _ *mcp.CallToolRequest, _ catalogueInput) (*mcp.CallToolResult, catalogueOutput, error) {
	cat := behavior.Catalogue()
	out := make([]string, 0, len(cat))
	for _, k := range cat {
		out = append(out, string(k))
	}
	return nil, catalogueOutput{Behaviors: out}, nil
}

// validateTool validates a behavior record (the four §24.6 clauses) and content-addresses it. PURE.
func validateTool(_ context.Context, _ *mcp.CallToolRequest, in recordInput) (*mcp.CallToolResult, validateOutput, error) {
	r := in.toRecord()
	if err := behavior.ValidateRecord(r); err != nil {
		return nil, validateOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, validateOutput{OK: true, RecordID: behavior.RecordID(r)}, nil
}

// expandTool runs the ONE authoritative Expand → the dry-run expansion. Writes NOTHING. PURE.
func expandTool(_ context.Context, _ *mcp.CallToolRequest, in expandInput) (*mcp.CallToolResult, expandOutput, error) {
	e, err := behavior.Expand(behavior.Attachment{
		Behavior: behavior.Kind(in.Behavior),
		Entity:   in.Entity,
		Existing: in.Existing.toShape(),
	})
	if err != nil {
		return nil, expandOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, expandOutput{
		OK:          true,
		Behavior:    string(e.Behavior),
		Entity:      e.Entity,
		ExpansionID: e.ExpansionID,
		WroteKernel: e.WroteKernel,
		PieceCount:  behavior.PieceCount(e),
		Preview:     behavior.SortedNames(e),
		Pieces:      toPieces(e),
	}, nil
}

// proposeTool runs Expand and wraps it into a DRAFT ChangeSet — never applied (the wall). PURE.
func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	a := behavior.Attachment{
		Behavior: behavior.Kind(in.Record.Kind),
		Entity:   in.Entity,
		Existing: in.Existing.toShape(),
	}
	p, err := behavior.Propose(a, in.Record.toRecord(), in.ParentPhase)
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, proposeOutput{
		OK:              true,
		Behavior:        string(p.Expansion.Behavior),
		Entity:          p.Expansion.Entity,
		ExpansionID:     p.Expansion.ExpansionID,
		WroteKernel:     p.Expansion.WroteKernel,
		ChangeSetRef:    p.ChangeSet.ID,
		ChangeSetStatus: string(p.ChangeSet.Status),
		RecordID:        p.RecordID,
		PieceCount:      behavior.PieceCount(p.Expansion),
		Preview:         behavior.SortedNames(p.Expansion),
		Pieces:          toPieces(p.Expansion),
	}, nil
}

// newMCPServer builds the MCP server and registers the four S76 tools. NO apply tool: applying the
// DRAFT is S20's commit-gate, freezing is the /goal flow — this server is pure computation (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-behavior-expander", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_catalogue", Description: "S76: the declared behavior-macro kinds in canonical order. Read-only."}, catalogueTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_validate_record", Description: "S76: validate a behavior record (ownable/versioned/taggable/localizable) and content-address it. Writes nothing."}, validateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_expand", Description: "S76: run the ONE authoritative Expand → the dry-run expansion (attributes/relations/operations/policies/fixtures). Deterministic, idempotent; writes nothing (the wall)."}, expandTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behavior_propose", Description: "S76: Expand a behavior record onto an entity and wrap the dry-run into a DRAFT ChangeSet — never applied (the wall). Approval rides /goal."}, proposeTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("behavior-expander: run: %w", err))
	}
}
