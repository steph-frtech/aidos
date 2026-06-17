// Command autonomy is the thin stdio entrypoint of the AIDOS Kernel autonomy MCP server
// (FK10; ADR 0009: every backend op is an MCP tool).
//
// The tools (enforce/promote), the A0..A8 ladder, fail-closed enforcement, promotion-from-
// history, the wall and determinism notes now live in the reusable library
// back/mcp/autonomy/autonomysrv (extracted at ADR 0092 batch-2 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the engine is the SINGLE
// live source). This binary just builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/autonomy/autonomysrv"
)

func main() {
	ctx := context.Background()
	srv := autonomysrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("autonomy: run: %w", err))
	}
}
