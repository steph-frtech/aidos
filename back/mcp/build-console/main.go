// Command build-console is the thin stdio entrypoint of the AIDOS Workbench build-console MCP
// server (S86; ADR 0009: every backend op is an MCP tool).
//
// The tools (buildconsole_project/buildconsole_record_stable_phase), the wall rationale and the
// determinism note now live in the reusable library back/mcp/build-console/buildconsolesrv
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
	"github.com/steph-frtech/aidos/back/mcp/build-console/buildconsolesrv"
)

func main() {
	ctx := context.Background()
	srv := buildconsolesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("build-console: run: %w", err))
	}
}
