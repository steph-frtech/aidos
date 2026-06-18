// Command facet-wire is the AIDOS Mirror facet-wire MCP server (FK08; ADR 0009: every backend
// op is an MCP tool) — the standalone stdio binary over the facetwiresrv library.
//
// The handlers + tool registration live in the facetwiresrv LIBRARY (back/mcp/facet-wire/
// facetwiresrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no
// twin (reuse, don't reinvent, CLAUDE.md §0). See facetwiresrv for the FK08 facet-wire door
// (facet_wire / facet_skeleton).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/facet-wire/facetwiresrv"
)

func main() {
	ctx := context.Background()
	srv := facetwiresrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("facet-wire: run: %w", err))
	}
}
