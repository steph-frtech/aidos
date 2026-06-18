// Command hono-emitter is the AIDOS Runtime emitted-app SERVER emitter MCP server (S87; ADR 0009:
// every backend op is an MCP tool) — the standalone stdio binary over the honoemittersrv library.
//
// The handlers + tool registration live in the honoemittersrv LIBRARY
// (back/mcp/hono-emitter/honoemittersrv) so BOTH this stdio binary AND the S59 gateway dispatcher
// (back/runtime/gatewaydispatch) construct identical behaviour from one source — no duplicated
// logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See honoemittersrv for the S87 emitter door
// (emit_server/emit_worker/emit_pulumi/server_hash/manifest_hash).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/hono-emitter/honoemittersrv"
)

func main() {
	ctx := context.Background()
	srv := honoemittersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("hono-emitter: run: %w", err))
	}
}
