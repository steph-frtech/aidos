// Command deploy is the AIDOS S96 PHASE-KEYED DEPLOY MCP server (ADR 0009: every backend op is
// an MCP tool; app-builder EPIC 10, DP26 / ADR 0043).
//
// It is the capability door over runtime/deploy: the DETERMINISTIC pipeline that deploys an
// emitted app ONLY from a STABLE phase (« done is computed »: red→vert ∧ vert antérieur ∧
// mutation ≥ seuil ∧ aucun monstre), RE-PROJECTS the app from the phase (never a stale sandbox
// artifact, DP26), runs a FORWARD-ONLY data migration (S95), and provisions a per-phase deploy
// URL via `pulumi up` (ADR 0043). Tools:
//
//	plan          — Input → content-addressed DeployPlan, but ONLY when the phase is deployable.
//	                A non-stable phase is refused PHASE_NOT_STABLE (the Stop-gate, inherited),
//	                a breaking-no-backfill migration BREAKING_MIGRATION_NO_BACKFILL (S95). PURE.
//	gate          — the « done is computed » verdict over a phase + gate (deployable? + reasons).
//	check_served  — assert a running deploy's served-app hash EQUALS the plan's emitted-app hash
//	                (the re-projection property; a mismatch is a BlockReason). Code judges.
//	forward_only  — assert a migration plan is forward-only (expand → backfill → contract). Code.
//
// THE WALL (CLAUDE.md §2): pure planning + pure comparisons over supplied facts — writes
// NOTHING to the kernel/mirrors/fitness. The deploy is a PROCESS (Hono Node/Bun/edge, ADR 0040)
// brought up by the emitted Pulumi program (deploy = re-emit, DP26), torn down deterministically.
// A non-stable phase, a malformed surface, a breaking-no-backfill migration — each is a typed
// BlockReason. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
)

type planInput struct {
	Input deploy.Input `json:"input" jsonschema:"the deploy request: the stable phase (cut verdict), the gate (mutation threshold + monster count), the emitted surface, the emitted Pulumi program, the optional data-migration change, an optional domain root"`
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *deploy.DeployPlan       `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	p, br := deploy.BuildPlan(in.Input)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Plan: &p}, nil
}

type gateInput struct {
	Phase phases.StablePhase `json:"phase" jsonschema:"the coherent-cut verdict of the phase (phases.StablePhase from S23)"`
	Gate  deploy.Gate        `json:"gate" jsonschema:"the done-is-computed gate inputs: mutation score, declared mutation threshold, monster count"`
}

type gateOutput struct {
	OK         bool     `json:"ok"`
	Deployable bool     `json:"deployable"`
	Reasons    []string `json:"reasons"`
}

func gateTool(_ context.Context, _ *mcp.CallToolRequest, in gateInput) (*mcp.CallToolResult, gateOutput, error) {
	ok, reasons := deploy.IsDeployable(in.Phase, in.Gate)
	return nil, gateOutput{OK: true, Deployable: ok, Reasons: reasons}, nil
}

type checkServedInput struct {
	Plan          deploy.DeployPlan `json:"plan" jsonschema:"the deploy plan built by the plan tool"`
	ServedAppHash string            `json:"served_app_hash" jsonschema:"the served-app hash the running deploy reports (its /__aidos_hash probe)"`
}

type checkServedOutput struct {
	OK    bool                     `json:"ok"`
	Match bool                     `json:"match"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func checkServedTool(_ context.Context, _ *mcp.CallToolRequest, in checkServedInput) (*mcp.CallToolResult, checkServedOutput, error) {
	ok, br := deploy.DeployedMatchesPhase(in.Plan, in.ServedAppHash)
	return nil, checkServedOutput{OK: true, Match: ok, Block: br}, nil
}

type forwardOnlyInput struct {
	Migration datamigrate.Plan `json:"migration" jsonschema:"the data-migration plan to check (its staged steps)"`
}

type forwardOnlyOutput struct {
	OK          bool `json:"ok"`
	ForwardOnly bool `json:"forward_only"`
}

func forwardOnlyTool(_ context.Context, _ *mcp.CallToolRequest, in forwardOnlyInput) (*mcp.CallToolResult, forwardOnlyOutput, error) {
	return nil, forwardOnlyOutput{OK: true, ForwardOnly: deploy.MigrationIsForwardOnly(in.Migration)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-deploy", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "plan", Description: "S96: deploy a STABLE phase — a per-phase deploy URL, `pulumi up` of the re-emitted app (deploy = re-emit, DP26), a forward-only data migration. A non-stable phase is refused PHASE_NOT_STABLE; a breaking-no-backfill migration BREAKING_MIGRATION_NO_BACKFILL. PURE, content-addressed, idempotent, writes nothing (the wall)."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "gate", Description: "S96 Stop-gate: the « done is computed » verdict over a phase + gate (deployable? + the offending reasons). Inherits phases.IsStable (S23) + mutation/monster — code judges, never an agent."}, gateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_served", Description: "S96 re-projection property: assert a running deploy's served-app hash EQUALS the plan's emitted-app hash; a mismatch (a stale sandbox artifact) is a BlockReason. Code judges the equality."}, checkServedTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "forward_only", Description: "S96: assert a data-migration plan is forward-only (expand → backfill → contract, no backward step). Code judges the ordering."}, forwardOnlyTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("deploy: run: %w", err))
	}
}
