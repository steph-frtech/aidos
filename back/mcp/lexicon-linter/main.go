// Command lexicon-linter is the AIDOS Kernel Lexicon MCP server (FK14; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over FK14 (back/kernel/lexicon): the Lexicon Kernel — a concept NAMED
// across the 16 layers (human/bdd/code/test/db/api/event/log/metric/mcp/skill/agent/doc/ci/policy/
// memory) as a single source — and the PURE inter-layer linter that detects a symbol OUT of that
// lexicon, per layer (a language drift made verifiable by computation). Four PURE, write-nothing tools:
//
//	lint       — a lexicon (concept + per-layer symbols) + the observed symbols → the drifts:
//	             RENAMED (a symbol out of lexicon — the FK14 fault-injection) / UNKNOWN_SYMBOL
//	             (no symbol pinned for the concept in that layer) / UNKNOWN_LAYER (out of the 16),
//	             plus the clean verdict (no drift). The judge is a set-membership check, never a prompt.
//	validate   — a lexicon → its shape verdict OR the closed refusal: NO_CONCEPT / UNKNOWN_LAYER /
//	             EMPTY_SYMBOL.
//	serialize  — a (valid) lexicon → its content-addressed kernel.link body + the record id/version
//	             (the STORAGE FORK tranché ici: a lexicon rides inside a kernel.link, NOT a new
//	             record kind; a renamed symbol yields a NEW version, never a mutation — KRD §12).
//	layers     — the 16 closed layers + the lexicon link-kind discriminator.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS a lexicon + symbols
// and returns drifts / a body — freezing/updating a lexicon goes idea → mirror → /goal → human
// approval (the aidos CLI writer role, never the agent). DETERMINISM-FIRST (§8): all four tools are
// PURE — no clock, no rng, NO LLM (the lint is a string-equality over a closed layer set, exactly the
// deterministic check that MUST be code, never an "LLM drift agent"). Transport: stdio.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/lexicon"
)

// ── shared shapes ──

type symbolIn struct {
	Layer  string `json:"layer" jsonschema:"one of the 16 layers: human|bdd|code|test|db|api|event|log|metric|mcp|skill|agent|doc|ci|policy|memory"`
	Symbol string `json:"symbol" jsonschema:"the legal symbol for the concept in that layer"`
}

type lexiconIn struct {
	Concept string     `json:"concept" jsonschema:"the canonical concept id (the human-anchored name), e.g. ReturnRequest"`
	Symbols []symbolIn `json:"symbols" jsonschema:"the per-layer legal symbols binding the concept across layers"`
}

func (l lexiconIn) toKernel() lexicon.LexiconKernel {
	syms := make(map[lexicon.Layer]string, len(l.Symbols))
	for _, s := range l.Symbols {
		syms[lexicon.Layer(s.Layer)] = s.Symbol
	}
	return lexicon.LexiconKernel{Concept: l.Concept, Symbols: syms}
}

type observationIn struct {
	Layer  string `json:"layer" jsonschema:"the layer the symbol was observed in"`
	Symbol string `json:"symbol" jsonschema:"the actual symbol seen (e.g. a real table/function/metric name)"`
}

type driftOut struct {
	Layer    string `json:"layer"`
	Symbol   string `json:"symbol"`
	Expected string `json:"expected,omitempty"`
	Kind     string `json:"kind"`
}

// ── lint ──

type lintIn struct {
	Lexicon      lexiconIn       `json:"lexicon" jsonschema:"the Lexicon Kernel: concept + per-layer symbols"`
	Observations []observationIn `json:"observations" jsonschema:"the symbols observed across layers, to lint against the lexicon"`
}

type lintOut struct {
	OK     bool       `json:"ok"`
	Clean  bool       `json:"clean"`
	Drifts []driftOut `json:"drifts"`
	Error  string     `json:"error,omitempty"`
}

