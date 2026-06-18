// Command ops-observability is the AIDOS S92 OPS-OBSERVABILITY MCP server (app-builder EPIC 9 /
// E12, ROADMAP-app-builder §S92, DP17, ADR 0009: every backend op is an MCP tool) — the standalone
// stdio binary over the opsobservabilitysrv library.
//
// The handlers + tool registration live in the opsobservabilitysrv LIBRARY
// (back/mcp/ops-observability/opsobservabilitysrv) so BOTH this stdio binary AND the S59 gateway
// dispatcher (back/runtime/gatewaydispatch) construct identical behaviour from one source — no
// duplicated logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See opsobservabilitysrv for the
// S92 ops door (ops_ingest/ops_dashboard/ops_fingerprint).
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/ops-observability/opsobservabilitysrv"
)

func main() {
	srv := opsobservabilitysrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("ops-observability MCP server: %v", err)
	}
}
