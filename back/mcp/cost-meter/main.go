// Command cost-meter is the thin stdio entrypoint of the AIDOS Runtime COST-METER MCP server
// (S111; ADR 0009: every backend op is an MCP tool).
//
// The tools (cost_meter_cell/cost_disjoncteur_signal/cost_validate_budget), the wall rationale
// and the determinism note now live in the reusable library back/mcp/cost-meter/costmetersrv
// (extracted at ADR 0092 batch-2 so the gateway dispatcher reuses the SAME server in-process —
// reuse, don't reinvent, CLAUDE.md §0; the engine is the SINGLE live source). This binary just
// builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/cost-meter/costmetersrv"
)

func main() {
	ctx := context.Background()
	srv := costmetersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("cost-meter: run: %w", err))
	}
}
