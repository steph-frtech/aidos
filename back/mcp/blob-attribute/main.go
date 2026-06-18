// Command blob-attribute is the AIDOS Kernel BLOB / FILE attribute MCP server (S72; ADR 0009:
// every backend op is an MCP tool) — the standalone stdio binary over the blobattributesrv library.
//
// The handlers + tool registration live in the blobattributesrv LIBRARY
// (back/mcp/blob-attribute/blobattributesrv) so BOTH this stdio binary AND the S59 gateway
// dispatcher (back/runtime/gatewaydispatch) construct identical behaviour from one source — no
// duplicated logic, no twin (reuse, don't reinvent, CLAUDE.md §0). See blobattributesrv for the
// S72 blob door (blob_address/validate_upload/storage_key/cross_project/emit_handler).
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/blob-attribute/blobattributesrv"
)

func main() {
	ctx := context.Background()
	srv := blobattributesrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("blob-attribute: run: %w", err))
	}
}
