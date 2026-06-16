// Command idea-intake is the AIDOS Kernel idea-intake MCP server (KRD §75/§116/
// §117/§118; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over
// the `ideas` schema — candidate-truths staged ABOVE product but BELOW the freeze,
// with no version-freeze and no mirror (KRD §118). It is the legal on-ramp toward
// truth: a human ("finalement je veux que…") or an incident (#NNNN) captures an
// Idea with provenance, then the lifecycle advances it
// draft → grilled → {spiking → harvested | harvested}, with a traced reject branch.
//
// It carries the `ideas`-schema lifecycle grant (INSERT/SELECT/UPDATE — never
// DELETE; a rejected idea is kept). It deliberately has NO tool that bypasses the
// mirror: there is no `idea_promote_to_kernel` here. Promotion = writing the idea's
// mirror = the /goal = the freeze, gated by the promotion-gate hook
// (NO_MIRROR_NO_KERNEL); the kernel write is the aidos CLI role, never this server
// (the wall, CLAUDE.md §2).
//
// Tools (capture/grill/spike/harvest/reject/status/list + the MK03 convert door) +
// the determinism rationale now live in the reusable library
// back/mcp/idea-intake/ideaintakesrv (extracted at S59 so the gateway dispatcher
// reuses the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This
// binary is the thin stdio entrypoint: open the store from AIDOS_IDEAS_DSN, build the
// server with the reference DocConverter adapter, run it over stdio.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/idea-intake/ideaintakesrv"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
)

func main() {
	dsn := os.Getenv("AIDOS_IDEAS_DSN")
	if dsn == "" {
		log.Fatal("idea-intake: AIDOS_IDEAS_DSN is required")
	}
	ctx := context.Background()
	st, err := ideaintakesrv.NewStore(ctx, dsn)
	if err != nil {
		log.Fatal(fmt.Errorf("idea-intake: open store: %w", err))
	}
	defer st.Close()

	srv := ideaintakesrv.NewServer(st, markitdown.HTMLConverter{})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("idea-intake: run: %v", err)
	}
}
