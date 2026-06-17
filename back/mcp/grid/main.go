// Command grid is the AIDOS Kernel grille MCP server (FK03; ADR 0009: every backend op is an
// MCP tool) — the standalone stdio binary over the gridsrv library.
//
// The handlers + tool registration live in the gridsrv LIBRARY (back/mcp/grid/gridsrv) so BOTH
// this stdio binary AND the S59 gateway dispatcher (back/runtime/gatewaydispatch) construct
// identical behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent,
// CLAUDE.md §0). See gridsrv for the FK03 grille door (grid_build/resolve/mark/affected/rungs).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/grid/gridsrv"
)

func main() {
	ctx := context.Background()
	srv := gridsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("grid: run: %w", err))
	}
}
