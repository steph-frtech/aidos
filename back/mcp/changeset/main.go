// Command changeset is the AIDOS Archive ChangeSet MCP server (KRD §44, §98; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// `changesets` schema — the transactional history of truth. A ChangeSet is the ONLY legal way truth
// moves: it bundles a spec_delta and its mirror_delta in ONE atomic, content-addressed body and
// flips through DRAFT → APPLIED → REVERTED, append-only. This server carries the privileged `aidos`
// writer DSN; the agent role is SELECT-only (the wall, CLAUDE.md §2) and never writes truth directly.
//
// Tools (open/apply/revert/discard/status/list) + the determinism rationale now live in the
// reusable library back/mcp/changeset/changesetsrv (extracted at S59 so the gateway dispatcher
// reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin
// stdio entrypoint: open the store from AIDOS_CHANGESET_DSN, build the server, run it over stdio.
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/mcp/changeset/changesetsrv"
)

func main() {
	dsn := os.Getenv("AIDOS_CHANGESET_DSN")
	if dsn == "" {
		log.Fatal("changeset: AIDOS_CHANGESET_DSN is required")
	}
	ctx := context.Background()
	st, err := cs.NewStore(ctx, dsn)
	if err != nil {
		log.Fatalf("changeset: open store: %v", err)
	}
	defer st.Close()

	srv := changesetsrv.NewServer(st, time.Now)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("changeset: run: %v", err)
	}
}
