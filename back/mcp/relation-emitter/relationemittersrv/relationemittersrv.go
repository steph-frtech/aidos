// Package relationemittersrv is the AIDOS Kernel relation-aware emitter MCP server (S74; ADR
// 0009: every backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse, ADR 0092).
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
//
// THE S59 SCAR ([]byte → array-vs-base64-string mismatch). relemit.Artifact.Bytes is a Go []byte:
// the go-sdk reflects it to a JSON number-ARRAY output schema, while encoding/json marshals a []byte
// to a base64 STRING — a schema/value mismatch the HTTP output-validation REJECTS (a routed call
// 0-rows, the front silently falls back to demo). This server therefore wraps Artifact in a
// DISPATCH-SAFE artifactOut whose Source is a STRING (the rendered code the panel renders), so the
// declared output schema matches the wire and every dispatched tool's OBJECT survives the round-trip.
//
// DISPATCH NOTE (ADR 0092). The flat gateway registry is a name→server map. relation-emitter's
// emit_worker COLLIDES with hono-emitter.emit_worker and schema_hash with entity-modeler.
// schema_hash; registering them would shadow the prior owner (a §9 anti-overwrite). So the S59
// gateway dispatches only the NON-colliding emit_ddl/emit_ts/emit_all; emit_worker/schema_hash
// stay EXPOSED by this server (the stdio binary + CI use them) but OFF-dispatch (the panel keeps
// its own voie propre — the arch-fitness `propose` / preview `plan` precedent). The collision is
// an OpenQuestion (tool-name uniqueness across emitters), not a regression.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; extracting the handlers here (rather than the old package-main) lets BOTH
// the standalone stdio binary (back/mcp/relation-emitter) and the dispatcher construct identical
// behaviour — no duplicated logic, no twin (reuse, don't reinvent — CLAUDE.md §0).
package relationemittersrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── shared I/O ──

type schemaInput struct {
	Schema relemit.Schema `json:"schema" jsonschema:"the multi-entity schema cut: project + entities-with-relations + async ops"`
}

// artifactOut is the DISPATCH-SAFE mirror of relemit.Artifact: Source is the rendered code as a
// STRING (what the panel renders), instead of relemit.Artifact's Bytes []byte — which the go-sdk
// reflects to a JSON number-ARRAY output schema while encoding/json marshals it to a base64 STRING,
// a schema/value mismatch the HTTP output-validation REJECTS (the S59 byte-array transport scar).
// Exposing Source as a string makes the declared output schema match the wire — the object survives
// the round-trip. The two content addresses (source/output hashes) ride alongside for the byte-stable
// re-emit proof; Path/Target/Protected are the artifact's provenance.
type artifactOut struct {
	Path       string `json:"path"`
	Target     string `json:"target"`
	Source     string `json:"source"`
	SourceHash string `json:"source_hash"`
	OutputHash string `json:"output_hash"`
	Protected  bool   `json:"protected"`
}

func toArtifactOut(a relemit.Artifact) artifactOut {
	return artifactOut{
		Path:       a.Path,
		Target:     a.Target,
		Source:     string(a.Bytes),
		SourceHash: a.SourceHash,
		OutputHash: a.OutputHash,
		Protected:  a.Protected,
	}
}

type artifactOutput struct {
	OK       bool                     `json:"ok"`
	Artifact *artifactOut             `json:"artifact,omitempty"`
	Block    *blockreason.BlockReason `json:"block,omitempty"`
}

func emitDDL(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitDDL(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	out := toArtifactOut(art)
	return nil, artifactOutput{OK: true, Artifact: &out}, nil
}

func emitTS(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitTS(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	out := toArtifactOut(art)
	return nil, artifactOutput{OK: true, Artifact: &out}, nil
}

func emitWorker(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, artifactOutput, error) {
	art, br := relemit.EmitWorker(in.Schema)
	if br != nil {
		return nil, artifactOutput{OK: false, Block: br}, nil
	}
	out := toArtifactOut(art)
	return nil, artifactOutput{OK: true, Artifact: &out}, nil
}

type emitAllOutput struct {
	OK        bool                     `json:"ok"`
	Artifacts []artifactOut            `json:"artifacts,omitempty"`
	Block     *blockreason.BlockReason `json:"block,omitempty"`
}

func emitAll(_ context.Context, _ *mcp.CallToolRequest, in schemaInput) (*mcp.CallToolResult, emitAllOutput, error) {
	arts, br := relemit.EmitAll(in.Schema)
	if br != nil {
		return nil, emitAllOutput{OK: false, Block: br}, nil
	}
	out := make([]artifactOut, 0, len(arts))
	for _, a := range arts {
		out = append(out, toArtifactOut(a))
	}
	return nil, emitAllOutput{OK: true, Artifacts: out}, nil
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

// NewServer builds the S74 relation-aware emitter MCP server (all five tools). Reused by BOTH
// the standalone stdio binary AND the S59 gateway dispatcher (which fronts only the
// non-colliding emit_ddl/emit_ts/emit_all — see the package doc).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-relation-emitter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_ddl", Description: "S74: emit the multi-entity Postgres DDL — FK columns (1-1/1-N), a join table per N-N, an outbox table when async; every FK references a real declared table. PURE, byte-identical, writes nothing (the wall)."}, emitDDL)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_ts", Description: "S74: emit the emitted app's TypeScript model — typed associations + a navigation SDK (Hono/TS, ADR 0040). PURE, byte-identical, writes nothing."}, emitTS)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_worker", Description: "S74: emit the async worker (TS) that drains the outbox and dispatches typed effects (S73). Refuses a schema with no async op. PURE, byte-identical, writes nothing."}, emitWorker)
	mcp.AddTool(srv, &mcp.Tool{Name: "emit_all", Description: "S74: fan the schema across the closed target set (DDL, TS, Worker iff async) in one deterministic pass. A BlockReason short-circuits (no partial tree)."}, emitAll)
	mcp.AddTool(srv, &mcp.Tool{Name: "schema_hash", Description: "S74: the schema's content address (records.Hash of its canonical body) — input-order-invariant. PURE."}, schemaHash)
	return srv
}
