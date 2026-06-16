// Command store is the AIDOS Archive content-store MCP server (ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// content-addressed append-only store. The Workbench and other agents call these tools;
// they never touch the archive tables directly. The store sits below the wall, but writes
// still flow through this one server.
//
// The tools (store_put/get/set_head/get_head/history) + the determinism rationale now live
// in the reusable library back/mcp/store/storesrv (extracted at S59 so the gateway
// dispatcher reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This
// binary is the thin stdio entrypoint: open the store from AIDOS_ARCHIVE_DSN, build the
// server, run it over stdio.
package main

import (
	"context"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
	"github.com/steph-frtech/aidos/back/mcp/store/storesrv"
)

func main() {
	dsn := os.Getenv("AIDOS_ARCHIVE_DSN")
	if dsn == "" {
		log.Fatal("store: AIDOS_ARCHIVE_DSN is required")
	}
	ctx := context.Background()
	st, err := contentstore.New(ctx, dsn)
	if err != nil {
		log.Fatalf("store: open content store: %v", err)
	}
	defer st.Close()

	srv := storesrv.NewServer(st)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("store: run: %v", err)
	}
}
