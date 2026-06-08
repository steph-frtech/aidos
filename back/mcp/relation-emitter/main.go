// Command relation-emitter is the AIDOS Kernel relation-aware emitter MCP server (S74; ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over S74 (back/kernel/entities/relemit): the relation-aware,
// MULTI-ENTITY emitter that projects a whole schema cut — entities + their relations (S71) +
// their async operations (S73) — into the emitted app's targets (ADR 0040):
//
//	emit_ddl     — Postgres DDL: FK columns (1-1/1-N), a JOIN TABLE per N-N, an OUTBOX table
//	               when async; every FK REFERENCES a real declared table.
//	emit_ts      — the emitted app's TypeScript model: typed associations + a navigation SDK.
//	emit_worker  — the async worker (TS): drains the outbox, dispatches typed effects.
//	emit_all     — fan the schema across the closed target set in one deterministic pass.
//	schema_hash  — the schema's content address (input-order-invariant).
//
// THE WALL (CLAUDE.md §2): this server is PURE PROJECTION — it renders code as VALUES and
// writes NOTHING to the kernel/mirrors/fitness. The emitted bytes are a projection (S78 owns
// regeneration). A malformed schema is a typed BlockReason, never a partial render.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same schema → byte-identical output (the S74 done-criterion).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── shared I/O ──

type schemaInput struct {
	Schema relemit.Schema `json:"schema" jsonschema:"the multi-entity schema cut: project + entities-with-relations + async ops"`
}

type artifactOutput struct {
	OK       bool                     `json:"ok"`
	Artifact *relemit.Artifact        `json:"artifact,omitempty"`
	Block    *blockreason.BlockReason `json:"block,omitempty"`
}

func emitDDL(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitDDL(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func emitTS(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitTS(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

func emitWorker(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitWorker(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	return nil, artifactOutput{OK: true, Artifact: &art}, nil
}

type emitAllOutput struct {
	OK        bool                     `json:"ok"`
	Artifacts []relemit.Artifact       `json:"artifacts,omitempty"`
	Block     *blockreason.BlockReason `json:"block,omitempty"`
}

func emitAll(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, emitAllOutput, error) {
	arts, br := relemit.EmitAll(in.Schema)
	if br != nil {
		return nil, emitAllOutput{OK: false, Block: br}, nil
	}
	return nil, emitAllOutput{OK: true, Artifacts: arts}, nil
}

type hashOutput struct {
	OK    bool                     `json:"ok"`
	Hash  string                   `json:"hash,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func schemaHash(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, hashOutput, error) {
	h, err := relemit.SchemaHash(in.Schema)
	if err != nil {
		return nil, hashOutput{OK: false}, nil
	}
	return nil, hashOutput{OK: true, Hash: h}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-relation-emitter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_ddl", Description: "S74: emit the multi-entity Postgres DDL — FK columns (1-1/1-N), a join table per N-N, an outbox table when async; every FK references a real declared table. PURE, byte-identical, writes nothing (the wall)."}, emitDDL)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_ts", Description: "S74: emit the emitted app's TypeScript model — typed associations + a navigation SDK (Hono/TS, ADR 0040). PURE, byte-identical, writes nothing."}, emitTS)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_worker", Description: "S74: emit the async worker (TS) that drains the outbox and dispatches typed effects (S73). Refuses a schema with no async op. PURE, byte-identical, writes nothing."}, emitWorker)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_all", Description: "S74: fan the schema across the closed target set (DDL, TS, Worker iff async) in one deterministic pass. A BlockReason short-circuits (no partial tree)."}, emitAll)
	mcp.AddTool(srv, &mcp.Tool{Name: "schema_hash", Description: "S74: the schema's content address (records.Hash of its canonical body) — input-order-invariant. PURE."}, schemaHash)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("relation-emitter: run: %w", err))
	}
}
