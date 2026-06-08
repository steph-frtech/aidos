// Command env-rollback is the AIDOS S98 ENVIRONMENTS + ROLLBACK-TO-PHASE MCP server (ADR 0009:
// every backend op is an MCP tool; app-builder EPIC 10, DP28 / ADR 0043).
//
// It is the capability door over archive/envrollback: promotion of a STABLE phase into an
// environment (preview→staging→prod) and ROLLBACK of an environment to an EARLIER stable phase by
// DETERMINISTIC RE-PROJECTION (S78) — never a restore of a stale sandbox artifact (CLAUDE.md §9).
// Tools:
//
//	promote        — PromoteInput → content-addressed Promotion, but ONLY when the phase is
//	                 stable (« done is computed »). A non-stable phase is refused
//	                 ENV_PROMOTE_NOT_STABLE (the Stop-gate, inherited from S96). PURE.
//	rollback       — RollbackInput → content-addressed RollbackDecision (re-projection of N-1 +
//	                 datastore reconciliation + provenance), but ONLY when the target is a distinct,
//	                 earlier, stable phase — else ROLLBACK_NOT_EARLIER / ENV_PROMOTE_NOT_STABLE. PURE.
//	check_served   — assert the env's served-app hash AFTER rollback EQUALS a fresh re-emit of the
//	                 target phase (the re-projection property; a stale artifact is a BlockReason).
//	ladder         — the closed promotion ladder in order (preview, staging, prod).
//
// THE WALL (CLAUDE.md §2/§9): pure planning + pure comparisons over supplied facts — writes
// NOTHING to the kernel/mirrors/fitness. A rollback is a RECORDED DECISION (provenance §9), not a
// write-to-kernel; the Workbench /deploy screen proposes it as a ChangeSet for approval. A
// non-stable phase, a non-earlier rollback target, a stale artifact — each is a typed BlockReason.
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

type promoteInput struct {
	Input envrollback.PromoteInput `json:"input" jsonschema:"the promotion request: the target environment (preview|staging|prod), the phase to promote (its cut verdict, gate and emitted surface), and the project"`
}

type promoteOutput struct {
	OK        bool                     `json:"ok"`
	Promotion *envrollback.Promotion   `json:"promotion,omitempty"`
	Block     *blockreason.BlockReason `json:"block,omitempty"`
}

func promoteTool(_ context.Context, _ *mcp.CallToolRequest, in promoteInput) (*mcp.CallToolResult, promoteOutput, error) {
	p, br := envrollback.Promote(in.Input)
	if br != nil {
		return nil, promoteOutput{OK: false, Block: br}, nil
	}
	return nil, promoteOutput{OK: true, Promotion: &p}, nil
}

type rollbackInput struct {
	Input envrollback.RollbackInput `json:"input" jsonschema:"the rollback request: the environment, the project, the currently-served phase (N), the earlier target phase (N-1), the DAG lineage of the served phase, an optional datastore reconciliation change, and the actor/reason (provenance)"`
}

type rollbackOutput struct {
	OK       bool                          `json:"ok"`
	Decision *envrollback.RollbackDecision `json:"decision,omitempty"`
	Block    *blockreason.BlockReason      `json:"block,omitempty"`
}

func rollbackTool(_ context.Context, _ *mcp.CallToolRequest, in rollbackInput) (*mcp.CallToolResult, rollbackOutput, error) {
	d, br := envrollback.Rollback(in.Input)
	if br != nil {
		return nil, rollbackOutput{OK: false, Block: br}, nil
	}
	return nil, rollbackOutput{OK: true, Decision: &d}, nil
}

type checkServedInput struct {
	Decision      envrollback.RollbackDecision `json:"decision" jsonschema:"the rollback decision built by the rollback tool"`
	Target        envrollback.PhaseInput       `json:"target" jsonschema:"the target phase (N-1) the env rolled back to"`
	ServedAppHash string                       `json:"served_app_hash" jsonschema:"the served-app hash the env reports AFTER rollback"`
}

type checkServedOutput struct {
	OK    bool                     `json:"ok"`
	Match bool                     `json:"match"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func checkServedTool(_ context.Context, _ *mcp.CallToolRequest, in checkServedInput) (*mcp.CallToolResult, checkServedOutput, error) {
	ok, br := envrollback.RollbackProducesReProjection(in.Decision, in.Target, in.ServedAppHash)
	return nil, checkServedOutput{OK: true, Match: ok, Block: br}, nil
}

type ladderInput struct{}

type ladderOutput struct {
	OK     bool                      `json:"ok"`
	Ladder []envrollback.Environment `json:"ladder"`
}

func ladderTool(_ context.Context, _ *mcp.CallToolRequest, _ ladderInput) (*mcp.CallToolResult, ladderOutput, error) {
	return nil, ladderOutput{OK: true, Ladder: envrollback.LadderInOrder()}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-env-rollback", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "promote", Description: "S98: promote a STABLE phase into an environment (preview→staging→prod) — the env serves the RE-EMITTED app of the phase (S78). A non-stable phase is refused ENV_PROMOTE_NOT_STABLE (Stop-gate inherited from S96). PURE, content-addressed, writes nothing (the wall)."}, promoteTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "rollback", Description: "S98: roll an environment back to an EARLIER stable phase = re-projection (S78) of N-1 + datastore reconciliation (S95 inverse) + recorded provenance (§9). The target must be distinct, earlier and stable — else ROLLBACK_NOT_EARLIER / ENV_PROMOTE_NOT_STABLE. NEVER restores a stale sandbox artifact. PURE, append-only; the screen proposes it as a ChangeSet."}, rollbackTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_served", Description: "S98 re-projection property: assert the env's served-app hash AFTER rollback EQUALS a fresh re-emit of the target phase; a stale sandbox artifact is a BlockReason. Code judges the equality."}, checkServedTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "ladder", Description: "S98: the closed promotion ladder in order (preview, staging, prod)."}, ladderTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("env-rollback: run: %w", err))
	}
}
