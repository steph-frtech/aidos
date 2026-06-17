// Command learn is the AIDOS S107 `/learn` MCP server (ROADMAP-app-builder §S107, EPIC 12 / E12;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S107 (back/runtime/learn): the LOOP-CLOSURE that turns an approved
// new mirror into a kernel hash bump and a TARGETED red wave. The tools
// (bump_hash/targeted_wave/close_loop), the wall rationale, the determinism note and the S59
// RawMessage-scar wrapper now live in the reusable library back/mcp/learn/learnsrv (extracted at
// S59 so the gateway dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md
// §0). This binary is the thin stdio entrypoint.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/learn/learnsrv"
)

func main() {
	ctx := context.Background()
	srv := learnsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("learn: run: %w", err))
	}
}
