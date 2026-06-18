// Command ai-lab is the AIDOS Workbench AI Lab cockpit MCP server (FK11; ADR 0009: every backend
// op is an MCP tool) — the standalone stdio binary over the ailabsrv library.
//
// The handlers + tool registration live in the ailabsrv LIBRARY (back/mcp/ai-lab/ailabsrv) so
// BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch) construct
// identical behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent,
// CLAUDE.md §0). See ailabsrv for the FK11 cockpit door (build_cockpit/propose_slot/scope_pair/
// validate_card).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/ai-lab/ailabsrv"
)

func main() {
	ctx := context.Background()
	srv := ailabsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("ai-lab: run: %w", err))
	}
}
