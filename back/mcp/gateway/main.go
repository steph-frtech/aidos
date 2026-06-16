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
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	cs "github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/steph-frtech/aidos/back/mcp/changeset/changesetsrv"
	"github.com/steph-frtech/aidos/back/mcp/context/contextsrv"
	"github.com/steph-frtech/aidos/back/mcp/dag/dagsrv"
	ideaintakesrv "github.com/steph-frtech/aidos/back/mcp/idea-intake/ideaintakesrv"
	"github.com/steph-frtech/aidos/back/mcp/memory/memorysrv"
	"github.com/steph-frtech/aidos/back/mcp/project/projectsrv"
	"github.com/steph-frtech/aidos/back/mcp/store/storesrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
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

// ── gateway_call I/O (S59: route THEN dispatch the routed below-the-line op) ──

type callInput struct {
	Scope scopeIn        `json:"scope"`
	Tool  string         `json:"tool" jsonschema:"the MCP tool name to route then dispatch (e.g. changeset_open)"`
	Args  map[string]any `json:"args,omitempty" jsonschema:"the backend tool arguments as an object (the router never interprets them; an object — NOT a byte-array — so the real HTTP transport accepts it, the S59 scar)"`
}

type callOutput struct {
	Outcome     string          `json:"outcome"`
	Result      map[string]any  `json:"result,omitempty"`
	BlockReason *blockReasonOut `json:"block_reason,omitempty"`
}

type server struct {
	reg *gateway.Registry
	// dispatch executes a routed below-the-line call against an in-process backend (S59).
	// nil when no DSN is configured: gateway_call still applies the wall via reg.Route, but
	// a routed below-line call returns route_undispatched (the caller falls back to demo).
	dispatch *gatewaydispatch.Dispatcher
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

// call is the S59 EXECUTE door: it routes a (scope, tool, args) call THEN dispatches the
// routed below-the-line op to its owning backend in-process, returning the backend's
// structured result. THE WALL ALWAYS APPLIES FIRST (CLAUDE.md §2):
//
//   - a truth-write (kernel_write/mirror_write/fitness_write/stack.engrave_manifest) is
//     refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — the backend is NEVER touched, with
//     OR without a Dispatcher configured;
//   - a cross-project / forged call is refused (AGENT_CROSS_PROJECT_WRITE); an unknown tool
//     is refused — same router, same codes as gateway_route.
//
// When no Dispatcher is configured (no DSN), the wall is STILL enforced (reg.Route directly):
// a truth-write is refused, and a routed below-line call returns route_undispatched so the
// front falls back to its demo/twin projection (no regression, ADR 0074). A routed below-line
// call with a Dispatcher reaches the backend and returns its result.
func (s *server) call(ctx context.Context, _ *mcp.CallToolRequest, in callInput) (*mcp.CallToolResult, callOutput, error) {
	scope := projectwall.Scope{Identity: in.Scope.Identity, ActiveProject: in.Scope.ActiveProject}

	// No Dispatcher: enforce the wall directly via the pure router. A non-route outcome is
	// refused (truth-write / scope / unknown); a route becomes route_undispatched (demo).
	if s.dispatch == nil {
		d := s.reg.Route(gateway.Call{Scope: scope, Tool: in.Tool, Target: projectwall.Target{ProjectID: scope.ActiveProject}})
		if d.Outcome != gateway.OutcomeRoute {
			return nil, callOutput{Outcome: string(d.Outcome), BlockReason: toBlockOut(d.BlockReason)}, nil
		}
		return nil, callOutput{Outcome: gatewaydispatch.OutcomeRouteUndispatched}, nil
	}

	// Dispatcher present: it routes (the wall) THEN dispatches. A refusal carries no result.
	result, br, outcome, err := s.dispatch.Call(ctx, scope, in.Tool, in.Args)
	if err != nil {
		return nil, callOutput{}, err
	}
	return nil, callOutput{Outcome: outcome, Result: result, BlockReason: toBlockOut(br)}, nil
}

// newMCPServer builds the gateway MCP server. The dispatcher is OPTIONAL (nil = no DSN): the
// three meta-tools (gateway_route/tools/servers) are unchanged and pure; gateway_call applies
// the wall either way (via the dispatcher's router, or — when nil — reg.Route directly).
func newMCPServer(dispatch *gatewaydispatch.Dispatcher) *mcp.Server {
	s := &server{reg: gateway.DefaultRegistry(), dispatch: dispatch}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-gateway", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_route", Description: "The server-side wall routing decision for a (scope, tool, target) call: route a below-the-line op, refuse a cross-project/forged call (AGENT_CROSS_PROJECT_WRITE), or refuse a truth-write (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET). Pure, deterministic — zero LLM."}, s.route)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_tools", Description: "The CLOSED set of MCP tools the gateway exposes (name · owning server · wall disposition), sorted. Pure."}, s.tools)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_servers", Description: "The 14 MCP servers the gateway fronts (store · mirror-runner · changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project · provision — the DP13 stack/bootstrap/profile tools)."}, s.servers)
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_call", Description: "Route THEN dispatch a (scope, tool, args) call to its owning backend in-process (S59). The wall applies FIRST: a truth-write is refused (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET), a cross-project/forged call is refused (AGENT_CROSS_PROJECT_WRITE), an unknown tool is refused. A routed below-the-line call returns the backend's structured result; without a configured store it returns route_undispatched (the caller falls back to demo)."}, s.call)
	return srv
}

