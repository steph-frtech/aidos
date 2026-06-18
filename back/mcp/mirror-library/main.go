// Command mirror-library is the AIDOS Mirror project-library MCP server (S70; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the mirrorlibrarysrv library.
//
// The handlers + tool registration live in the mirrorlibrarysrv LIBRARY
// (back/mcp/mirror-library/mirrorlibrarysrv) so BOTH this stdio binary AND the S59 gateway
// dispatcher (back/runtime/gatewaydispatch) construct identical behaviour from one source — no
// duplicated logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See mirrorlibrarysrv for the
// S70 library door (library_list_by_app/library_scoped_health).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/mirror-library/mirrorlibrarysrv"
)

func main() {
	ctx := context.Background()
	srv := mirrorlibrarysrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("mirror-library: run: %w", err))
	}
}
