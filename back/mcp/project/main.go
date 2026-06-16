// Command project is the AIDOS Kernel/Archive `project` MCP server (S53; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// `projects` schema — the first-rank multi-tenant root scope under which every later truth
// lives (app-builder EPIC 1). A project is BELOW the wall (CLAUDE.md §2): the projects schema
// is not kernel/mirrors/fitness, it is content-addressed and append-only, so this server writes
// it directly via the store path (like the Archive content-store). It NEVER writes
// kernel/mirrors/fitness, and it offers NO hard-delete tool — soft delete only (the hard GDPR
// delete is S116).
//
// Tools (create/list/get/archive/restore/delete) + the determinism rationale now live in the
// reusable library back/mcp/project/projectsrv (extracted at S59 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin stdio
// entrypoint: open the store from AIDOS_PROJECTS_DSN, build the server, run it over stdio.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/project/projectsrv"
)

func main() {
	dsn := os.Getenv("AIDOS_PROJECTS_DSN")
	if dsn == "" {
		log.Fatal("project: AIDOS_PROJECTS_DSN is required")
	}
	ctx := context.Background()
	st, err := projectsrv.NewStore(ctx, dsn)
	if err != nil {
		log.Fatal(fmt.Errorf("project: open store: %w", err))
	}
	defer st.Close()

	srv := projectsrv.NewServer(st)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("project: run: %v", err)
	}
}