// serverDSN resolves the DSN a dispatched backend opens: AIDOS_GATEWAY_DSN first (the
// gateway's own writer DSN — one DSN configures the whole front door), falling back to the
// server's historic standalone DSN env so a single deployment can configure either. The
// gateway DSN, when set, is shared by every wired backend (they are co-located schemas in the
// one truth-store); the per-server fallback keeps a server reachable when only its own env is
// set (the standalone-deployment path).
func serverDSN(fallbackEnv string) string {
	if dsn := os.Getenv("AIDOS_GATEWAY_DSN"); dsn != "" {
		return dsn
	}
	return os.Getenv(fallbackEnv)
}

// serverBuilders is the REGISTRE of below-the-line backends the dispatcher wires: server name
// → a builder that resolves its DSN (gateway-first, historic fallback) then opens the store
// and returns its in-process *mcp.Server. A server ABSENT from this registry is left to the
// StoreProvider's ErrServerNotDispatched (→ route_undispatched → demo), so wiring one server
// at a time stays a STRICTLY ADDITIVE cutover (the un-wired servers regress not at all). Each
// builder is consulted LAZILY (sessionFor hits the factory only on the first call to that
// server), so a gateway with a DSN but no traffic for a given server never opens its pool.
//
// changeset carries a clock (created_at is a server instant); store/dag/project/idea-intake
// take the DSN alone (their timestamps are client-supplied or content-addressed — no server
// clock). memory takes the DSN PLUS a deterministic embedder injected into its store (never an
// LLM in the dispatch path — determinism-first). context is read-only/SANS DSN: it dispatches
// over the mocked ContextGraph View regardless of any configured store.
var serverBuilders = map[string]func(ctx context.Context) (*mcp.Server, error){
	"changeset": func(ctx context.Context) (*mcp.Server, error) {
		store, err := cs.NewStore(ctx, serverDSN("AIDOS_CHANGESET_DSN"))
		if err != nil {
			return nil, err
		}
		return changesetsrv.NewServer(store, time.Now), nil
	},
	"store": func(ctx context.Context) (*mcp.Server, error) {
		store, err := contentstore.New(ctx, serverDSN("AIDOS_ARCHIVE_DSN"))
		if err != nil {
			return nil, err
		}
		return storesrv.NewServer(store), nil
	},
	"dag": func(ctx context.Context) (*mcp.Server, error) {
		store, err := dag.NewStore(ctx, serverDSN("AIDOS_DAG_DSN"))
		if err != nil {
			return nil, err
		}
		return dagsrv.NewServer(store), nil
	},
	"project": func(ctx context.Context) (*mcp.Server, error) {
		store, err := projectsrv.NewStore(ctx, serverDSN("AIDOS_PROJECTS_DSN"))
		if err != nil {
			return nil, err
		}
		return projectsrv.NewServer(store), nil
	},
	// memory takes TWO things — a pgx pool (over the brain.memory_item schema) AND an
	// Embedder injected INTO the store. The DSN alone does not derive the embedder; the
	// gateway injects the DETERMINISTIC HashEmbedder (seed gatewayMemorySeed) so a dispatched
	// memory_recall is reproducible — NEVER an LLM/model call in the dispatch path
	// (determinism-first, CLAUDE.md §6/§8). The seed mirrors the standalone binary's
	// embedderSeed (back/mcp/memory) so the gateway and the stdio binary recall identically.
	// The store is below the waterline (SELECT+INSERT, append-only) — never above the wall.
	"memory": func(ctx context.Context) (*mcp.Server, error) {
		pool, err := pgxpool.New(ctx, serverDSN("AIDOS_ARCHIVE_DSN"))
		if err != nil {
			return nil, err
		}
		store := memory.NewPgxStore(pool, memory.NewHashEmbedder(gatewayMemorySeed))
		return memorysrv.NewServer(store), nil
	},
	// context is READ-ONLY and SANS persistance: its only dep is the read-only ContextGraph
	// View (today the deterministic ExampleView), there is NO DSN, no embedder, no clock. The
	// builder ignores its ctx/DSN and returns the default server over the mocked view (the
	// compile is a pure function, the pack-cache is session-local values). When the derived
	// `context` schema lands, a DB-backed View is injected via contextsrv.NewServer; this
	// builder swaps to it then — the tools and the wall are unchanged.
	"context": func(context.Context) (*mcp.Server, error) {
		return contextsrv.DefaultServer(), nil
	},
	// idea-intake takes TWO deps — the `ideas`-schema Store (pgxpool) AND the MK02 DocConverter
	// port. The DSN opens the store; the converter is the in-process deterministic HTMLConverter
	// (a value-type, the default reference adapter, ADR 0039) — never an LLM in the dispatch
	// path. It carries the lifecycle grant only (INSERT/SELECT/UPDATE, never DELETE; no
	// promote-to-kernel tool) — the wall holds (promotion is the /goal flow, CLAUDE.md §2).
	"idea-intake": func(ctx context.Context) (*mcp.Server, error) {
		store, err := ideaintakesrv.NewStore(ctx, serverDSN("AIDOS_IDEAS_DSN"))
		if err != nil {
			return nil, err
		}
		return ideaintakesrv.NewServer(store, markitdown.HTMLConverter{}), nil
	},
}

