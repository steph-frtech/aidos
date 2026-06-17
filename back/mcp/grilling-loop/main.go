// Command grilling-loop is the AIDOS Runtime grilling-loop MCP server (S65; ADR 0009: every backend op
// is an MCP tool).
//
// It is the standalone stdio entrypoint over the S65 in-product grilling loop. ALL the handler logic
// lives in the grillingloopsrv LIBRARY package (back/mcp/grilling-loop/grillingloopsrv), reused
// IDENTICALLY by the gateway dispatcher (S59/ADR 0092 batch-4B) so the Go engine is the single live
// source — no twin (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools (one tool = one backend op): grill_route · grill_verify_verdict · grill_verdicts — every tool is
// PURE computation, the routing is deterministic and authoritative, the LLM is the barricaded exception
// re-verified against the closed schema (the wall, CLAUDE.md §2; the routed idea persists via the
// idea-intake door, WroteKernel always false). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/grilling-loop/grillingloopsrv"
)

func main() {
	ctx := context.Background()
	srv := grillingloopsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("grilling-loop: run: %w", err))
	}
}
