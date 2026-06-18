// Command mirror-watch is the AIDOS Mirror watch-it-fail MCP server (S69; ADR 0009: every backend op
// is an MCP tool) — the standalone stdio binary over the mirrorwatchsrv library.
//
// The handlers + tool registration live in the mirrorwatchsrv LIBRARY (back/mcp/mirror-watch/
// mirrorwatchsrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See mirrorwatchsrv for the S69 watch-it-fail door
// (watch_materialize / watch_run).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/mirror-watch/mirrorwatchsrv"
)

func main() {
	ctx := context.Background()
	srv := mirrorwatchsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("mirror-watch: run: %w", err))
	}
}
