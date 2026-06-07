// Command gateway is the AIDOS Runtime MCP-over-HTTP PASSERELLE (S58; ADR 0009).
//
// It is the single project-scoped HTTP front door over EVERY existing AIDOS MCP tool
// (store · mirror-runner · changeset · dag · idea-intake · memory · context · evolve ·
// backtester · telemetry-reader · pact-verifier · mutation-runner · project) — the
// app-builder EPIC 2 passerelle (ROADMAP S58). It serves the SAME MCP server over BOTH
// transports — stdio (the MCP plane) AND JSON-RPC/HTTP (the SDK's StreamableHTTPHandler,
// the HTTP plane) — so "the HTTP honours the MCP" is literal, not approximate (the Pact
// provider-verification done-criterion).
//
// THE WALL IS APPLIED SERVER-SIDE (CLAUDE.md §2). Every routing decision runs the pure
// gateway router (back/runtime/gateway.Route): a below-the-line call is routed; a
// cross-project / forged-identity call is refused with AGENT_CROSS_PROJECT_WRITE (the
// SAME predicate the Postgres RLS enforces, S55); a truth-zone write is refused with
// GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (truth moves ONLY via a ChangeSet, idea → mirror
// → /goal). The gateway NEVER widens what a caller may do — it narrows it.
//
// Tools (one tool = one backend op, ADR 0009):
//
//	gateway_route   — the routing decision for a (scope, tool, target) call (the wall)
//	gateway_tools   — the CLOSED set of exposed tools (server + disposition)
//	gateway_servers — the 13 MCP servers the gateway fronts
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): "pur routage, zéro LLM". The router is a pure
// total function; this server only frames it over the two transports. The actual
// dispatch of a routed below-the-line call to its owning server's handler is the live
// wiring S59 (cutover) builds on; S58 establishes the front door + the server-side wall.
//
// Transport: stdio by default; set AIDOS_GATEWAY_HTTP_ADDR (e.g. :8787) to serve HTTP.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// ── Tool I/O types (JSON-serialisable; the scope is the active (identity, project)) ──

type scopeIn struct {
	Identity      string `json:"identity" jsonschema:"the propagated caller identity (S61); the RLS keys app.identity on it"`
	ActiveProject string `json:"active_project" jsonschema:"the project_id the request is pinned to (S57 cookie)"`
}

type targetIn struct {
	ProjectID       string `json:"project_id" jsonschema:"the project the call's rows belong to; empty = unscoped"`
	ClaimedIdentity string `json:"claimed_identity" jsonschema:"an asserted identity; non-empty mismatching = forged → refused"`
}

type routeInput struct {
	Scope  scopeIn  `json:"scope"`
	Tool   string   `json:"tool" jsonschema:"the MCP tool name to route (e.g. store_get)"`
	Target targetIn `json:"target"`
}

type blockReasonOut struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

type toolOut struct {
	Name        string `json:"name"`
	Server      string `json:"server"`
	Disposition string `json:"disposition"`
}

type routeOutput struct {
	Outcome     string          `json:"outcome"`
	Tool        *toolOut        `json:"tool,omitempty"`
	BlockReason *blockReasonOut `json:"block_reason,omitempty"`
}

type emptyInput struct{}

type toolsOutput struct {
	Tools []toolOut `json:"tools"`
}

type serversOutput struct {
	Servers []string `json:"servers"`
}

type server struct {
	reg *gateway.Registry
}

func toToolOut(t gateway.Tool) toolOut {
	return toolOut{Name: t.Name, Server: t.Server, Disposition: string(t.Disposition)}
}

func toBlockOut(b *gateway.BlockReason) *blockReasonOut {
	if b == nil {
		return nil
	}
	return &blockReasonOut{Code: string(b.Code), Severity: b.Severity, Explanation: b.Explanation, HowToFix: b.HowToFix}
}

func (s *server) route(_ context.Context, _ *mcp.CallToolRequest, in routeInput) (*mcp.CallToolResult, routeOutput, error) {
	d := s.reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: in.Scope.Identity, ActiveProject: in.Scope.ActiveProject},
		Tool:   in.Tool,
		Target: projectwall.Target{ProjectID: in.Target.ProjectID, ClaimedIdentity: in.Target.ClaimedIdentity},
	})
	out := routeOutput{Outcome: string(d.Outcome), BlockReason: toBlockOut(d.BlockReason)}
	if d.Tool != nil {
		to := toToolOut(*d.Tool)
		out.Tool = &to
	}
	return nil, out, nil
}

func (s *server) tools(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, toolsOutput, error) {
	ts := s.reg.Tools()
	out := toolsOutput{Tools: make([]toolOut, 0, len(ts))}
	for _, t := range ts {
		out.Tools = append(out.Tools, toToolOut(t))
	}
	return nil, out, nil
}

func (s *server) servers(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, serversOutput, error) {
	return nil, serversOutput{Servers: gateway.GatewayServers()}, nil
}

func newMCPServer() *mcp.Server {
	s := &server{reg: gateway.DefaultRegistry()}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-gateway", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_route", Description: "The server-side wall routing decision for a (scope, tool, target) call: route a below-the-line op, refuse a cross-project/forged call (AGENT_CROSS_PROJECT_WRITE), or refuse a truth-write (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET). Pure, deterministic — zero LLM."}, s.route)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_tools", Description: "The CLOSED set of MCP tools the gateway exposes (name · owning server · wall disposition), sorted. Pure."}, s.tools)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_servers", Description: "The 13 MCP servers the gateway fronts (store · mirror-runner · changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project)."}, s.servers)
	return srv
}

// httpHandler builds the MCP-over-HTTP handler: the SAME server served over JSON-RPC/
// HTTP via the SDK's StreamableHTTPHandler (the HTTP honours the MCP — provider
// verification). JSONResponse keeps the wire deterministic (no random SSE ids).
func httpHandler() http.Handler {
	srv := newMCPServer()
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return srv }, &mcp.StreamableHTTPOptions{JSONResponse: true})
}

func main() {
	ctx := context.Background()
	if addr := os.Getenv("AIDOS_GATEWAY_HTTP_ADDR"); addr != "" {
		log.Printf("gateway: serving MCP-over-HTTP on %s", addr)
		if err := http.ListenAndServe(addr, httpHandler()); err != nil {
			log.Fatalf("gateway: http: %v", err)
		}
		return
	}
	if err := newMCPServer().Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("gateway: run: %v", err)
	}
}
