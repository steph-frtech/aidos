// Command apisurface is the AIDOS S90 emitted-app API-SURFACE MCP server (ADR 0009: every
// backend op is an MCP tool; app-builder EPIC 9, ADR 0040).
//
// It is the capability door over runtime/apisurface: the DETERMINISTIC emitter that turns a
// per-app ApiSpec (project + the full set of the project's operations, each with its entity,
// verb, authorize flag, input schema) into the emitted app's COMPLETE API surface —
//
//	openapi — the per-app OpenAPI 3.1 document (byte-stable from the Kernel cut).
//	pact    — the Pact suite: ONE content-addressed contract per SYNC operation
//	          (generalising the single createOrder.pact.json the S36 emitter produced).
//	router  — the Hono/TS router (one route per operation, delegating to the Go sidecar
//	          interpreter callback, ADR 0040 Déc.7; a policy DENY → HTTP 403).
//	verify  — provider verification on ALL emitted endpoints (in-process, deterministic);
//	          the S90 done-criterion "pact-verifier sur tous les endpoints émis".
//
// THE WALL (CLAUDE.md §2): pure emission over a supplied spec — writes NOTHING to the
// kernel/mirrors/fitness. DETERMINISM-FIRST (CLAUDE.md §6): every tool is a pure/total
// function of its canonicalised input; the verifier is an algorithm (status + field-set
// assertions through the real S10 interpreter), never an LLM judgment. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/apisurface"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

type specInput struct {
	Spec apisurface.ApiSpec `json:"spec" jsonschema:"the per-app API spec: project + the full set of operations (name, entity AST, verb POST/GET, authorize, input schema)"`
}

type emitOutput struct {
	OK    bool                     `json:"ok"`
	Path  string                   `json:"path,omitempty"`
	Bytes string                   `json:"bytes,omitempty"`
	Hash  string                   `json:"output_hash,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func openapiTool(_ context.Context, _ *mcp.CallToolRequest, in specInput) (*mcp.CallToolResult, emitOutput, error) {
	a, br := apisurface.EmitOpenAPI(in.Spec)
	if br != nil {
		return nil, emitOutput{OK: false, Block: br}, nil
	}
	return nil, emitOutput{OK: true, Path: a.Path, Bytes: string(a.Bytes), Hash: a.OutputHash}, nil
}

func routerTool(_ context.Context, _ *mcp.CallToolRequest, in specInput) (*mcp.CallToolResult, emitOutput, error) {
	a, br := apisurface.EmitRouter(in.Spec)
	if br != nil {
		return nil, emitOutput{OK: false, Block: br}, nil
	}
	return nil, emitOutput{OK: true, Path: a.Path, Bytes: string(a.Bytes), Hash: a.OutputHash}, nil
}

type pactItem struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Bytes string `json:"bytes"`
	Hash  string `json:"output_hash"`
}
type pactOutput struct {
	OK        bool                     `json:"ok"`
	Contracts []pactItem               `json:"contracts,omitempty"`
	Block     *blockreason.BlockReason `json:"block,omitempty"`
}

func pactTool(_ context.Context, _ *mcp.CallToolRequest, in specInput) (*mcp.CallToolResult, pactOutput, error) {
	arts, br := apisurface.EmitPactArtifacts(in.Spec)
	if br != nil {
		return nil, pactOutput{OK: false, Block: br}, nil
	}
	suite, _ := apisurface.EmitPactSuite(in.Spec)
	opByPath := map[string]string{}
	for i, a := range arts {
		if i < len(suite) {
			opByPath[a.Path] = suite[i].Op
		}
	}
	items := make([]pactItem, 0, len(arts))
	for _, a := range arts {
		items = append(items, pactItem{Op: opByPath[a.Path], Path: a.Path, Bytes: string(a.Bytes), Hash: a.OutputHash})
	}
	return nil, pactOutput{OK: true, Contracts: items}, nil
}

type verifyOutput struct {
	OK           bool     `json:"ok"`
	Pass         bool     `json:"pass"`
	Reason       string   `json:"reason"`
	Interactions []string `json:"interactions,omitempty"`
}

func verifyTool(_ context.Context, _ *mcp.CallToolRequest, in specInput) (*mcp.CallToolResult, verifyOutput, error) {
	res := apisurface.VerifySuite(in.Spec)
	return nil, verifyOutput{OK: true, Pass: res.Pass, Reason: res.Reason, Interactions: res.Interactions}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-apisurface", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "openapi", Description: "S90: emit the per-app OpenAPI 3.1 document (byte-stable from the Kernel cut). PURE, deterministic, writes nothing (the wall)."}, openapiTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "router", Description: "S90: emit the Hono/TS router (one route per operation, delegating to the Go sidecar interpreter callback; a policy DENY → HTTP 403). PURE, deterministic."}, routerTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "pact", Description: "S90: emit the Pact suite — ONE content-addressed contract per SYNC operation (generalises createOrder.pact.json). PURE, deterministic."}, pactTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "verify", Description: "S90: provider verification on ALL emitted endpoints (in-process, deterministic) — the done-criterion 'pact-verifier sur tous les endpoints émis'."}, verifyTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("apisurface: run: %w", err))
	}
}
