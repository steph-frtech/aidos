// Command behavior-expander is the AIDOS Kernel behavior-expander MCP server (S76; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the behaviorexpandersrv library.
//
// The handlers + tool registration live in the behaviorexpandersrv LIBRARY (back/mcp/behavior-expander/
// behaviorexpandersrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See behaviorexpandersrv for the S76 expander door
// (behavior_catalogue / behavior_validate_record / behavior_expand / behavior_propose).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/behavior-expander/behaviorexpandersrv"
)

func main() {
	ctx := context.Background()
	srv := behaviorexpandersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("behavior-expander: run: %w", err))
	}
}
