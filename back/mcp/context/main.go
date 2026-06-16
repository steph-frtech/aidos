// Command context is the AIDOS Runtime ContextRouter MCP server (S33).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// ContextRouter — compile the MINIMAL, branch-aware ContextPack a red goal needs (KRD §143/§144),
// replay a prior pack by its content hash (packs are versioned, §144), and read-only query the
// derived ContextGraph view. The Workbench and other agents call these tools; they never
// re-implement the router.
//
// The tools (context_compile/pack_get/graph_query), the wall rationale and the determinism note
// now live in the reusable library back/mcp/context/contextsrv (extracted at S59 so the gateway
// dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This
// binary is the thin stdio entrypoint: build the server over the deterministic read-only view
// (the mocked `context` schema, §6 — no DSN, no embedder, no clock) and run it over stdio. When
// the derived `context` schema lands, a DB-backed View is injected via contextsrv.NewServer; the
// tools and the wall hold.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/context/contextsrv"
)

func main() {
	srv := contextsrv.DefaultServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("context: run: %v", err)
	}
}