func lint(_ context.Context, _ *mcp.CallToolRequest, in lintIn) (*mcp.CallToolResult, lintOut, error) {
	k := in.Lexicon.toKernel()
	if err := lexicon.Validate(k); err != nil {
		return nil, lintOut{OK: true, Error: classify(err)}, nil
	}
	obs := make([]lexicon.Observation, len(in.Observations))
	for i, o := range in.Observations {
		obs[i] = lexicon.Observation{Layer: lexicon.Layer(o.Layer), Symbol: o.Symbol}
	}
	drifts := lexicon.Lint(k, obs)
	out := make([]driftOut, len(drifts))
	for i, d := range drifts {
		out[i] = driftOut{Layer: string(d.Layer), Symbol: d.Symbol, Expected: d.Expected, Kind: string(d.Kind)}
	}
	return nil, lintOut{OK: true, Clean: len(drifts) == 0, Drifts: out}, nil
}

// ── validate ──

type validateOut struct {
	OK    bool   `json:"ok"`
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in lexiconIn) (*mcp.CallToolResult, validateOut, error) {
	if err := lexicon.Validate(in.toKernel()); err != nil {
		return nil, validateOut{OK: true, Valid: false, Error: classify(err)}, nil
	}
	return nil, validateOut{OK: true, Valid: true}, nil
}

// ── serialize ──

type serializeOut struct {
	OK      bool   `json:"ok"`
	Body    string `json:"body,omitempty"`
	ID      string `json:"id,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

func serialize(_ context.Context, _ *mcp.CallToolRequest, in lexiconIn) (*mcp.CallToolResult, serializeOut, error) {
	rec, err := lexicon.Record(in.toKernel())
	if err != nil {
		return nil, serializeOut{OK: true, Error: classify(err)}, nil
	}
	return nil, serializeOut{OK: true, Body: string(rec.Body), ID: rec.ID, Version: rec.Version}, nil
}

// ── layers ──

type layersOut struct {
	OK       bool     `json:"ok"`
	LinkKind string   `json:"link_kind"`
	Layers   []string `json:"layers"`
}

func layers(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, layersOut, error) {
	ls := lexicon.Layers()
	out := make([]string, len(ls))
	for i, l := range ls {
		out[i] = string(l)
	}
	return nil, layersOut{OK: true, LinkKind: "lexicon", Layers: out}, nil
}

// classify maps a lexicon error to its closed BlockReason code (the same codes the Workbench renders).
func classify(err error) string {
	switch {
	case errors.Is(err, lexicon.ErrNoConcept):
		return "NO_CONCEPT"
	case errors.Is(err, lexicon.ErrUnknownLayer):
		return "UNKNOWN_LAYER"
	case errors.Is(err, lexicon.ErrEmptySymbol):
		return "EMPTY_SYMBOL"
	default:
		return err.Error()
	}
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-lexicon-linter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "lint",
		Description: "FK14 (the inter-layer linter): a Lexicon Kernel (concept + per-layer symbols) + the observed symbols → the drifts (RENAMED — a symbol out of lexicon, the FK14 fault-injection / UNKNOWN_SYMBOL — no symbol pinned for the concept in that layer / UNKNOWN_LAYER — outside the 16) + the clean verdict. PURE; the judge is a set-membership check, never a prompt. Writes nothing (the wall).",
	}, lint)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "validate",
		Description: "FK14: a Lexicon Kernel → its shape verdict OR the closed refusal: NO_CONCEPT / UNKNOWN_LAYER / EMPTY_SYMBOL. PURE; writes nothing.",
	}, validate)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "serialize",
		Description: "FK14 (the storage fork tranché ici): a (valid) lexicon → its content-addressed kernel.link body + the record id/version. A renamed symbol yields a NEW version (never a mutation — KRD §12). PURE; writes nothing — freezing a lexicon goes idea → mirror → /goal.",
	}, serialize)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "layers",
		Description: "FK14: the 16 closed layers (FKE-21) + the lexicon link-kind discriminator. PURE; writes nothing.",
	}, layers)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("lexicon-linter: run: %w", err))
	}
}
