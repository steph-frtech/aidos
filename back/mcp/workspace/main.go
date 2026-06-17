// Command workspace is the AIDOS S82 PER-PROJECT SANDBOX MCP server (ADR 0009: every backend op is
// an MCP tool). It is the standalone stdio entrypoint over back/runtime/workspace — the isolated
// per-project workspace where a project's generated code lives, compiles and runs its mirrors.
//
// ALL the handler logic lives in the workspacesrv LIBRARY package (back/mcp/workspace/workspacesrv),
// reused IDENTICALLY by the gateway dispatcher (S59/ADR 0092) so the Go engine is the single live
// source — no twin (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools: workspace_provision · workspace_can_access · workspace_check_resources · workspace_build_hello.
// Every tool is PURE; provisioning is a dry-run value (WroteKernel always false); the truth-store is
// outside every workspace (the wall, CLAUDE.md §2). Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/workspace/workspacesrv"
)

func main() {
	srv := workspacesrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("workspace MCP server: %v", err)
	}
}
