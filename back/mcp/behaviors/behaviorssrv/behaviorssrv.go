// Package behaviorssrv (extracted, ADR 0092 batch-2) is the reusable is the AIDOS Kernel behavior-LIBRARY MCP server (S79; ADR 0009: every backend
// op is an MCP tool). It is the capability door over the S79 project-scoped behavior LIBRARY
// (back/kernel/behavior/library.go) — the seven user-facing gestures the /behaviors Workbench route
// drives:
//
//	behaviors_browse        — list a project's live library records in canonical order (project-scoped)
//	behaviors_search        — deterministic `rg`-like substring/word match (NEVER an LLM)
//	behaviors_tag           — add a free tag to a record (re-keys; the tag becomes searchable)
//	behaviors_publish       — publish a record (monotone flag)
//	behaviors_soft_delete   — soft-delete a record (hidden by default, never destroyed)
//	behaviors_comment       — append a comment (append-only thread)
//	behaviors_attach        — PREVIEW the expansion (scoped policies+fixtures via the ONE S76 Propose)
//	                          and LAND it via an APPROVED ChangeSet (the wall: propose → approve)
//
// PROJECT-SCOPED + STATELESS. The server is PURE COMPUTATION (CLAUDE.md §6/§8): the caller passes the
// project's library records (the materialised state); each tool is a pure function of state + input
// and returns the new state / verdict as VALUES. It writes NOTHING to a DB and never touches the
// kernel/mirrors/fitness (the wall). `attach` LANDS via changeset.Apply, which itself only COMPUTES
// the APPLIED envelope value — the actual kernel freeze is the `aidos` CLI's job downstream. The
// search matcher is a code substring match, NEVER an LLM. Transport: stdio.
package behaviorssrv

import (
	"context"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
)

// ── shared record I/O (the S76 record shape, mirrored here for the wire) ──

type recordInput struct {
	Kind      string            `json:"kind" jsonschema:"the catalogue behavior kind (ownable|soft-deletable|auditable)"`
	Owner     string            `json:"owner" jsonschema:"the record owner (ownable) — required"`
	Version   int               `json:"version" jsonschema:"the record version (versioned) — >= 1"`
	Tags      []string          `json:"tags,omitempty" jsonschema:"free classification tags (taggable)"`
	Labels    map[string]string `json:"labels" jsonschema:"per-locale labels (localizable); a 'fr' label is required"`
	Published bool              `json:"published,omitempty" jsonschema:"library publish flag"`
	Deleted   bool              `json:"deleted,omitempty" jsonschema:"library soft-delete flag"`
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

type entryOutput struct {
	RecordID  string            `json:"record_id"`
	Kind      string            `json:"kind"`
	Owner     string            `json:"owner"`
	Version   int               `json:"version"`
	Tags      []string          `json:"tags,omitempty"`
	Labels    map[string]string `json:"labels"`
	Published bool              `json:"published"`
	Deleted   bool              `json:"deleted"`
	Comments  int               `json:"comments"`
}

func toEntryOutput(e behavior.LibEntry) entryOutput {
	return entryOutput{
		RecordID:  behavior.RecordID(e.Record),
		Kind:      string(e.Record.Kind),
		Owner:     e.Record.Owner,
		Version:   e.Record.Version,
		Tags:      e.Record.Tags,
		Labels:    e.Record.Labels,
		Published: e.Published,
		Deleted:   e.Deleted,
		Comments:  len(e.Comments),
	}
}

// buildLibrary materialises a Library value from the caller-supplied project state. PURE — no DB.
func buildLibrary(projectID string, recs []recordInput) (behavior.Library, error) {
	lib := behavior.NewLibrary(projectID)
	for _, r := range recs {
		var err error
		var id string
		lib, id, err = lib.Add(r.toRecord())
		if err != nil {
			return lib, err
		}
		if r.Published {
			lib, _ = lib.Publish(id)
		}
		if r.Deleted {
			lib, _ = lib.SoftDelete(id)
		}
	}
	return lib, nil
}

// ── browse ──

type browseInput struct {
	ProjectID      string        `json:"project_id" jsonschema:"the project the library is scoped to"`
	Records        []recordInput `json:"records,omitempty" jsonschema:"the project's library records (materialised state)"`
	IncludeDeleted bool          `json:"include_deleted,omitempty" jsonschema:"include soft-deleted records (the trash view)"`
}

type listOutput struct {
	OK        bool          `json:"ok"`
	Error     string        `json:"error,omitempty"`
	ProjectID string        `json:"project_id,omitempty"`
	Entries   []entryOutput `json:"entries"`
	Count     int           `json:"count"`
}

func browseTool(_ context.Context, _ *mcp.CallToolRequest, in browseInput) (*mcp.CallToolResult, listOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, listOutput{OK: false, Error: err.Error()}, nil
	}
	es := lib.Browse(in.IncludeDeleted)
	out := make([]entryOutput, 0, len(es))
	for _, e := range es {
		out = append(out, toEntryOutput(e))
	}
	return nil, listOutput{OK: true, ProjectID: in.ProjectID, Entries: out, Count: len(out)}, nil
}

