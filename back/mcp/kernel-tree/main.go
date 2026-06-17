// Command kernel-tree is the AIDOS Kernel COMPOSITION-TREE MCP server (KRD §108/§109 — the
// `composes` mereology link; ADR 0009: every backend op is an MCP tool) — the standalone stdio
// binary over the kerneltreesrv library.
//
// The handlers + tool registration live in the kerneltreesrv LIBRARY (back/mcp/kernel-tree/
// kerneltreesrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See kerneltreesrv for the §109 composition-tree door
// (tree_weights/aggregate/reopens).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/kernel-tree/kerneltreesrv"
)

func main() {
	ctx := context.Background()
	srv := kerneltreesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("kernel-tree: run: %w", err))
	}
}
