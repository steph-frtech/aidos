// Command kernel-garden is the thin stdio entrypoint of the AIDOS Runtime KERNEL-GARDEN MCP
// server (S112; ADR 0009: every backend op is an MCP tool).
//
// The tools (garden_tend_project/garden_suggest_trim/garden_accept_proposal), the §82.4 /trim
// rationale, the wall and determinism notes now live in the reusable library
// back/mcp/kernel-garden/kernelgardensrv (extracted at ADR 0092 batch-2 so the gateway
// dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the
// engine is the SINGLE live source). This binary just builds the deterministic server and runs
// it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/kernel-garden/kernelgardensrv"
)

func main() {
	ctx := context.Background()
	srv := kernelgardensrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("kernel-garden: run: %w", err))
	}
}
