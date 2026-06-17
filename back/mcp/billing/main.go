// Command billing is the thin stdio entrypoint of the AIDOS Runtime/Workbench BILLING MCP server
// (S114; ADR 0009: every backend op is an MCP tool).
//
// The six tools (billing_plans/meter/meter_project/check_quota/ingest_webhook/pact_verify), the
// wall (every tool below the line — no kernel/mirrors/fitness write), and the determinism notes now
// live in the reusable library back/mcp/billing/billingsrv (extracted at ADR 0092 batch-3 so the
// gateway dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the
// engine is the SINGLE live source). This binary just builds the deterministic server and runs it
// over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/billing/billingsrv"
)

func main() {
	srv := billingsrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("aidos-billing MCP server: %v", err)
	}
}
