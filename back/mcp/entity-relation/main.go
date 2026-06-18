// Command entity-relation is the AIDOS Kernel entity-relation MCP server (S71; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the entityrelationsrv library.
//
// The handlers + tool registration live in the entityrelationsrv LIBRARY (back/mcp/entity-relation/
// entityrelationsrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See entityrelationsrv for the S71 relation door
// (relation_resolve / relation_address).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/entity-relation/entityrelationsrv"
)

func main() {
	ctx := context.Background()
	srv := entityrelationsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("entity-relation: run: %w", err))
	}
}
