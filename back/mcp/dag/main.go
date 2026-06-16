// Command dag is the AIDOS Archive Version-DAG MCP server (KRD §120–§125; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the `dag`
// schema — the version space as a DAG (nodes = stable phases S23, edges = ChangeSets S20). It is
// how the version history grows NON-DESTRUCTIVELY: branch off a stable phase, checkout an ancestor
// (a backward head-flag move), and rebranch (the branch-of-a-branch). Nothing is ever destroyed —
// an abandoned line stays in the DAG as a stepping stone (§123). This server carries the privileged
// `aidos` writer DSN; the agent role is SELECT-only (the wall, CLAUDE.md §2) and never writes the
// dag schema directly.
//
// Tools (branch/checkout_ancestor/rebranch/heads/ancestors/get) + the determinism rationale now
// live in the reusable library back/mcp/dag/dagsrv (extracted at S59 so the gateway dispatcher
// reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin
// stdio entrypoint: open the store from AIDOS_DAG_DSN, build the server, run it over stdio.
package main

import (
	"context"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/steph-frtech/aidos/back/mcp/dag/dagsrv"
)

func main() {
	dsn := os.Getenv("AIDOS_DAG_DSN")
	if dsn == "" {
		log.Fatal("dag: AIDOS_DAG_DSN is required")
	}
	ctx := context.Background()
	st, err := dag.NewStore(ctx, dsn)
	if err != nil {
		log.Fatalf("dag: open store: %v", err)
	}
	defer st.Close()

	srv := dagsrv.NewServer(st)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("dag: run: %v", err)
	}
}
