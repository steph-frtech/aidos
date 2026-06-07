// Command projectwall is the AIDOS Runtime `project-wall` MCP server (S55; ADR 0009).
//
// It is the capability door (ADR 0009: every backend op is an MCP tool) over the S55
// project-aware wall — the two-layer defense-in-depth that fences a below-the-line op
// to the CURRENT project under the PROPAGATED IDENTITY (S61). Level 1 is the
// PreToolUse hook (back/runtime/projectwall); level 2 is the Postgres RLS
// (back/migrations/project_rls_baseline.sql). This server exposes the LEVEL-1
// classifier (the same pure predicate the RLS enforces) so the Workbench and any
// caller can render and EXECUTE the cross-project verdict identically:
//
//	wall_classify   — classify (identity, active_project) × (target_project,
//	                  claimed_identity) → allow | deny + BlockReason
//	                  (AGENT_CROSS_PROJECT_WRITE on a cross-project / forged-identity op)
//	wall_block_code — the stable BlockReason code this wall emits
//
// Every tool is PURE and DETERMINISTIC — no DB, no clock, no LLM (determinism-first,
// CLAUDE.md §6/§8). The classifier is an ALGORITHM, not a prompt. THE WALL (§2): this
// server writes NOTHING; it only judges scope. Transport: stdio (no DSN).
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

type classifyInput struct {
	Identity        string `json:"identity" jsonschema:"the propagated caller identity (S61)"`
	ActiveProject   string `json:"active_project" jsonschema:"the project_id the request is pinned to (S57)"`
	TargetProject   string `json:"target_project" jsonschema:"the project_id of the rows the op reads/writes"`
	ClaimedIdentity string `json:"claimed_identity,omitempty" jsonschema:"identity the op asserts (empty=inherit scope; a mismatch is a forged claim)"`
}

type blockReasonOutput struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

type classifyOutput struct {
	Verdict     string             `json:"verdict"`
	BlockReason *blockReasonOutput `json:"block_reason,omitempty"`
}

type emptyInput struct{}

type codeOutput struct {
	Code string `json:"code"`
}

func classifyTool(_ context.Context, _ *mcp.CallToolRequest, in classifyInput) (*mcp.CallToolResult, classifyOutput, error) {
	d := projectwall.Classify(
		projectwall.Scope{Identity: in.Identity, ActiveProject: in.ActiveProject},
		projectwall.Target{ProjectID: in.TargetProject, ClaimedIdentity: in.ClaimedIdentity},
	)
	out := classifyOutput{Verdict: string(d.Verdict)}
	if d.BlockReason != nil {
		out.BlockReason = &blockReasonOutput{
			Code:        string(d.BlockReason.Code),
			Severity:    d.BlockReason.Severity,
			Explanation: d.BlockReason.Explanation,
			HowToFix:    d.BlockReason.HowToFix,
		}
	}
	return nil, out, nil
}

func codeTool(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, codeOutput, error) {
	return nil, codeOutput{Code: string(projectwall.CodeAgentCrossProjectWrite)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-project-wall", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "wall_classify", Description: "Classify a below-the-line op against the active project scope (identity+project): allow if same project under the same identity, else deny with AGENT_CROSS_PROJECT_WRITE. Pure, deterministic — the same predicate the Postgres RLS enforces."}, classifyTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "wall_block_code", Description: "The stable BlockReason code this wall emits for a cross-project / forged-identity op (AGENT_CROSS_PROJECT_WRITE)."}, codeTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("project-wall: run: %v", err)
	}
}
