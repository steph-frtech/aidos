// Command front-emitter is the AIDOS Runtime emitted-app FRONT-END emitter MCP server (S93; ADR 0009:
// every backend op is an MCP tool) — the standalone stdio binary over the frontemittersrv library.
//
// The handlers + tool registration live in the frontemittersrv LIBRARY (back/mcp/front-emitter/
// frontemittersrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See frontemittersrv for the S93 front-emitter door
// (emit_front / emit_bundle / front_hash).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/front-emitter/frontemittersrv"
)

func main() {
	ctx := context.Background()
	srv := frontemittersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("front-emitter: run: %w", err))
	}
}
