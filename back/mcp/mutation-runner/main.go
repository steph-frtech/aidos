// Command mutation-runner is the AIDOS Mirror mutation-testing MCP server (S40) — a thin
// stdio entrypoint over the reusable mutationrunnersrv library (ADR 0007: the gateway hosts the
// SAME handlers in-process, no twin). Mutation testing is the PIPELINE, post-integration drawer
// (KRD §19): expensive, run PERIODICALLY (serrage), NOT at each diff — an on-demand callable op.
//
// THE WALL (CLAUDE.md §2/§8): the threshold is read SELECT-only from `fitness` (above the
// waterline); this server writes NOTHING above the line — it appends only to
// runtime.mutation_runs (below the waterline).
//
// INJECTION SEAM: when AIDOS_RUNTIME_DSN is set the server reads the threshold from fitness via
// PgxThresholdReader and records to runtime via PgxRunRecorder. When empty it runs a
// deterministic mock (the example bars) so the Workbench can demonstrate the seam without a
// database — the mock NEVER authors a real bar, it surfaces an EXAMPLE configuration.
//
// Transport: stdio.
package main

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/mutation-runner/mutationrunnersrv"
	"github.com/steph-frtech/aidos/back/runtime/sensors/mutation"
)

func main() {
	ctx := context.Background()
	var srv *mcp.Server
	if dsn := os.Getenv("AIDOS_RUNTIME_DSN"); dsn == "" {
		// Deterministic mock (example bars), proving the seam without a database.
		srv = mutationrunnersrv.NewServer(
			mutation.MockThresholdReader{Bars: map[mutation.Scope]float64{mutation.ScopeGo: 0.80, mutation.ScopeFront: 0.70}},
			&mutation.MockRunRecorder{},
			time.Now,
		)
	} else {
		s, err := mutationrunnersrv.NewFromDSN(ctx, dsn)
		if err != nil {
			log.Fatalf("mutation-runner: open: %v", err)
		}
		srv = s
	}
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("mutation-runner: run: %v", err)
	}
}