// ── search ──

type searchInput struct {
	ProjectID string        `json:"project_id" jsonschema:"the project the library is scoped to"`
	Records   []recordInput `json:"records,omitempty" jsonschema:"the project's library records"`
	Query     string        `json:"query" jsonschema:"the deterministic search query (substring/word match — NEVER an LLM)"`
}

func searchTool(_ context.Context, _ *mcp.CallToolRequest, in searchInput) (*mcp.CallToolResult, listOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, listOutput{OK: false, Error: err.Error()}, nil
	}
	es := lib.Search(in.Query)
	out := make([]entryOutput, 0, len(es))
	for _, e := range es {
		out = append(out, toEntryOutput(e))
	}
	return nil, listOutput{OK: true, ProjectID: in.ProjectID, Entries: out, Count: len(out)}, nil
}

// ── tag / publish / soft-delete / comment (single-record gestures) ──

type gestureInput struct {
	ProjectID string        `json:"project_id" jsonschema:"the project the library is scoped to"`
	Records   []recordInput `json:"records" jsonschema:"the project's library records"`
	RecordID  string        `json:"record_id" jsonschema:"the target record's content id"`
	Tag       string        `json:"tag,omitempty" jsonschema:"the tag to add (tag gesture)"`
	Author    string        `json:"author,omitempty" jsonschema:"the comment author (comment gesture)"`
	Body      string        `json:"body,omitempty" jsonschema:"the comment body (comment gesture)"`
	At        string        `json:"at,omitempty" jsonschema:"RFC3339 comment timestamp (comment gesture)"`
}

type gestureOutput struct {
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	RecordID string `json:"record_id,omitempty"` // may change on tag (content-addressed)
	Note     string `json:"note,omitempty"`
}

func tagTool(_ context.Context, _ *mcp.CallToolRequest, in gestureInput) (*mcp.CallToolResult, gestureOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	_, newID, err := lib.Tag(in.RecordID, in.Tag)
	if err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, gestureOutput{OK: true, RecordID: newID, Note: "tag added; record re-keyed (content-addressed)"}, nil
}

func publishTool(_ context.Context, _ *mcp.CallToolRequest, in gestureInput) (*mcp.CallToolResult, gestureOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	if _, err := lib.Publish(in.RecordID); err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, gestureOutput{OK: true, RecordID: in.RecordID, Note: "published"}, nil
}

func softDeleteTool(_ context.Context, _ *mcp.CallToolRequest, in gestureInput) (*mcp.CallToolResult, gestureOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	if _, err := lib.SoftDelete(in.RecordID); err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, gestureOutput{OK: true, RecordID: in.RecordID, Note: "soft-deleted (hidden by default, never destroyed)"}, nil
}

