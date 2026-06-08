// Command hono-emitter is the AIDOS Runtime emitted-app SERVER emitter MCP server (S87;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S87 (back/runtime/honoemit): the deterministic emitter that
// projects the project's Kernel operations into a bootable Hono/TS server (ADR 0040) and the
// StackManifest into a Pulumi/TS infra program (ADR 0043):
//
//	emit_server  — the bootable Hono/TS server: main+router+middleware+/healthz+one handler
//	               per SYNC operation (delegating to the Go interpreter callback, ADR 0040 Déc.7).
//	emit_worker  — the async worker (TS): drains the outbox, dispatches typed effects (S73/S74).
//	emit_pulumi  — the Pulumi/TS infra program (ADR 0043): one docker.Container per service on
//	               the shared Traefik network, FN02-pure + byte-stable.
//	server_hash  — the server spec's content address (input-order-invariant).
//	manifest_hash — the StackManifest's content address.
//
// THE WALL (CLAUDE.md §2): this server is PURE PROJECTION — it renders code as VALUES and
// writes NOTHING to the kernel/mirrors/fitness. The emitted bytes are a projection (S78 owns
// regeneration). A malformed spec/manifest is a typed BlockReason, never a partial render.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same Kernel cut → byte-identical output (the S87 done-criterion).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

type serverInput struct {
	Spec honoemit.ServerSpec `json:"spec" jsonschema:"the server spec: project + the FULL set of the project's Kernel operations (sync and async)"`
}

type manifestInput struct {
	Manifest honoemit.StackManifest `json:"manifest" jsonschema:"the StackManifest: app + services (closed roles) + volumes + network"`
}

type artifactOutput struct {
	OK       bool                     `json:"ok"`
	Artifact *honoemit.Artifact       `json:"artifact,omitempty"`
	Block    *blockreason.BlockReason `json:"block,omitempty"`
}

type hashOutput struct {
	OK   bool   `json:"ok"`
	Hash string `json:"hash,omitempty"`
}

func emitServer(_ context.Context, _ *mcp.CallToolRequest, in serverInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := honoemit.EmitServer(in.Spec)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func emitWorker(_ context.Context, _ *mcp.CallToolRequest, in serverInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := honoemit.EmitWorker(in.Spec)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func emitPulumi(_ context.Context, _ *mcp.CallToolRequest, in manifestInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := honoemit.EmitPulumiProgram(in.Manifest)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func serverHash(_ context.Context, _ *mcp.CallToolRequest, in serverInput) (*mcp.CallToolResult, hashOutput, error) {
	h, err := honoemit.ServerSourceHash(in.Spec)
	if err != nil {
		return nil, hashOutput{OK: false}, nil
	}
	return nil, hashOutput{OK: true, Hash: h}, nil
}

func manifestHash(_ context.Context, _ *mcp.CallToolRequest, in manifestInput) (*mcp.CallToolResult, hashOutput, error) {
	h, err := honoemit.ManifestHash(in.Manifest)
	if err != nil {
		return nil, hashOutput{OK: false}, nil
	}
	return nil, hashOutput{OK: true, Hash: h}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-hono-emitter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_server", Description: "S87: emit the bootable Hono/TS server — main+router+middleware+/healthz+one handler per SYNC operation (delegating to the Go interpreter callback). PURE, byte-identical, writes nothing (the wall)."}, emitServer)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_worker", Description: "S87: emit the async worker (TS) that drains the outbox and dispatches typed effects (S73/S74). PURE, byte-identical, writes nothing."}, emitWorker)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_pulumi", Description: "S87: emit the Pulumi/TS infra program (ADR 0043) from a StackManifest — one docker.Container per service on the shared Traefik network, FN02-pure + byte-stable. PURE, writes nothing."}, emitPulumi)
	mcp.AddTool(srv, &mcp.Tool{Name: "server_hash", Description: "S87: the server spec's content address (records.Hash of its canonical body) — input-order-invariant. PURE."}, serverHash)
	mcp.AddTool(srv, &mcp.Tool{Name: "manifest_hash", Description: "S87: the StackManifest's content address — input-order-invariant. PURE."}, manifestHash)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("hono-emitter: run: %w", err))
	}
}
