// Command goal-piloting is the AIDOS Runtime goal-piloting MCP server (S66; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over the S66 UI-piloted /goal (back/runtime/goalpiloting). The tools
// (goal_pilot_open/goal_pilot_close/goal_live_red_set), the wall rationale and the determinism
// note now live in the reusable library back/mcp/goal-piloting/goalpilotingsrv (extracted at S59
// so the gateway dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md
// §0). This binary is the thin stdio entrypoint.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/goal-piloting/goalpilotingsrv"
)

func main() {
	ctx := context.Background()
	srv := goalpilotingsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("goal-piloting: run: %w", err))
	}
}
