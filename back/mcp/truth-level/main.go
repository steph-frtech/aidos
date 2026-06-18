// Command truth-level is the AIDOS Kernel truth-level MCP server (FK01; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the truthlevelsrv library.
//
// The handlers + tool registration live in the truthlevelsrv LIBRARY (back/mcp/truth-level/
// truthlevelsrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no
// twin (reuse, don't reinvent, CLAUDE.md §0). See truthlevelsrv for the FK01 door
// (compute/check_parity/levels).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/truth-level/truthlevelsrv"
)

func main() {
	ctx := context.Background()
	srv := truthlevelsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("truth-level: run: %w", err))
	}
}
