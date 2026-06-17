// Command build-loop is the thin stdio entrypoint of the AIDOS Runtime build-loop MCP server
// (S83; ADR 0009: every backend op is an MCP tool).
//
// The tools (buildloop_terminate/buildloop_no_progress/buildloop_verdicts), the circuit-breaker
// rationale, the wall and determinism notes now live in the reusable library
// back/mcp/build-loop/buildloopsrv (extracted at ADR 0092 batch-2 so the gateway dispatcher
// reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the engine is the
// SINGLE live source). This binary just builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/build-loop/buildloopsrv"
)

func main() {
	ctx := context.Background()
	srv := buildloopsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("build-loop: run: %w", err))
	}
}
