// Command conscience is the AIDOS Runtime conscience MCP server (FK09; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over FK09 (back/runtime/conscience): the pure DETERMINISTIC AGGREGATOR
// that composes the verdicts of the EXISTING judges into ONE ConsciousnessReport per kernel + the
// §FKE-31 decision cards. The tools (reconcile/decision_cards), the wall rationale and the
// determinism note now live in the reusable library back/mcp/conscience/consciencesrv (extracted
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
	"github.com/steph-frtech/aidos/back/mcp/conscience/consciencesrv"
)

func main() {
	ctx := context.Background()
	srv := consciencesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("conscience: run: %w", err))
	}
}
