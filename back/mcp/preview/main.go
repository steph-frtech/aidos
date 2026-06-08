// Command preview is the AIDOS S94 EPHEMERAL PREVIEW ENVIRONMENT MCP server
// (ADR 0009: every backend op is an MCP tool; app-builder EPIC 10, ADR 0043 / DP25).
//
// It is the capability door over runtime/preview: the DETERMINISTIC planner that turns the
// EMITTED SURFACE of a content-addressed STABLE PHASE (the emitted server/front/infra/
// datastore hashes + the emitted Pulumi program) into a content-addressed PreviewPlan — the
// preview URL keyed on the phase, the `pulumi up` boot, the deterministic `pulumi destroy`
// teardown — and judges the done-criterion (the served-app hash equals the emitted-app hash
// of the phase). Tools:
//
//	plan         — Input → content-addressed PreviewPlan. PURE: a validation + the S02 hash +
//	               the per-phase URL/stack + the boot/teardown commands, never an LLM. Same
//	               Input → byte-identical Plan (same id, same URL).
//	app_hash     — the EmittedAppHash of a phase's surface (the single content address of the
//	               whole emitted app — server ⊕ front ⊕ infra ⊕ datastore).
//	check_served — assert a running preview's served-app hash EQUALS the plan's emitted-app
//	               hash (the S94 done-criterion; a mismatch is a BlockReason). Code judges.
//
// THE WALL (CLAUDE.md §2): pure planning + a pure hash comparison over supplied bytes —
// writes NOTHING to the kernel/mirrors/fitness. The preview is a PROCESS (Hono Node/Bun/edge,
// ADR 0040 — never a Go binary) brought up by the emitted Pulumi program (deploy = re-emit,
// DP26), torn down deterministically. A malformed input is a typed BlockReason. Transport:
// stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

type planInput struct {
	Input preview.Input `json:"input" jsonschema:"the preview request: the content-addressed phase, its emitted surface (server/front/infra/datastore hashes), the emitted Pulumi program, an optional domain root"`
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *preview.PreviewPlan     `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	p, br := preview.BuildPlan(in.Input)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Plan: &p}, nil
}

type appHashInput struct {
	Phase   preview.PhaseRef       `json:"phase" jsonschema:"the content-addressed stable phase the surface belongs to"`
	Surface preview.EmittedSurface `json:"surface" jsonschema:"the emitted surface: project + server/front/infra/datastore hashes"`
}

type appHashOutput struct {
	OK             bool   `json:"ok"`
	EmittedAppHash string `json:"emitted_app_hash"`
	Err            string `json:"err,omitempty"`
}

func appHashTool(_ context.Context, _ *mcp.CallToolRequest, in appHashInput) (*mcp.CallToolResult, appHashOutput, error) {
	h, err := preview.EmittedAppHash(in.Phase, in.Surface)
	if err != nil {
		return nil, appHashOutput{OK: false, Err: err.Error()}, nil
	}
	return nil, appHashOutput{OK: true, EmittedAppHash: h}, nil
}

type checkServedInput struct {
	Plan          preview.PreviewPlan `json:"plan" jsonschema:"the preview plan built by the plan tool"`
	ServedAppHash string              `json:"served_app_hash" jsonschema:"the served-app hash the running preview reports (its /__aidos_hash probe)"`
}

type checkServedOutput struct {
	OK    bool                     `json:"ok"`
	Match bool                     `json:"match"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func checkServedTool(_ context.Context, _ *mcp.CallToolRequest, in checkServedInput) (*mcp.CallToolResult, checkServedOutput, error) {
	ok, br := preview.ServedMatchesEmitted(in.Plan, in.ServedAppHash)
	return nil, checkServedOutput{OK: true, Match: ok, Block: br}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-preview", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "plan", Description: "S94: plan an ephemeral preview for a content-addressed phase — a per-phase preview URL, `pulumi up` boot, deterministic `pulumi destroy` teardown. PURE, content-addressed, idempotent, writes nothing (the wall)."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "app_hash", Description: "S94: the EmittedAppHash of a phase's surface — the single content address of the whole emitted app (server ⊕ front ⊕ infra ⊕ datastore)."}, appHashTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_served", Description: "S94 done-criterion: assert a running preview's served-app hash EQUALS the plan's emitted-app hash; a mismatch is a BlockReason. Code judges the equality, never an agent."}, checkServedTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("preview: run: %w", err))
	}
}
