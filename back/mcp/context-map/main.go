// Command context-map is the AIDOS S101 CONTEXT-MAP MCP server (ADR 0009: every backend op
// is an MCP tool; app-builder EPIC 11).
//
// It is the capability door over kernel/contextmap: the DESIGN of the federation's edges —
// the inter-cell CONTRACT PAIRS (consumer expectation ↔ provider surface) verified by Pact,
// "le seul vrai travail humain" (KRD §46). "L'architecture est conçue, jamais générée." Tools:
//
//	verify_pair  — (ContextMap, pair) → PairVerdict — pact-verify ONE consumer/provider pair:
//	               HONORED iff the provider publishes a superset of the consumer's expectation
//	               (the done-criterion, half 1). PURE.
//	verify_all   — ContextMap → []PairVerdict — verify every designed pair, sorted. PURE.
//	check_call   — (from, to, ContextMap) → BlockReason|nil — a cross-cell call that VIOLATES
//	               the contract (unhonored or absent pair) is refused CROSS_CELL_NO_CONTRACT
//	               (the done-criterion, half 2). PURE.
//	propose      — (ContextMap, label, parentPhase) → DRAFT ChangeSet — persist the Context-Map
//	               as Kernel truth THE ONLY LEGAL WAY (propose → ChangeSet → approval). PURE;
//	               returns the envelope, writes NOTHING (the wall, CLAUDE.md §2).
//
// THE WALL (CLAUDE.md §2/§9): pure planning + pure pact comparisons over supplied facts —
// writes NOTHING to the kernel/mirrors/fitness. The Context-Map persists ONLY via the DRAFT
// ChangeSet `propose` returns, never a direct write. Transport: stdio. DETERMINISM-FIRST
// (CLAUDE.md §6): the verifier is an algorithm (field-set + status assertion), never an LLM.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/contextmap"
)

type verifyPairInput struct {
	Map  contextmap.ContextMap   `json:"map" jsonschema:"the designed Context-Map: cells, provider surfaces, and consumer→provider pairs"`
	Pair contextmap.ContractPair `json:"pair" jsonschema:"the consumer/provider contract pair to pact-verify"`
}

type verifyPairOutput struct {
	OK      bool                   `json:"ok"`
	Verdict contextmap.PairVerdict `json:"verdict"`
}

func verifyPairTool(_ context.Context, _ *mcp.CallToolRequest, in verifyPairInput) (*mcp.CallToolResult, verifyPairOutput, error) {
	return nil, verifyPairOutput{OK: true, Verdict: contextmap.VerifyPair(in.Map, in.Pair)}, nil
}

type verifyAllInput struct {
	Map contextmap.ContextMap `json:"map" jsonschema:"the designed Context-Map"`
}

type verifyAllOutput struct {
	OK       bool                     `json:"ok"`
	Verdicts []contextmap.PairVerdict `json:"verdicts"`
}

func verifyAllTool(_ context.Context, _ *mcp.CallToolRequest, in verifyAllInput) (*mcp.CallToolResult, verifyAllOutput, error) {
	return nil, verifyAllOutput{OK: true, Verdicts: contextmap.VerifyAll(in.Map)}, nil
}

type checkCallInput struct {
	From cell.Ref              `json:"from" jsonschema:"the cell making the call"`
	To   cell.Ref              `json:"to" jsonschema:"the cell being called"`
	Map  contextmap.ContextMap `json:"map" jsonschema:"the designed Context-Map"`
}

type checkCallOutput struct {
	OK      bool              `json:"ok"`
	Allowed bool              `json:"allowed"`
	Block   *cell.BlockReason `json:"block,omitempty"`
}

func checkCallTool(_ context.Context, _ *mcp.CallToolRequest, in checkCallInput) (*mcp.CallToolResult, checkCallOutput, error) {
	br := contextmap.CheckCrossCellCall(in.From, in.To, in.Map)
	return nil, checkCallOutput{OK: true, Allowed: br == nil, Block: br}, nil
}

type proposeInput struct {
	Map         contextmap.ContextMap `json:"map" jsonschema:"the designed Context-Map to persist as Kernel truth via a DRAFT ChangeSet"`
	Label       string                `json:"label" jsonschema:"the human label of the proposed envelope"`
	ParentPhase string                `json:"parent_phase" jsonschema:"the stable phase the envelope moves from"`
}

type proposeOutput struct {
	OK        bool                `json:"ok"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
	Error     string              `json:"error,omitempty"`
}

func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in proposeInput) (*mcp.CallToolResult, proposeOutput, error) {
	cs, err := contextmap.Propose(in.Map, in.Label, in.ParentPhase)
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, proposeOutput{OK: true, ChangeSet: cs}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-context-map", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "verify_pair", Description: "S101: pact-verify ONE consumer/provider contract pair — HONORED iff the provider publishes a superset of the consumer's expectation (matching method/path, every required field, status). PURE, deterministic."}, verifyPairTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "verify_all", Description: "S101: pact-verify EVERY designed pair in the Context-Map, sorted (consumer, provider). PURE."}, verifyAllTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_call", Description: "S101: a cross-cell call that VIOLATES the contract — an unhonored or absent pair — is refused CROSS_CELL_NO_CONTRACT (§46). Own-cell + HONORED-pair calls pass. PURE."}, checkCallTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "propose", Description: "S101: persist the Context-Map as Kernel truth THE ONLY LEGAL WAY — a DRAFT ChangeSet (propose → ChangeSet → approval). Returns the envelope (spec+mirror deltas); writes NOTHING (the wall)."}, proposeTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("context-map: run: %w", err))
	}
}
