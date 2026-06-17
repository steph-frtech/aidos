// Command federation is the AIDOS Runtime cross-cell federation MCP server (S103; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S103 (back/runtime/federation): the COMPOSITION layer that
// wires the cross-cell invariant kinds onto REAL MULTIPLE cells and the runtime red-wave — §51.
// The tools (saga_over_cells/fan_out/temporal_over_cells), the wall rationale and the
// determinism note now live in the reusable library back/mcp/federation/federationsrv (extracted
// at S59 so the gateway dispatcher reuses the SAME server in-process — reuse, don't reinvent,
// CLAUDE.md §0). This binary is the thin stdio entrypoint.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/federation/federationsrv"
)

func main() {
	ctx := context.Background()
	srv := federationsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("federation: run: %w", err))
	}
}
