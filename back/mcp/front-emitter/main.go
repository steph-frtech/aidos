// Command front-emitter is the AIDOS Runtime emitted-app FRONT-END emitter MCP server (S93;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S93 (back/runtime/frontemit): the deterministic emitter that
// projects the project's Kernel entities + controls into the emitted app's FRONT-END (Hono
// JSX/SSR — OQ-0040-front DECIDED):
//
//	emit_front   — the whole front: the navigation index + one create-form per entity (scalars
//	               + blob uploads + relation selects) + the control+action verticale rendered to
//	               real buttons (each carrying its control-spec fixture as a data-aidos-fixture
//	               sensor). Returns every artifact.
//	emit_bundle  — the concatenated front bundle (the byte-identity surface: same Kernel →
//	               byte-identical bundle, the S93 reproducibility done-criterion).
//	front_hash   — the front spec's content address (input-order-invariant).
//
// THE WALL (CLAUDE.md §2): this server is PURE PROJECTION — it renders code as VALUES and
// writes NOTHING to the kernel/mirrors/fitness. The emitted bytes are a projection (S78 owns
// regeneration). A malformed spec is a typed BlockReason, never a partial render.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same Kernel cut → byte-identical output (the S93 done-criterion).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

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

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-front-emitter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_front", Description: "S93: emit the emitted app's whole front — navigation index + one create-form per entity (scalars+blob uploads+relation selects) + the control+action verticale as real buttons (each carrying its control-spec fixture as a sensor). PURE, byte-identical, writes nothing (the wall)."}, emitFront)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_bundle", Description: "S93: emit the concatenated front bundle — the byte-identity surface (same Kernel → byte-identical bundle, the reproducibility done-criterion). PURE, writes nothing."}, emitBundle)
	mcp.AddTool(srv, &mcp.Tool{Name: "front_hash", Description: "S93: the front spec's content address (records.Hash of its canonical body) — input-order-invariant. PURE."}, frontHash)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("front-emitter: run: %w", err))
	}
}
