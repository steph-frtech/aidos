// Command provision is the AIDOS S89 per-app datastore PROVISIONER MCP server
// (ADR 0009: every backend op is an MCP tool; app-builder EPIC 9, ADR 0006/0047,
// ADR 0043 DP15).
//
// It is the capability door over runtime/provision: the DETERMINISTIC planner that
// turns a per-app spec (project, chosen target, the S88 Decision, the entity ASTs,
// pgvector need, an optional §44.3 change) into a content-addressed ProvisionPlan —
// the DDL to apply, the resolved target (plain-postgres default / doltgres opt-in),
// the per-project isolated database+namespace, the pgvector sidecar when needed,
// and the Pulumi resource descriptor the deploy track consumes. Tools:
//
//	plan   — Spec → content-addressed Plan. PURE: a membership check + a hash +
//	         the existing DDL emitter + the existing migration gate, never an LLM.
//	         Same Spec → byte-identical Plan (same ID).
//	images — the DECLARED container images per target (above-the-line, never learned).
//
// THE WALL (CLAUDE.md §2): pure planning over a supplied spec — writes NOTHING to
// the kernel/mirrors/fitness. The default emitted-app target is ALWAYS plain-postgres
// (the escape hatch by construction); Doltgres is opt-in iff the S88 Decision is Go;
// a historical-impact migration is human-gated via a declared DataTruthScope (the
// plan surfaces the BlockReason, it never bypasses the gate). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/provision"
)

type planInput struct {
	Spec provision.Spec `json:"spec" jsonschema:"the per-app provisioning spec: projectId, target (empty=plain-postgres default), the S88 decision, the entity ASTs, needsVector, an optional §44.3 change"`
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *provision.Plan          `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	p, br := provision.BuildPlan(in.Spec)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Plan: &p}, nil
}

type imagesOutput struct {
	OK     bool              `json:"ok"`
	Images map[string]string `json:"images"`
}

func images(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, imagesOutput, error) {
	return nil, imagesOutput{OK: true, Images: provision.DeclaredImages()}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-provision", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "plan", Description: "S89: plan a per-app datastore — plain-postgres default (+pgvector sidecar iff needed), doltgres opt-in iff S88 Go, SAME Atlas DDL emitter, per-project isolation, migration human-gated via DataTruthScope, emitted as a Pulumi resource (DP15). PURE, deterministic, content-addressed, writes nothing (the wall)."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "images", Description: "S89: the DECLARED container images per target (plain-postgres, pgvector, doltgres) — above-the-line, never learned."}, images)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("provision: run: %w", err))
	}
}
