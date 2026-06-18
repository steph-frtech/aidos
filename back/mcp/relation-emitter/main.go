// Command relation-emitter is the AIDOS Kernel relation-aware emitter MCP server (S74; ADR
// 0009: every backend op is an MCP tool) — the standalone stdio binary over the
// relationemittersrv library.
//
// The handlers + tool registration live in the relationemittersrv LIBRARY (back/mcp/
// relation-emitter/relationemittersrv) so BOTH this stdio binary AND the S59 gateway dispatcher
// (back/runtime/gatewaydispatch) construct identical behaviour from one source — no duplicated
// logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See relationemittersrv for the S74 door
// (emit_ddl/emit_ts/emit_worker/emit_all/schema_hash).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/relation-emitter/relationemittersrv"
)

func main() {
	ctx := context.Background()
	srv := relationemittersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("relation-emitter: run: %w", err))
	}
}
