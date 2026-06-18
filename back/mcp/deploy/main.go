// Command deploy is the AIDOS S96 PHASE-KEYED DEPLOY MCP server (ADR 0009: every backend op is an
// MCP tool; app-builder EPIC 10, DP26 / ADR 0043) — the standalone stdio binary over the deploysrv
// library.
//
// The handlers + tool registration live in the deploysrv LIBRARY (back/mcp/deploy/deploysrv) so
// BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch) construct
// identical behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent,
// CLAUDE.md §0). See deploysrv for the S96 deploy door (plan/gate/check_served/forward_only).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/deploy/deploysrv"
)

func main() {
	ctx := context.Background()
	srv := deploysrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("deploy: run: %w", err))
	}
}
