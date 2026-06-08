// Command entity-relation is the AIDOS Kernel entity-relation MCP server (S71; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over S71 (back/kernel/entities/ref): the relation AST node that extends
// the entity type system with a typed reference (1-1 / 1-N / N-N, fk / association / composition)
// WITHOUT widening the closed scalar set. It resolves a relation's target against the declared
// entity set (refusing UNKNOWN_RELATION_TARGET, never a guessed mapping) and computes the relation's
// content address (the round-trip).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it validates, resolves and hashes a
// relation node as VALUES, and writes NOTHING (a relation is a SOURCE above the line; only the
// `aidos` CLI via an approved changeset writes the kernel). It reads what the caller pins; it never
// authors a relation into truth.
//
// Tools (one tool = one backend op):
//
//	relation_resolve  — resolve a relation against the declared entity set → ok | UNKNOWN_RELATION_TARGET / UNKNOWN_RELATION_KIND
//	relation_address  — compute a relation's content address (the content-addressed round-trip)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng,
// no I/O, never an LLM. The hash REUSES records.Hash verbatim; the refusal REUSES blockreason. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── relation_resolve ──

type resolveInput struct {
	Relation ref.Relation `json:"relation" jsonschema:"the relation AST node (name, target, cardinality, semantic)"`
	Known    []string     `json:"known" jsonschema:"the declared entity names the target resolves against (the project's entity cut)"`
}

type resolveOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func resolve(_ context.Context, _ *mcp.CallToolRequest, in resolveInput) (*mcp.CallToolResult, resolveOutput, error) {
	known := make(map[string]bool, len(in.Known))
	for _, n := range in.Known {
		known[n] = true
	}
	if err := ref.Resolve(in.Relation, known); err != nil {
		br := ref.BlockUnknownTarget(err)
		return nil, resolveOutput{OK: false, Block: &br}, nil
	}
	return nil, resolveOutput{OK: true}, nil
}

// ── relation_address ──

type addressInput struct {
	Relation ref.Relation `json:"relation" jsonschema:"the relation AST node to content-address"`
}

type addressOutput struct {
	OK    bool                     `json:"ok"`
	ID    string                   `json:"id,omitempty"`
	Body  string                   `json:"body,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func address(_ context.Context, _ *mcp.CallToolRequest, in addressInput) (*mcp.CallToolResult, addressOutput, error) {
	// shape must be valid before it is addressable (no half-formed node gets a hash).
	if err := ref.ValidateShape(in.Relation); err != nil {
		br := ref.BlockUnknownTarget(err)
		return nil, addressOutput{OK: false, Block: &br}, nil
	}
	id, err := ref.ID(in.Relation)
	if err != nil {
		br := ref.BlockUnknownTarget(err)
		return nil, addressOutput{OK: false, Block: &br}, nil
	}
	body, _ := ref.Body(in.Relation)
	return nil, addressOutput{OK: true, ID: id, Body: string(body)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-entity-relation", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "relation_resolve", Description: "S71: resolve a relation node against the declared entity set → ok, or UNKNOWN_RELATION_TARGET (target not declared, never guessed) / UNKNOWN_RELATION_KIND (cardinality/semantic out of the closed set). PURE, writes nothing (the wall)."}, resolve)
	mcp.AddTool(srv, &mcp.Tool{Name: "relation_address", Description: "S71: compute a relation node's content address (id = Hash(Canonicalize(body))) — the content-addressed round-trip. PURE, writes nothing."}, address)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("entity-relation: run: %w", err))
	}
}
