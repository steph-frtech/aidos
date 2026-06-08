// Command shape-editor is the AIDOS Mirror shape-editor MCP server (S68; ADR 0009: every backend
// op is an MCP tool).
//
// It is the capability door over S68 (back/runtime/shapeeditor): a human authors a mirror by its
// FORM, the form is DERIVED from the truth-nature, the source is PARSED by a pure parser, and the
// red, project-scoped mirror is wrapped as a DRAFT ChangeSet PROPOSAL. Two concurrent edits of the
// same draft MERGE (disjoint) or LOCK (same-field clash) — never last-write-wins.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the derivation, the parse,
// the merge verdict, and the DRAFT ChangeSet proposal as VALUES, and writes NOTHING. Persistence of
// the proposed DRAFT rides the changeset door (S20) under human approval; freezing into the mirrors
// schema stays the /goal flow. There is deliberately no apply tool.
//
// Tools (one tool = one backend op):
//
//	shape_derive   — derive the mirror form from a truth-nature (the closed table)
//	shape_parse    — parse a shape source (pure parser; returns the typed spec or a refusal)
//	shape_merge    — merge two concurrent draft edits (merge | lock, never last-write-wins)
//	shape_propose  — author a red, project-scoped mirror → a DRAFT ChangeSet proposal
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no
// rng, no I/O. Shape selection + parsing are pure functions, never an LLM. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// ── shape_derive ──

type deriveInput struct {
	Nature string `json:"nature" jsonschema:"the truth-nature: acceptance | invariant | workflow"`
}

type deriveOutput struct {
	OK           bool   `json:"ok"`
	Error        string `json:"error,omitempty"`
	Shape        string `json:"shape,omitempty"`
	TestKind     string `json:"test_kind,omitempty"`
	CertLanguage string `json:"cert_language,omitempty"`
}

func derive(_ context.Context, _ *mcp.CallToolRequest, in deriveInput) (*mcp.CallToolResult, deriveOutput, error) {
	d, err := shapeeditor.DeriveShape(shapeeditor.TruthNature(in.Nature))
	if err != nil {
		return nil, deriveOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, deriveOutput{
		OK:           true,
		Shape:        string(d.Shape),
		TestKind:     string(d.TestKind),
		CertLanguage: string(d.CertLanguage),
	}, nil
}

// ── shape_parse ──

type parseInput struct {
	Shape  string `json:"shape" jsonschema:"the mirror form: gherkin | property | fixture"`
	Source string `json:"source" jsonschema:"the authored source text for that form"`
}

type parseOutput struct {
	OK    bool                   `json:"ok"`
	Error string                 `json:"error,omitempty"`
	Spec  shapeeditor.ParsedSpec `json:"spec,omitempty"`
}

func parse(_ context.Context, _ *mcp.CallToolRequest, in parseInput) (*mcp.CallToolResult, parseOutput, error) {
	spec, err := shapeeditor.Parse(shapeeditor.Shape(in.Shape), in.Source)
	if err != nil {
		return nil, parseOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, parseOutput{OK: true, Spec: spec}, nil
}

// ── shape_merge ──

type editInput struct {
	Author      string  `json:"author"`
	BaseVersion int     `json:"base_version"`
	Title       *string `json:"title,omitempty"`
	Source      *string `json:"source,omitempty"`
}

type mergeInput struct {
	Draft shapeeditor.Draft `json:"draft" jsonschema:"the draft both authors edit"`
	A     editInput         `json:"a" jsonschema:"author A's edit"`
	B     editInput         `json:"b" jsonschema:"author B's edit"`
}

type mergeOutput struct {
	OK        bool                       `json:"ok"`
	Error     string                     `json:"error,omitempty"`
	Locked    bool                       `json:"locked"` // true ⇒ a draft-level lock (same-field clash)
	Conflicts []shapeeditor.EditConflict `json:"conflicts,omitempty"`
	Merged    shapeeditor.Draft          `json:"merged,omitempty"`
}

func toEdit(e editInput) shapeeditor.Edit {
	return shapeeditor.Edit{Author: e.Author, BaseVersion: e.BaseVersion, Title: e.Title, Source: e.Source}
}

func merge(_ context.Context, _ *mcp.CallToolRequest, in mergeInput) (*mcp.CallToolResult, mergeOutput, error) {
	merged, conflicts, err := shapeeditor.MergeEdits(in.Draft, toEdit(in.A), toEdit(in.B))
	if err != nil {
		// A lock (DRAFT_EDIT_CONFLICT) is a verdict, not a server error — surface the conflicts.
		return nil, mergeOutput{OK: false, Locked: len(conflicts) > 0, Conflicts: conflicts, Error: err.Error(), Merged: in.Draft}, nil
	}
	return nil, mergeOutput{OK: true, Merged: merged}, nil
}

// ── shape_propose ──

type proposeInput struct {
	Draft       shapeeditor.Draft `json:"draft" jsonschema:"the authored draft (project-scoped, derived shape, source)"`
	ParentPhase string            `json:"parent_phase" jsonschema:"the stable phase the DRAFT ChangeSet moves from"`
}

type proposeOutput struct {
	OK              bool                   `json:"ok"`
	Error           string                 `json:"error,omitempty"`
	ProjectID       string                 `json:"project_id,omitempty"`
	MirrorID        string                 `json:"mirror_id,omitempty"`
	TestKind        string                 `json:"test_kind,omitempty"`
	CertLanguage    string                 `json:"cert_language,omitempty"`
	Liveness        string                 `json:"liveness,omitempty"` // "dead" ⇒ born red
	Red             bool                   `json:"red"`
	WroteMirror     bool                   `json:"wrote_mirror"` // ALWAYS false (the wall)
	ChangeSetRef    string                 `json:"changeset_ref,omitempty"`
	ChangeSetStatus string                 `json:"changeset_status,omitempty"` // always DRAFT on success
	Spec            shapeeditor.ParsedSpec `json:"spec,omitempty"`
}

func propose(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	p, err := shapeeditor.ProposeMirror(in.Draft, in.ParentPhase)
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, proposeOutput{
		OK:              true,
		ProjectID:       p.ProjectID,
		MirrorID:        p.Mirror.MirrorID,
		TestKind:        string(p.Mirror.TestKind),
		CertLanguage:    string(p.Mirror.CertLanguage),
		Liveness:        string(p.Mirror.Liveness),
		Red:             shapeeditor.IsRed(p),
		WroteMirror:     p.WroteMirror,
		ChangeSetRef:    p.ChangeSet.ID,
		ChangeSetStatus: string(p.ChangeSet.Status),
		Spec:            p.Parsed,
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-shape-editor", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "shape_derive", Description: "S68: derive the mirror form from a truth-nature (acceptance→gherkin, invariant→property, workflow→fixture) — the closed table, never a guess. PURE."}, derive)
	mcp.AddTool(srv, &mcp.Tool{Name: "shape_parse", Description: "S68: parse a shape source for its form (pure parser; returns the typed spec or a typed refusal). Never an LLM. PURE."}, parse)
	mcp.AddTool(srv, &mcp.Tool{Name: "shape_merge", Description: "S68: merge two concurrent draft edits — disjoint fields MERGE, same-field clash LOCKS (DRAFT_EDIT_CONFLICT, both candidates surfaced), never last-write-wins. PURE."}, merge)
	mcp.AddTool(srv, &mcp.Tool{Name: "shape_propose", Description: "S68: author a red, project-scoped mirror → a DRAFT ChangeSet proposal. Born red (liveness=dead); writes nothing (the wall). PURE."}, propose)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("shape-editor: run: %w", err))
	}
}