func commentTool(_ context.Context, _ *mcp.CallToolRequest, in gestureInput) (*mcp.CallToolResult, gestureOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	at := time.Time{}
	if in.At != "" {
		if parsed, perr := time.Parse(time.RFC3339, in.At); perr == nil {
			at = parsed
		}
	}
	if _, err := lib.Comment(in.RecordID, in.Author, in.Body, at); err != nil {
		return nil, gestureOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, gestureOutput{OK: true, RecordID: in.RecordID, Note: "comment appended"}, nil
}

// ── attach (preview + land) ──

type shapeInput struct {
	Attributes []string `json:"attributes,omitempty"`
	Relations  []string `json:"relations,omitempty"`
	Operations []string `json:"operations,omitempty"`
	Policies   []string `json:"policies,omitempty"`
	Fixtures   []string `json:"fixtures,omitempty"`
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

type attachInput struct {
	ProjectID   string        `json:"project_id" jsonschema:"the project the library is scoped to"`
	Records     []recordInput `json:"records" jsonschema:"the project's library records"`
	RecordID    string        `json:"record_id" jsonschema:"the library record being attached"`
	Entity      string        `json:"entity" jsonschema:"the entity the behavior is attached to"`
	Existing    shapeInput    `json:"existing,omitempty" jsonschema:"the entity's current shape (for idempotent expansion)"`
	ParentPhase string        `json:"parent_phase" jsonschema:"the stable phase the ChangeSet moves from"`
	Land        bool          `json:"land,omitempty" jsonschema:"if true, LAND via an approved (APPLIED) ChangeSet; else preview only"`
	ApprovedAt  string        `json:"approved_at,omitempty" jsonschema:"RFC3339 approval timestamp (required when land=true)"`
}

type attachOutput struct {
	OK              bool               `json:"ok"`
	Error           string             `json:"error,omitempty"`
	Behavior        string             `json:"behavior,omitempty"`
	Entity          string             `json:"entity,omitempty"`
	ExpansionID     string             `json:"expansion_id,omitempty"`
	WroteKernel     bool               `json:"wrote_kernel"` // ALWAYS false (the wall)
	Policies        []behavior.Policy  `json:"policies,omitempty"`
	Fixtures        []behavior.Fixture `json:"fixtures,omitempty"`
	Preview         []string           `json:"preview,omitempty"`
	ChangeSetRef    string             `json:"changeset_ref,omitempty"`
	ChangeSetStatus string             `json:"changeset_status,omitempty"` // DRAFT (preview) or APPLIED (landed)
	Landed          bool               `json:"landed"`
	BlockCode       string             `json:"block_code,omitempty"`
}

func attachTool(_ context.Context, _ *mcp.CallToolRequest, in attachInput) (*mcp.CallToolResult, attachOutput, error) {
	lib, err := buildLibrary(in.ProjectID, in.Records)
	if err != nil {
		return nil, attachOutput{OK: false, Error: err.Error()}, nil
	}
	if !in.Land {
		prop, perr := lib.PreviewAttach(in.RecordID, in.Entity, in.Existing.toShape(), in.ParentPhase)
		if perr != nil {
			return nil, attachOutput{OK: false, Error: perr.Error()}, nil
		}
		e := prop.Expansion
		return nil, attachOutput{
			OK: true, Behavior: string(e.Behavior), Entity: e.Entity, ExpansionID: e.ExpansionID,
			WroteKernel: e.WroteKernel, Policies: e.Policies, Fixtures: e.Fixtures,
			Preview: behavior.SortedNames(e), ChangeSetRef: prop.ChangeSet.ID,
			ChangeSetStatus: string(prop.ChangeSet.Status), Landed: false,
		}, nil
	}
	approvedAt := time.Time{}
	if in.ApprovedAt != "" {
		if parsed, perr := time.Parse(time.RFC3339, in.ApprovedAt); perr == nil {
			approvedAt = parsed
		}
	}
	landed, br, lerr := lib.LandAttach(in.RecordID, in.Entity, in.Existing.toShape(), in.ParentPhase, approvedAt)
	if lerr != nil {
		return nil, attachOutput{OK: false, Error: lerr.Error()}, nil
	}
	if br != nil {
		return nil, attachOutput{OK: false, Error: br.Error(), BlockCode: string(br.Code)}, nil
	}
	e := landed.Preview.Expansion
	return nil, attachOutput{
		OK: true, Behavior: string(e.Behavior), Entity: e.Entity, ExpansionID: e.ExpansionID,
		WroteKernel: e.WroteKernel, Policies: e.Policies, Fixtures: e.Fixtures,
		Preview: behavior.SortedNames(e), ChangeSetRef: landed.Applied.ID,
		ChangeSetStatus: string(landed.Applied.Status), Landed: true,
	}, nil
}

// newMCPServer registers the seven S79 library tools. Every tool is PURE; `attach` lands via
// changeset.Apply (a value computation), never a direct kernel write (the wall).
// NewServer builds the deterministic, dependency-free MCP server. Gateway dispatcher +
// stdio binary share it (one server, no twin). Pure: no DSN, no clock.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-behaviors", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_browse", Description: "S79: list a project's live library records in canonical order (project-scoped). Read-only."}, browseTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_search", Description: "S79: deterministic `rg`-like substring/word match over a project's library (NEVER an LLM). Read-only."}, searchTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_tag", Description: "S79: add a free tag to a library record (re-keys content-addressed; the tag becomes searchable). Writes nothing."}, tagTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_publish", Description: "S79: publish a library record (monotone flag). Writes nothing."}, publishTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_soft_delete", Description: "S79: soft-delete a library record (hidden by default, never destroyed — append-only). Writes nothing."}, softDeleteTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_comment", Description: "S79: append a comment to a library record (append-only thread). Writes nothing."}, commentTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "behaviors_attach", Description: "S79: PREVIEW the expansion (scoped policies+fixtures via the ONE S76 Propose) and LAND it via an APPROVED ChangeSet (the wall: propose → approve). Deterministic; no direct kernel write."}, attachTool)
	return srv
}
