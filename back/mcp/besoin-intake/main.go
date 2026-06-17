// Command besoin-intake is the AIDOS Archive besoin-intake MCP server (ROADMAP EL15; ADR 0009).
//
// It is the standalone stdio entrypoint over the BesoinGraph — the SINGLE capability door over the
// NEED store ABOVE the wall (CLAUDE.md §2), DISTINCT from the truth-store (kernel/mirrors/fitness),
// NOT an exception to the wall. ALL the handler logic lives in the besoinintakesrv LIBRARY package
// (back/mcp/besoin-intake/besoinintakesrv), reused IDENTICALLY by the gateway dispatcher (S59/ADR
// 0092) so the Go engine is the single live source — no twin (CLAUDE.md §0).
//
// DUAL-STORE, RLS-SCOPED. This binary opens TWO stores from AIDOS_BESOIN_DSN: the besoin Store (the
// need graph, RLS-scoped to `project` via the SET LOCAL `aidos.project` GUC — S55) AND the IdeaStore
// (the legal EL05 emission door, reusing the `ideas` schema). The single DSN carries both grants
// (besoin + ideas reuse); both are co-located schemas in the one truth-store. There is NO
// idea_promote_to_kernel, NO kernel/mirrors/fitness write anywhere on this path (WroteKernel always
// false; a kernel write is refused by GRANT). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/besoin-intake/besoinintakesrv"
)

func main() {
	dsn := os.Getenv("AIDOS_BESOIN_DSN")
	if dsn == "" {
		log.Fatal("besoin-intake: AIDOS_BESOIN_DSN is required")
	}
	ctx := context.Background()
	st, err := besoinintakesrv.NewStore(ctx, dsn)
	if err != nil {
		log.Fatal(fmt.Errorf("besoin-intake: open store: %w", err))
	}
	defer st.Close()
	is, err := besoinintakesrv.NewIdeaStore(ctx, dsn)
	if err != nil {
		log.Fatal(fmt.Errorf("besoin-intake: open idea store: %w", err))
	}
	defer is.Close()

	srv := besoinintakesrv.NewServer(st, is)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("besoin-intake: run: %v", err)
	}
}
