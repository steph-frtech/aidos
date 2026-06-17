// Command self-cert is the AIDOS Runtime build-loop SELF-CERTIFICATION MCP server (S84; ADR
// 0009: every backend op is an MCP tool).
//
// It is the standalone stdio entrypoint over the S84 self-certification battery. ALL the handler
// logic lives in the selfcertsrv LIBRARY package (back/mcp/self-cert/selfcertsrv), reused
// IDENTICALLY by the gateway dispatcher (S59/ADR 0092) so the Go engine is the single live source —
// no twin (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools (one tool = one backend op): selfcert_certify · selfcert_gate · selfcert_kinds — every tool
// is PURE computation, the judge is the deterministic mirror, never the LLM (the wall, CLAUDE.md §2;
// WroteKernel is always false). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/self-cert/selfcertsrv"
)

func main() {
	ctx := context.Background()
	srv := selfcertsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("self-cert: run: %w", err))
	}
}
