// Command why-tree is the AIDOS Runtime WhyTree MCP server (FK13; ADR 0009: every backend op is
// an MCP tool).
//
// It is the capability door over FK13 (back/kernel/whytree): the `/why` gesture — the 5-whys
// REDRESSED. The tools (build/serialize/kinds), the wall rationale and the determinism note now
// live in the reusable library back/mcp/why-tree/whytreesrv (extracted at S59 so the gateway
// dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This
// binary is the thin stdio entrypoint: build the deterministic server and run it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/why-tree/whytreesrv"
)

func main() {
	ctx := context.Background()
	srv := whytreesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("why-tree: run: %w", err))
	}
}