// gatewayMemorySeed is the fixed seed the gateway injects into the dispatched memory store's
// deterministic HashEmbedder (ADR 0025). It mirrors back/mcp/memory's embedderSeed so a
// memory_recall dispatched through the gateway is byte-identical to the standalone binary's
// (determinism-first: the dispatch path never calls a model — CLAUDE.md §6/§8).
const gatewayMemorySeed uint64 = 31

// gatewayDSNConfigured reports whether ANY DSN the dispatcher could use is set — the gateway's
// own AIDOS_GATEWAY_DSN, or a historic per-server fallback. When nothing is configured the
// dispatcher is nil and gateway_call enforces the wall directly (see (*server).call).
func gatewayDSNConfigured() bool {
	if os.Getenv("AIDOS_GATEWAY_DSN") != "" {
		return true
	}
	for _, fallback := range []string{
		"AIDOS_CHANGESET_DSN", "AIDOS_ARCHIVE_DSN", "AIDOS_DAG_DSN", "AIDOS_PROJECTS_DSN",
		// memory shares AIDOS_ARCHIVE_DSN (the brain schema is co-located); idea-intake adds
		// its own. context is read-only/SANS DSN — it contributes no env (it dispatches over
		// the mocked View regardless, so it never depends on a configured store).
		"AIDOS_IDEAS_DSN",
	} {
		if os.Getenv(fallback) != "" {
			return true
		}
	}
	return false
}

// buildDispatcher constructs the S59 Dispatcher when a DSN is configured, else nil (the wall
// still holds for gateway_call — see (*server).call). The StoreProvider consults serverBuilders:
// changeset · store · dag · project · memory · context · idea-intake are wired; every OTHER
// server returns ErrServerNotDispatched, so the front falls back to demo for the un-wired ones
// (strictly additive cutover, no regression). Each backend store is opened LAZILY (on the first
// dispatch to that server), so a gateway with a DSN but no traffic for a server never touches
// its Postgres pool.
func buildDispatcher() *gatewaydispatch.Dispatcher {
	if !gatewayDSNConfigured() {
		return nil
	}
	factory := func(ctx context.Context, srv string) (*mcp.Server, error) {
		build, ok := serverBuilders[srv]
		if !ok {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		return build(ctx)
	}
	return gatewaydispatch.New(gateway.DefaultRegistry(), factory)
}

// httpHandler builds the MCP-over-HTTP handler: the SAME server served over JSON-RPC/
// HTTP via the SDK's StreamableHTTPHandler (the HTTP honours the MCP — provider
// verification). JSONResponse keeps the wire deterministic (no random SSE ids).
//
// Stateless: true — the front SDK (front/web/lib/gateway-sdk.ts) issues ONE-SHOT,
// project-scoped `tools/call` POSTs (no initialize → no Mcp-Session-Id handshake): it
// carries the (identity, project) scope in the call arguments + headers, statelessly,
// because the gateway router IS a pure function of (scope, tool, target) — there is no
// server session state to keep (determinism-first, §8). A session-required handler
// would reject every front call ("invalid during session initialization") and force a
// SILENT twin fallback — exactly the defect ADR 0074 forbids. Stateless accepts the
// one-shot call AND the full handshake (the SDK clients in pact/transport tests), so the
// HTTP still honours the MCP. Idempotent reads only; truth-writes never reach here (the
// wall refuses them server-side before any dispatch).
func httpHandler(dispatch *gatewaydispatch.Dispatcher) http.Handler {
	srv := newMCPServer(dispatch)
	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return srv }, &mcp.StreamableHTTPOptions{JSONResponse: true, Stateless: true})
}

func main() {
	ctx := context.Background()
	dispatch := buildDispatcher() // nil when no DSN — gateway_call still enforces the wall.
	if dispatch != nil {
		defer dispatch.Close()
	}
	if addr := os.Getenv("AIDOS_GATEWAY_HTTP_ADDR"); addr != "" {
		log.Printf("gateway: serving MCP-over-HTTP on %s (dispatch=%t)", addr, dispatch != nil)
		if err := http.ListenAndServe(addr, httpHandler(dispatch)); err != nil {
			log.Fatalf("gateway: http: %v", err)
		}
		return
	}
	if err := newMCPServer(dispatch).Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("gateway: run: %v", err)
	}
}
