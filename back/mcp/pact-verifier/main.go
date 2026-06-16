// Command pact-verifier is the AIDOS Runtime Pact provider-verification MCP server (S36).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) for Pact
// PROVIDER VERIFICATION (CLAUDE.md §3, the frozen N3/N5 "Pact between cells" + "Pact provider
// verification" slots). Given a projected operation+entity, it emits the Pact contract, stands
// the emitted handler up IN-PROCESS (ADR 0026: net/http/httptest, no external Ruby daemon),
// replays the interaction, and reports whether the provider honours the contract.
//
// THE DONE CRITERION runs through here: pact_verify on createOrder must PASS.
//
// The pact_verify tool + the determinism rationale now live in the reusable library
// back/mcp/pact-verifier/pactverifiersrv (extracted at S59 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin
// stdio entrypoint: build the dep-free server, run it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/pact-verifier/pactverifiersrv"
)

func main() {
	if err := pactverifiersrv.NewServer().Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("pact-verifier: run: %v", err)
	}
}
