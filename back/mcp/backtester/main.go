// Command backtester is the AIDOS Runtime out-of-sample evaluation MCP server (S42,
// KRD §62 ② out_of_sample, §87).
//
// It is the out-of-sample / walk-forward evaluation capability door (ADR 0009: every backend
// op is an MCP tool). KRD §87 — the brutal truth: an in-sample Sharpe ≈ no predictive power;
// the market is adversarial / non-stationary; out-of-sample / walk-forward is the ONLY honest
// signal. This server returns the green/red evidence the EvolutionSandbox promotion gate
// consumes — a fitness READING, not a fitness definition (CLAUDE.md §8).
//
// The backtest_out_of_sample/backtest_get tools + the determinism rationale now live in the
// reusable library back/mcp/backtester/backtestersrv (extracted at S59 so the gateway
// dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This
// binary is the thin stdio entrypoint: build the dep-free server, run it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/backtester/backtestersrv"
)

func main() {
	if err := backtestersrv.NewServer().Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("backtester: run: %v", err)
	}
}
