// Command evolve is the AIDOS Runtime EvolutionSandbox MCP server (S42, KRD §66.1).
//
// It is the medium-loop capability door (ADR 0009: every backend op is an MCP tool)
// over the EvolutionSandbox. Every tool DEFERS to the pure runtime/evolve engine
// (Confine/Promote/Evolve) — it re-implements nothing. The server runs the §62 ②
// loop in QUARANTINE: it may emit only candidate branches (/branches/evolution),
// reports (/reports), ideas (/ideas/proposed), and it may NEVER write /kernel,
// /mirrors/above, /authority, /fitness. "L'évolution explore, elle ne gouverne pas."
//
// Tools (evolve_run/confine/propose_promotion/run_get/run_list/coverage) + the
// determinism rationale + the wall now live in the reusable library
// back/mcp/evolve/evolvesrv (extracted at S59 so the gateway dispatcher reuses the
// SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the
// thin stdio entrypoint: build the deterministic server (arming the GATED LLM
// self-play exception only when AIDOS_EVOLVE_SELFPLAY=1), run it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/evolve/evolvesrv"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// selfPlayEnabled reports whether the real self-play generator is wired (env-gated, so the
// default + the hermetic tests stay on the deterministic sampler). AIDOS_EVOLVE_SELFPLAY=1
// arms the EG03 generator behind the seam (the gated LLM exception, §6).
func selfPlayEnabled() bool { return os.Getenv("AIDOS_EVOLVE_SELFPLAY") == "1" }

func main() {
	srv := evolvesrv.NewServer()
	if selfPlayEnabled() {
		// Production arms the REAL self-play generator (the gated LLM exception, §6): the
		// claude CLI with a deterministic FixtureProposer fallback. The dispatch path
		// (gateway, S59) NEVER arms this — no LLM in the dispatch loop.
		srv = evolvesrv.NewServerWithSelfPlay(evolve.ClaudeProposer)
	}
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("evolve: run: %v", err)
	}
}
