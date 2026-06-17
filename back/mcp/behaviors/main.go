// Command behaviors is the thin stdio entrypoint of the AIDOS Kernel behavior-LIBRARY MCP
// server (S79; ADR 0009: every backend op is an MCP tool).
//
// The seven library gestures (behaviors_browse/search/tag/publish/soft_delete/comment/attach),
// the project-scoped + stateless rationale, the wall (attach lands only via an approved
// ChangeSet) and the determinism notes now live in the reusable library
// back/mcp/behaviors/behaviorssrv (extracted at ADR 0092 batch-2 so the gateway dispatcher
// reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the engine is the
// SINGLE live source). This binary just builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/behaviors/behaviorssrv"
)

func main() {
	srv := behaviorssrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("behaviors MCP server: %v", err)
	}
}
