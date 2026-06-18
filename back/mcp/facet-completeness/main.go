// Command facet-completeness is the AIDOS Mirror facet-aware completeness MCP server (FK04;
// ADR 0009: every backend op is an MCP tool) — the standalone stdio binary over the
// facetcompletenesssrv library.
//
// The handler + tool registration live in the facetcompletenesssrv LIBRARY (back/mcp/
// facet-completeness/facetcompletenesssrv) so BOTH this stdio binary AND the S59 gateway
// dispatcher (back/runtime/gatewaydispatch) construct identical behaviour from one source —
// no duplicated logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See facetcompletenesssrv
// for the FK04 facet-aware completeness door (check).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/facet-completeness/facetcompletenesssrv"
)

func main() {
	ctx := context.Background()
	srv := facetcompletenesssrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("facet-completeness: run: %w", err))
	}
}
