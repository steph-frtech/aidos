// Command dsl-editor is the thin stdio entrypoint of the AIDOS Kernel typed-DSL-editor MCP server
// (S77; ADR 0009: every backend op is an MCP tool).
//
// The three tools (dsl_kinds/dsl_parse/dsl_propose), the typed-form rationale, the wall (no apply
// tool; freezing the edited source stays the /goal flow), the determinism notes and the S59
// RawMessage-scar guard (Body/Canonical wrapped as OBJECT schemas) now live in the reusable library
// back/mcp/dsl-editor/dsleditorsrv (extracted at ADR 0092 batch-3 so the gateway dispatcher reuses
// the SAME server in-process — reuse, don't reinvent, CLAUDE.md §0; the engine is the SINGLE live
// source). This binary just builds the deterministic server and runs it over stdio.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/dsl-editor/dsleditorsrv"
)

func main() {
	srv := dsleditorsrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("dsl-editor: run: %w", err))
	}
}
