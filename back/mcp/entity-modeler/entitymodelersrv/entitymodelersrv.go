// Package entitymodelersrv is the AIDOS Workbench entity/relation MODELER MCP server, exposed as a
// LIBRARY (S59/ADR 0092 batch-4B dispatcher reuse). It is the capability door over the S75 modeler
// (back/kernel/entities/modeler): the canvas-side engine that shapes a draft entity/relation schema
// and PROPOSES it as a project-scoped Kernel source via propose → ChangeSet → approval.
//
// Tools (one tool = one backend op, ADR 0009):
//
//	schema_validate — validate a draft (resolve every relation, refuse UNKNOWN_RELATION_TARGET / FK-target-without-identifier)
//	schema_hash     — canonical, input-order-invariant content address of the draft
//	schema_propose  — produce a `proposed` (DRAFT) ChangeSet carrying the canonical draft — NEVER applies (the wall)
//	canvas_merge    — CRDT-style three-way merge of two editors' drafts (no overwrite, conflicts surfaced)
//	canvas_presence — join/leave/lock presence on the canvas (advisory)
//
// THE WALL (CLAUDE.md §2): every tool is PURE COMPUTATION. schema_propose returns a DRAFT ChangeSet
// (content-addressed); it writes NO truth — only the `aidos` CLI applies an approved changeset. A
// reject leaves the kernel intact (Propose never touched it).
//
// THE DISPATCH SURFACE (S59/ADR 0092). The gateway dispatcher (back/runtime/gatewaydispatch) dispatches
// only the FOUR pure READ tools — schema_validate · schema_hash · canvas_merge · canvas_presence — each
// a CHEAP/pure compute whose I/O is a scalar OBJECT (no json.RawMessage body — the S59 byte-array
// transport scar avoided by construction). schema_propose stays EXPOSED by the server (the stdio binary
// + CI use it) but is NOT dispatched: its output carries a changeset.ChangeSet whose Delta.Body is a
// json.RawMessage (the byte-array output scar the HTTP edge rejects) AND it is a truth-PROPOSAL the
// front never fires synchronously — the move goes through the changeset commit gate under approval (the
// same precedent as arch-fitness `propose`, registry.go:130). The /entity-modeler panel keeps its
// propose→ChangeSet voie propre (the wall).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): no clock, no rng, no LLM enters the server — the code judges.
//
// WHY A LIBRARY (S59/ADR 0092). Extracting the handlers here lets BOTH the standalone stdio binary
// (back/mcp/entity-modeler) and the gateway dispatcher construct identical behaviour — no twin (reuse,
// don't reinvent — CLAUDE.md §0).
package entitymodelersrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/entities/modeler"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── schema_validate ──

type validateInput struct {
	Draft modeler.Draft `json:"draft" jsonschema:"the canvas draft (project + entity nodes with relations)"`
}
type validateOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOutput, error) {
	if err := modeler.Validate(in.Draft); err != nil {
		br := modeler.BlockInvalid(err)
		return nil, validateOutput{OK: false, Block: &br}, nil
	}
	return nil, validateOutput{OK: true}, nil
}

// ── schema_hash ──

type hashInput struct {
	Draft modeler.Draft `json:"draft" jsonschema:"the canvas draft to content-address"`
}
type hashOutput struct {
	OK   bool   `json:"ok"`
	Hash string `json:"hash,omitempty"`
}

func schemaHash(_ context.Context, _ *mcp.CallToolRequest, in hashInput) (*mcp.CallToolResult, hashOutput, error) {
	h, err := modeler.SchemaHash(in.Draft)
	if err != nil {
		return nil, hashOutput{OK: false}, nil
	}
	return nil, hashOutput{OK: true, Hash: h}, nil
}

// ── schema_propose (EXPOSED, not dispatched — the RawMessage scar; propose → ChangeSet → approval) ──

