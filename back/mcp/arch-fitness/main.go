// Command arch-fitness is the AIDOS S102 STRUCTURAL-RATCHET MCP server (ADR 0009: every backend op
// is an MCP tool; app-builder EPIC 11, the second ratchet §47).
//
// It is the capability door over kernel/mirror/archfitness: the ARCH-FITNESS ratchet over the
// inter-cell dependency graph. The tools (measure/ratchet/gate/propose), the wall rationale and
// the determinism note now live in the reusable library back/mcp/arch-fitness/archfitnesssrv
// (extracted at S59 so the gateway dispatcher reuses the SAME server in-process — reuse, don't
// reinvent, CLAUDE.md §0). This binary is the thin stdio entrypoint.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/arch-fitness/archfitnesssrv"
)

func main() {
	ctx := context.Background()
	srv := archfitnesssrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("arch-fitness: run: %w", err))
	}
}
