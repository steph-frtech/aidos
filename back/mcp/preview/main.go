// Command preview is the AIDOS S94 EPHEMERAL PREVIEW ENVIRONMENT MCP server (ADR 0009: every backend
// op is an MCP tool) — the standalone stdio binary over the previewsrv library.
//
// The handlers + tool registration live in the previewsrv LIBRARY (back/mcp/preview/previewsrv) so BOTH
// this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch) construct identical
// behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See
// previewsrv for the S94 ephemeral-preview door (plan / app_hash / check_served).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/preview/previewsrv"
)

func main() {
	ctx := context.Background()
	srv := previewsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("preview: run: %w", err))
	}
}
