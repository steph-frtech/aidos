// Command entity-modeler is the AIDOS Workbench entity/relation MODELER MCP server (S75; ADR 0009:
// every backend op is an MCP tool).
//
// It is the standalone stdio entrypoint over the S75 modeler. ALL the handler logic lives in the
// entitymodelersrv LIBRARY package (back/mcp/entity-modeler/entitymodelersrv), reused IDENTICALLY by
// the gateway dispatcher (S59/ADR 0092 batch-4B) so the Go engine is the single live source — no twin
// (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools (one tool = one backend op): schema_validate · schema_hash · schema_propose · canvas_merge ·
// canvas_presence — every tool is PURE computation, the judge is the code (the wall, CLAUDE.md §2;
// schema_propose returns a DRAFT ChangeSet, WroteKernel always false). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/entity-modeler/entitymodelersrv"
)

func main() {
	ctx := context.Background()
	srv := entitymodelersrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("entity-modeler: run: %w", err))
	}
}
