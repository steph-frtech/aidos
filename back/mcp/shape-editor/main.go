// Command shape-editor is the AIDOS Mirror shape-editor MCP server (S68; ADR 0009: every backend op is
// an MCP tool).
//
// It is the standalone stdio entrypoint over the S68 shape-editor. ALL the handler logic lives in the
// shapeeditorsrv LIBRARY package (back/mcp/shape-editor/shapeeditorsrv), reused IDENTICALLY by the
// gateway dispatcher (S59/ADR 0092 batch-4B) so the Go engine is the single live source — no twin
// (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools (one tool = one backend op): shape_derive · shape_parse · shape_merge · shape_propose — every
// tool is PURE computation, the judge is the code (the wall, CLAUDE.md §2; shape_propose is born red
// and WroteMirror is always false). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/shape-editor/shapeeditorsrv"
)

func main() {
	ctx := context.Background()
	srv := shapeeditorsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("shape-editor: run: %w", err))
	}
}
