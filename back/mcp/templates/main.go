// Command templates is the thin stdio entrypoint of the AIDOS S81 CURATED TEMPLATE CATALOGUE MCP
// server (ADR 0009: every backend op is an MCP tool).
//
// The four tools (templates_list/get/instantiate/fork), the curated-catalogue rationale, the wall
// (instantiate/fork are dry-run values; landing the bundle's truths rides propose → ChangeSet →
// approval) and the determinism notes now live in the reusable library
// back/mcp/templates/templatessrv (extracted at ADR 0092 batch-3 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the engine is the SINGLE live
// source). This binary just builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/templates/templatessrv"
)

func main() {
	srv := templatessrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("templates MCP server: %v", err)
	}
}
