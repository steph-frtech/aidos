// Command app-auth is the AIDOS Kernel APP-AUTH behavior-macro MCP server (S80; ADR 0009: every
// backend op is an MCP tool). It is the standalone stdio entrypoint over the S80 `app-auth`
// behavior-macro — the auth & roles subsystem of the EMITTED app.
//
// ALL the handler logic lives in the appauthsrv LIBRARY package (back/mcp/app-auth/appauthsrv),
// reused IDENTICALLY by the gateway dispatcher (S59/ADR 0092) so the Go engine is the single live
// source — no twin (CLAUDE.md §0). This binary just builds that server and runs it over stdio.
//
// Tools: app_auth_expand · app_auth_check_access · app_auth_attach. Every tool is PURE; `attach`
// lands via changeset.Apply (the wall: propose → approve), never a direct kernel write (WroteKernel
// always false). Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/app-auth/appauthsrv"
)

func main() {
	srv := appauthsrv.NewServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("app-auth MCP server: %v", err)
	}
}