type proposeInput struct {
	Draft       modeler.Draft `json:"draft" jsonschema:"the canvas draft to propose as a Kernel source"`
	ParentPhase string        `json:"parent_phase" jsonschema:"the stable phase the proposal moves from"`
}
type proposeOutput struct {
	OK         bool                     `json:"ok"`
	ChangeSet  *changeset.ChangeSet     `json:"changeset,omitempty"`
	SchemaHash string                   `json:"schema_hash,omitempty"`
	Block      *blockreason.BlockReason `json:"block,omitempty"`
}

func propose(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	prop, err := modeler.Propose(in.Draft, in.ParentPhase)
	if err != nil {
		br := modeler.BlockInvalid(err)
		return nil, proposeOutput{OK: false, Block: &br}, nil
	}
	cs := prop.ChangeSet
	return nil, proposeOutput{OK: true, ChangeSet: &cs, SchemaHash: prop.SchemaHash}, nil
}

// ── canvas_merge ──

type mergeInput struct {
	Base modeler.Draft `json:"base" jsonschema:"the common base draft both editors forked from"`
	A    modeler.Draft `json:"a" jsonschema:"editor A's draft"`
	B    modeler.Draft `json:"b" jsonschema:"editor B's draft"`
}

func merge(_ context.Context, _ *mcp.CallToolRequest, in mergeInput) (*mcp.CallToolResult, modeler.MergeOutcome, error) {
	return nil, modeler.MergeDrafts(in.Base, in.A, in.B), nil
}

// ── canvas_presence ──

type presenceInput struct {
	Current modeler.PresenceSet `json:"current" jsonschema:"the current presence set"`
	Op      string              `json:"op" jsonschema:"join | leave"`
	Editor  string              `json:"editor" jsonschema:"the acting editor (provenance, never a placeholder)"`
	Lock    string              `json:"lock,omitempty" jsonschema:"the entity node to soft-lock on join (advisory)"`
}

func presence(_ context.Context, _ *mcp.CallToolRequest, in presenceInput) (*mcp.CallToolResult, modeler.PresenceSet, error) {
	switch in.Op {
	case "leave":
		return nil, in.Current.Leave(in.Editor), nil
	default:
		return nil, in.Current.Join(modeler.Presence{Editor: in.Editor, LockedNode: in.Lock}), nil
	}
}

// NewServer builds the entity-modeler MCP server and registers the five S75 tools. Every tool is PURE;
// schema_propose writes nothing (the wall — propose → ChangeSet → approval). Reused identically by the
// standalone stdio binary AND the gateway dispatcher (S59) — no twin.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-entity-modeler", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "schema_validate", Description: "S75: validate a canvas draft — resolve every relation against the declared entity set (refuse UNKNOWN_RELATION_TARGET, never guessed) and refuse an FK-target with no identifier. PURE, writes nothing (the wall)."}, validate)
	mcp.AddTool(srv, &mcp.Tool{Name: "schema_hash", Description: "S75: canonical, INPUT-ORDER-INVARIANT content address of a draft schema (same logical nodes → same hash whatever the edit order). PURE."}, schemaHash)
	mcp.AddTool(srv, &mcp.Tool{Name: "schema_propose", Description: "S75: produce a `proposed` (DRAFT) ChangeSet carrying the canonical draft as a project-scoped Kernel source — propose → ChangeSet → approval. NEVER applies (the wall); a reject leaves the kernel intact."}, propose)
	mcp.AddTool(srv, &mcp.Tool{Name: "canvas_merge", Description: "S75: CRDT-style three-way merge of two editors' drafts off a common base — no editor's add is silently overwritten; divergent edits are surfaced as conflicts (anti-overwrite). PURE, deterministic."}, merge)
	mcp.AddTool(srv, &mcp.Tool{Name: "canvas_presence", Description: "S75: join/leave/soft-lock presence on the canvas — two editors see each other; the lock is advisory (the merge is the authority). PURE."}, presence)
	return srv
}
