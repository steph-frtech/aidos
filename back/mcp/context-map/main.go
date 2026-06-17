// Command context-map is the AIDOS S101 CONTEXT-MAP MCP server (ADR 0009: every backend op is an MCP
// tool; app-builder EPIC 11).
//
// It is the standalone stdio entrypoint over the S101 context-map. ALL the handler logic lives in the
// contextmapsrv LIBRARY package (back/mcp/context-map/contextmapsrv), reused IDENTICALLY by the gateway
// dispatcher (S59/ADR 0092 batch-4B) so the Go engine is the single live source — no twin (CLAUDE.md §0).
// This binary just builds that server and runs it over stdio.
//
// Tools (one tool = one backend op): verify_pair · verify_all · check_call · propose — every tool is
// PURE computation, the verifier is an algorithm, never an LLM (the wall, CLAUDE.md §2; `propose`
// returns a DRAFT ChangeSet, WroteKernel always false). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/context-map/contextmapsrv"
)

func main() {
	ctx := context.Background()
	srv := contextmapsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("context-map: run: %w", err))
	}
}
