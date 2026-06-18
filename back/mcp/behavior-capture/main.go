// Command behavior-capture is the AIDOS Runtime behavior-capture MCP server (S67; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the behaviorcapturesrv library.
//
// The handlers + tool registration live in the behaviorcapturesrv LIBRARY (back/mcp/behavior-capture/
// behaviorcapturesrv) so BOTH this stdio binary AND the S59 gateway dispatcher (back/runtime/
// gatewaydispatch) construct identical behaviour from one source — no duplicated logic, no twin
// (reuse, don't reinvent, CLAUDE.md §0). See behaviorcapturesrv for the S67 capture door
// (behavior_library / behavior_attach_at_capture).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/behavior-capture/behaviorcapturesrv"
)

func main() {
	ctx := context.Background()
	srv := behaviorcapturesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("behavior-capture: run: %w", err))
	}
}
