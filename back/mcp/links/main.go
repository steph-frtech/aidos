// Command links is the AIDOS Kernel LINKS MCP server (KRD §41; ADR 0009: every backend op is
// an MCP tool) — the standalone stdio binary over the linksrv library.
//
// The handlers + tool registration live in the linksrv LIBRARY (back/mcp/links/linksrv) so BOTH
// this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch) construct
// identical behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent,
// CLAUDE.md §0). See linksrv for the §41 links door (links_kinds/validate/resolve/graph).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/links/linksrv"
)

func main() {
	ctx := context.Background()
	srv := linksrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("links: run: %w", err))
	}
}
