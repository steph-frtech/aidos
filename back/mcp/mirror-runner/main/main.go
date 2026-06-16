// Command mirror-runner is the AIDOS Mirror cliquet MCP server (S05). It is the single
// capability door (ADR 0009: every backend op is an MCP tool) over the cliquet: replay the
// living mirror set, and check a candidate against the recorded baseline. It READS the mirror
// set from the `mirrors` schema and WRITES only its own run-log (runtime.mirror_runs) — the
// wall holds (CLAUDE.md §2).
//
// The mirror_replay/ratchet_check tools + the Ratchet wiring now live in the reusable library
// back/mcp/mirror-runner/mirrorrunnersrv (extracted at S59 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin
// stdio entrypoint: build the Ratchet from AIDOS_ARCHIVE_DSN, build the server, run it over
// stdio.
//
// Transport: stdio. DSN comes from AIDOS_ARCHIVE_DSN. The Replayer wiring (how a materialized
// mirror is actually run) is the S05 BaselineReplayer (verdicts come from a prior recorded
// run), so the server is operable now and S06+ tightens the replay seam.
package main

import (
	"context"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/mirror-runner/mirrorrunnersrv"
)

func main() {
	dsn := os.Getenv("AIDOS_ARCHIVE_DSN")
	if dsn == "" {
		log.Fatal("mirror-runner: AIDOS_ARCHIVE_DSN is required")
	}
	ctx := context.Background()

	r, err := mirrorrunnersrv.NewRatchet(ctx, dsn)
	if err != nil {
		log.Fatalf("mirror-runner: build ratchet: %v", err)
	}

	srv := mirrorrunnersrv.NewServer(r)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("mirror-runner: run: %v", err)
	}
}
