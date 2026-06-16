// Command provision is the thin stdio shell over the AIDOS provisioning MCP server lib
// (back/mcp/provision/provisionsrv) — the capability door (ADR 0009) over the DP13
// stack/bootstrap/profile tools + the S89 per-app datastore planner. The server is
// DEP-FREE (every tool projects over the manifest AST + the observed host state carried
// in the request — no DSN, no store, no clock), so the shell just constructs it via
// provisionsrv.NewServer() and runs it over stdio. The S58 gateway fronts the SAME tools
// over HTTP via provisionsrv.HTTPHandler (the seam the Workbench /bootstrap route calls).
//
// The full server (types, handlers, the server-side wall, NewServer, HTTPHandler) lives
// in the provisionsrv lib — the SAME extraction shape as changeset/store/dag/project/
// memory/context/idea-intake.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/provision/provisionsrv"
)

func main() {
	ctx := context.Background()
	if err := provisionsrv.NewServer().Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("provision: run: %v", err)
	}
}
