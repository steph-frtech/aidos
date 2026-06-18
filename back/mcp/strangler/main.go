// Command strangler is the AIDOS Archive STRANGLER-FIG MCP server (S104; ADR 0009: every
// backend op is an MCP tool) — the standalone stdio binary over the stranglersrv library.
//
// The handlers + tool registration live in the stranglersrv LIBRARY (back/mcp/strangler/
// stranglersrv) so BOTH this stdio binary AND any future S59 gateway dispatch construct
// identical behaviour from one source — no duplicated logic, no twin (reuse, don't reinvent,
// CLAUDE.md §0). See stranglersrv for the §50 strangler-fig door (carve/freeze/refactor) and
// the note on why it stays OFF the S59 dispatch (the json.RawMessage transport scar).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/strangler/stranglersrv"
)

func main() {
	ctx := context.Background()
	srv := stranglersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("strangler: run: %w", err))
	}
}
