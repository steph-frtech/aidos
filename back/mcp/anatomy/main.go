// Command anatomy is the AIDOS Kernel ANATOMY MCP server (FKE — the 1-for-1 reading around the
// wall; ADR 0009: every backend op is an MCP tool) — the standalone stdio binary over the
// anatomysrv library.
//
// The handlers + tool registration live in the anatomysrv LIBRARY (back/mcp/anatomy/anatomysrv)
// so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch)
// construct identical behaviour from one source — no duplicated logic, no twin (reuse, don't
// reinvent, CLAUDE.md §0). See anatomysrv for the FKE anatomy door (anatomy_pairs/voyant/build).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/anatomy/anatomysrv"
)

func main() {
	ctx := context.Background()
	srv := anatomysrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("anatomy: run: %w", err))
	}
}
