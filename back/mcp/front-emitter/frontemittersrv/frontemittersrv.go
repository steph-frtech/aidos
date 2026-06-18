// Package frontemittersrv is the AIDOS Runtime emitted-app FRONT-END emitter MCP server (S93; ADR 0009:
// every backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse, ADR 0092).
//
// It is the capability door over S93 (back/runtime/frontemit): the deterministic emitter that projects
// the project's Kernel entities + controls into the emitted app's FRONT-END (Hono JSX/SSR —
// OQ-0040-front DECIDED):
//
//	emit_front   — the whole front: the navigation index + one create-form per entity (scalars + blob
//	               uploads + relation selects) + the control+action verticale rendered to real buttons
//	               (each carrying its control-spec fixture as a data-aidos-fixture sensor). Returns every artifact.
//	emit_bundle  — the concatenated front bundle (same Kernel → byte-identical bundle, the S93 done-criterion).
//	front_hash   — the front spec's content address (input-order-invariant).
//
// THE WALL (CLAUDE.md §2): this server is PURE PROJECTION — it renders code as VALUES and writes NOTHING
// to the kernel/mirrors/fitness. The emitted bytes are a projection (S78 owns regeneration). A malformed
// spec is a typed BlockReason, never a partial render.
//
// S59 DISPATCH NOTE (ADR 0092). The emitted bytes ride on frontemit.Artifact.Bytes, a Go `[]byte` field
// — which the go-sdk reflects as a JSON ARRAY-of-numbers schema (NOT the base64 string a json.RawMessage
// reflects to), so a real HTTP args:{object} payload survives the round-trip (the deploy `plan`
// precedent: program.bytes is a number-array). All three tools dispatch synchronously over HTTP.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng, no
// I/O, never an LLM. Same Kernel cut → byte-identical output (the S93 done-criterion).
//
// WHY A LIBRARY (S59). The gateway dispatcher reuses this SAME server in-process; extracting the handler
// here (rather than the old package-main) lets BOTH the standalone stdio binary (back/mcp/front-emitter)
// and the dispatcher construct identical behaviour — no duplicated logic, no twin (CLAUDE.md §0).
package frontemittersrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/frontemit"
)

type frontInput struct {
	Spec frontemit.FrontSpec `json:"spec" jsonschema:"the front spec: project + the project's entities (scalars+blobs+relations) and controls (each bound to an operation with its control-spec fixtures)"`
}

type filesOutput struct {
	OK    bool                     `json:"ok"`
	Files []frontemit.Artifact     `json:"files,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

type artifactOutput struct {
	OK       bool                     `json:"ok"`
	Artifact *frontemit.Artifact      `json:"artifact,omitempty"`
	Block    *blockreason.BlockReason `json:"block,omitempty"`
}

type hashOutput struct {
	OK   bool   `json:"ok"`
	Hash string `json:"hash,omitempty"`
}

func emitFront(_ context.Context, _ *mcp.CallToolRequest, in frontInput) (*mcp.CallToolResult, filesOutput, error) {
	arts, br := frontemit.EmitFront(in.Spec)
	if br != nil {
		return nil, filesOutput{OK: false, Block: br}, nil
	}
	return nil, filesOutput{OK: true, Files: arts}, nil
}

func emitBundle(_ context.Context, _ *mcp.CallToolRequest, in frontInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := frontemit.EmitBundle(in.Spec)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func frontHash(_ context.Context, _ *mcp.CallToolRequest, in frontInput) (*mcp.CallToolResult, hashOutput, error) {
	h, err := frontemit.SourceHash(in.Spec)
	if err != nil {
		return nil, hashOutput{OK: false}, nil
	}
	return nil, hashOutput{OK: true, Hash: h}, nil
}

// NewServer builds the configured front-emitter *mcp.Server and registers the three pure tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway dispatcher.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-front-emitter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_front", Description: "S93: emit the emitted app's whole front — navigation index + one create-form per entity (scalars+blob uploads+relation selects) + the control+action verticale as real buttons (each carrying its control-spec fixture as a sensor). PURE, byte-identical, writes nothing (the wall)."}, emitFront)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_bundle", Description: "S93: emit the concatenated front bundle — the byte-identity surface (same Kernel → byte-identical bundle, the reproducibility done-criterion). PURE, writes nothing."}, emitBundle)
	mcp.AddTool(srv, &mcp.Tool{Name: "front_hash", Description: "S93: the front spec's content address (records.Hash of its canonical body) — input-order-invariant. PURE."}, frontHash)
	return srv
}
