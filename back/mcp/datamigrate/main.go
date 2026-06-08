// Command datamigrate is the AIDOS S95 DATA-MIGRATION-OF-THE-EMITTED-APP MCP server
// (ADR 0009: every backend op is an MCP tool; app-builder EPIC 10, DP15/DP26).
//
// It is the capability door over runtime/datamigrate: the DETERMINISTIC planner that turns a
// BREAKING schema change of a DEPLOYED emitted app (one carrying REAL rows) into a content-
// addressed, expand-contract + backfill migration plan, DataTruthScope-gated. Tools:
//
//	plan   — Change → content-addressed Plan (expand → backfill → contract). PURE: a
//	         validation + the §44.3 backfill gate + the staged SQL + the S02 hash, never an
//	         LLM. A breaking change with no backfill is REFUSED (BREAKING_MIGRATION_NO_BACKFILL).
//	kinds  — the closed set of breaking-change kinds the planner understands (rename, split,
//	         cardinality) — the Workbench legend reads this single source.
//	gate   — judge whether a change is allowed under its declared backfill (the §44.3 gate
//	         verdict, without building the full plan). Code judges, never an agent.
//
// THE WALL (CLAUDE.md §2): pure planning over supplied AST + scope — writes NOTHING to the
// kernel/mirrors/fitness. The migration is DRIVER-NEUTRAL (emitted SQL + a content address);
// a thin client applies it. A breaking change with no backfill, a malformed change, an unknown
// strategy — each is a typed BlockReason, never a silent DROP. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
)

type planInput struct {
	Change datamigrate.Change `json:"change" jsonschema:"the breaking schema change of a deployed app: project, kind (rename/split/cardinality), the matching change body, and an optional declared backfill DataTruthScope"`
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *datamigrate.Plan        `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	p, br := datamigrate.Build(in.Change)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Plan: &p}, nil
}

type kindsOutput struct {
	OK    bool     `json:"ok"`
	Kinds []string `json:"kinds"`
}

func kindsTool(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, kindsOutput, error) {
	ks := datamigrate.ChangeKinds()
	out := make([]string, len(ks))
	for i, k := range ks {
		out[i] = string(k)
	}
	return nil, kindsOutput{OK: true, Kinds: out}, nil
}

type gateInput struct {
	Change datamigrate.Change `json:"change" jsonschema:"the breaking change to judge against its declared backfill"`
}

type gateOutput struct {
	OK      bool                     `json:"ok"`
	Allowed bool                     `json:"allowed"`
	Block   *blockreason.BlockReason `json:"block,omitempty"`
}

// gateTool judges whether the change is allowed under its declared backfill (the §44.3 gate)
// without rendering the full plan — a thin verdict for the Workbench badge. Code judges.
func gateTool(_ context.Context, _ *mcp.CallToolRequest, in gateInput) (*mcp.CallToolResult, gateOutput, error) {
	_, br := datamigrate.Build(in.Change)
	if br != nil {
		return nil, gateOutput{OK: true, Allowed: false, Block: br}, nil
	}
	return nil, gateOutput{OK: true, Allowed: true}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-datamigrate", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "plan", Description: "S95: plan an expand-contract + backfill data migration for a breaking schema change of a deployed app (rename/split/cardinality). PURE, content-addressed, DataTruthScope-gated; a breaking change with no backfill is REFUSED. Writes nothing (the wall)."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "kinds", Description: "S95: the closed set of breaking-change kinds the planner understands (rename, split, cardinality)."}, kindsTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "gate", Description: "S95 §44.3 gate: judge whether a breaking change is allowed under its declared backfill (a BREAKING_MIGRATION_NO_BACKFILL refusal otherwise). Code judges the equality, never an agent."}, gateTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("datamigrate: run: %w", err))
	}
}
