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
//	gateway_servers — the 27 MCP servers the gateway fronts
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
	appauthsrv "github.com/steph-frtech/aidos/back/mcp/app-auth/appauthsrv"
	archfitnesssrv "github.com/steph-frtech/aidos/back/mcp/arch-fitness/archfitnesssrv"
	"github.com/steph-frtech/aidos/back/mcp/autonomy/autonomysrv"
	"github.com/steph-frtech/aidos/back/mcp/backtester/backtestersrv"
	"github.com/steph-frtech/aidos/back/mcp/behaviors/behaviorssrv"
	besoinintakesrv "github.com/steph-frtech/aidos/back/mcp/besoin-intake/besoinintakesrv"
	"github.com/steph-frtech/aidos/back/mcp/billing/billingsrv"
	buildconsolesrv "github.com/steph-frtech/aidos/back/mcp/build-console/buildconsolesrv"
	buildloopsrv "github.com/steph-frtech/aidos/back/mcp/build-loop/buildloopsrv"
	"github.com/steph-frtech/aidos/back/mcp/changeset/changesetsrv"
	"github.com/steph-frtech/aidos/back/mcp/conscience/consciencesrv"
	contextmapsrv "github.com/steph-frtech/aidos/back/mcp/context-map/contextmapsrv"
	"github.com/steph-frtech/aidos/back/mcp/context/contextsrv"
	costmetersrv "github.com/steph-frtech/aidos/back/mcp/cost-meter/costmetersrv"
	"github.com/steph-frtech/aidos/back/mcp/dag/dagsrv"
	dsleditorsrv "github.com/steph-frtech/aidos/back/mcp/dsl-editor/dsleditorsrv"
	entitymodelersrv "github.com/steph-frtech/aidos/back/mcp/entity-modeler/entitymodelersrv"
	"github.com/steph-frtech/aidos/back/mcp/evolve/evolvesrv"
	"github.com/steph-frtech/aidos/back/mcp/federation/federationsrv"
	goalpilotingsrv "github.com/steph-frtech/aidos/back/mcp/goal-piloting/goalpilotingsrv"
	grillingloopsrv "github.com/steph-frtech/aidos/back/mcp/grilling-loop/grillingloopsrv"
	ideaintakesrv "github.com/steph-frtech/aidos/back/mcp/idea-intake/ideaintakesrv"
	kernelgardensrv "github.com/steph-frtech/aidos/back/mcp/kernel-garden/kernelgardensrv"
	"github.com/steph-frtech/aidos/back/mcp/learn/learnsrv"
	"github.com/steph-frtech/aidos/back/mcp/memory/memorysrv"
	"github.com/steph-frtech/aidos/back/mcp/mirror-runner/mirrorrunnersrv"
	"github.com/steph-frtech/aidos/back/mcp/mutation-runner/mutationrunnersrv"
	pactverifiersrv "github.com/steph-frtech/aidos/back/mcp/pact-verifier/pactverifiersrv"
	"github.com/steph-frtech/aidos/back/mcp/project/projectsrv"
	"github.com/steph-frtech/aidos/back/mcp/provision/provisionsrv"
	realityingestsrv "github.com/steph-frtech/aidos/back/mcp/reality-ingest/realityingestsrv"
	selfcertsrv "github.com/steph-frtech/aidos/back/mcp/self-cert/selfcertsrv"
	shapeeditorsrv "github.com/steph-frtech/aidos/back/mcp/shape-editor/shapeeditorsrv"
	"github.com/steph-frtech/aidos/back/mcp/store/storesrv"
	"github.com/steph-frtech/aidos/back/mcp/telemetry-reader/telemetryreadersrv"
	"github.com/steph-frtech/aidos/back/mcp/templates/templatessrv"
	whytreesrv "github.com/steph-frtech/aidos/back/mcp/why-tree/whytreesrv"
	workspacesrv "github.com/steph-frtech/aidos/back/mcp/workspace/workspacesrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
	"github.com/steph-frtech/aidos/back/runtime/redwork"
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
	mcp.AddTool(srv, &mcp.Tool{Name: "gateway_servers", Description: "The 38 MCP servers the gateway fronts (the closed gateway.GatewayServers list — store · mirror-runner · changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project · provision · reality-ingest · why-tree · goal-piloting · federation · learn · conscience · arch-fitness · cost-meter · build-console · build-loop · kernel-garden · autonomy · behaviors · billing · dsl-editor · templates · besoin-intake · self-cert · app-auth · workspace · entity-modeler · shape-editor · context-map · grilling-loop)."}, s.servers)
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
		dsn := serverDSN("AIDOS_CHANGESET_DSN")
		store, err := cs.NewStore(ctx, dsn)
		if err != nil {
			return nil, err
		}
		// Trou dormant #2: a DRAFT → APPLIED flip IS a kernel bump, so wire the red-wave fan-out
		// here (the live trigger). The queue writes runtime.red_work_queue below the waterline —
		// same database as the changesets schema, so we reuse the changeset DSN for the agent-role
		// pool. If the pool cannot open we fall back to the un-fanned server (the apply still
		// works; it simply fires no wave) rather than refusing the whole changeset capability.
		pool, perr := pgxpool.New(ctx, dsn)
		if perr != nil {
			log.Printf("gateway: red-wave fan-out disabled (red_work_queue pool: %v) — apply still applies", perr)
			return changesetsrv.NewServer(store, time.Now), nil
		}
		return changesetsrv.NewServerWithRedWave(store, time.Now, &redwork.PgRedWorkQueue{Pool: pool}), nil
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
	// telemetry-reader takes THREE persistence seams — the incidents.* store (observe/list/
	// learn, BELOW the wall), the telemetry.* SELECT-only landing (read-only on reality), and
	// the S27 ideas.* capture door (the only outward edge, a DRAFT idea — never the kernel).
	// All three are co-located schemas in the one truth-store, so the gateway DSN configures
	// the whole reader; serverDSN falls back to each historic per-schema env (incidents/
	// telemetry keep their own; ideas reuses AIDOS_IDEAS_DSN, the SAME env idea-intake reads,
	// so the two servers capture into one ideas schema). There is NO clock and NO embedder —
	// every decision defers to the pure reality.* engine, no LLM in the dispatch path
	// (determinism-first, CLAUDE.md §6/§8). incident_learn writes a DRAFT idea via S27,
	// never the kernel — the wall holds (promotion is the /goal flow).
	"telemetry-reader": func(ctx context.Context) (*mcp.Server, error) {
		inc, err := telemetryreadersrv.NewIncidentStore(ctx, serverDSN("AIDOS_INCIDENTS_DSN"))
		if err != nil {
			return nil, err
		}
		tel, err := telemetryreadersrv.NewTelemetryStore(ctx, serverDSN("AIDOS_TELEMETRY_DSN"))
		if err != nil {
			return nil, err
		}
		ideaStore, err := telemetryreadersrv.NewIdeaCaptureStore(ctx, serverDSN("AIDOS_IDEAS_DSN"))
		if err != nil {
			return nil, err
		}
		return telemetryreadersrv.NewServer(inc, tel, ideaStore), nil
	},
	// evolve is SANS DSN and SANS LLM: its only state is an in-memory run store and its only
	// "search" is the pure deterministic sampler (evolvesrv.NewServer). The self-play generator
	// (EG03, the gated LLM exception §6) is NEVER armed here — the dispatch path stays
	// deterministic (CLAUDE.md §6/§8). evolve writes ONLY branches/reports/ideas via Confine,
	// never the kernel/mirrors/authority/fitness (the wall, §2). The builder ignores its ctx and
	// returns the default server — like `context`, it dispatches identically whatever DSN is set.
	"evolve": func(context.Context) (*mcp.Server, error) {
		return evolvesrv.NewServer(), nil
	},
	// reality-ingest is READ-ONLY on the kernel and SANS persistance — the S106 runtime is a set
	// of PURE functions (detect_divergence/ingest_divergence/render_idea_text), no store, no DSN,
	// no clock, no embedder. Like `context`, the builder ignores its ctx and returns the default
	// server. Every tool returns a VALUE whose WroteKernel is false; the only edge is a DRAFT idea
	// (provenance=incident) and the direct Reality→Kernel edge is always refused — the wall holds
	// with no GRANT at all (the prod→kernel on-ramp goes idea → mirror → /goal, §2).
	"reality-ingest": func(context.Context) (*mcp.Server, error) {
		return realityingestsrv.NewServer(), nil
	},
	// provision is DEP-FREE: every tool (the 5 stack.* DP13 + plan/images S89) projects PURELY
	// over the StackManifest AST + the observed host state carried IN the request — no DSN, no
	// store, no clock, no embedder. Below-the-line projections only; the fenced
	// stack.engrave_manifest is a DispositionTruthWrite, refused by the router BEFORE any dispatch
	// (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET) — the wall holds (§2). The builder ignores its ctx and
	// returns the default server, like `context`.
	"provision": func(context.Context) (*mcp.Server, error) {
		return provisionsrv.NewServer(), nil
	},
	// ── cert-runners: only the CHEAP-READ tools are dispatched synchronously (S59). ──
	// A gateway_call is a SYNCHRONOUS one-shot HTTP POST: a tool that LAUNCHES a long
	// process (a real godog/gremlins/pact subprocess, a walk-forward replay) must NOT be a
	// blocking dispatch — it is async/CI-by-design. Each cert-runner below stays wired so its
	// CHEAP read is reachable; its HEAVY tool stays EXPOSED by the server (the standalone
	// binary + CI use it) but the front simply does not dispatch it synchronously.
	//
	// mirror-runner is DSN-backed (AIDOS_ARCHIVE_DSN): a read-only `mirrors`-schema source +
	// the append-only runtime.mirror_runs run-log. At S05 the Replayer is the pure
	// BaselineReplayer (last-recorded-status comparison reader — NO test subprocess), so BOTH
	// ratchet_check and mirror_replay are cheap reads today; S06+ tightening the replay seam to
	// a real per-test_kind runner would make replaying heavy (the runner stays exposed; the
	// front would stop dispatching it synchronously). The builder reuses the SAME wiring as the
	// standalone binary (mirrorrunnersrv.NewRatchet) — no twin.
	"mirror-runner": func(ctx context.Context) (*mcp.Server, error) {
		r, err := mirrorrunnersrv.NewRatchet(ctx, serverDSN("AIDOS_ARCHIVE_DSN"))
		if err != nil {
			return nil, err
		}
		return mirrorrunnersrv.NewServer(r), nil
	},
	// pact-verifier is DEP-FREE (like context/evolve/provision): pact_verify stands the emitted
	// handler up IN-PROCESS (net/http/httptest, ADR 0026) and asserts the field set — a CHEAP
	// pure verification, no Postgres, no subprocess, no Ruby daemon. The builder ignores its ctx
	// and returns the default server; it dispatches identically whatever DSN is set.
	"pact-verifier": func(context.Context) (*mcp.Server, error) {
		return pactverifiersrv.NewServer(), nil
	},
	// backtester is DEP-FREE: backtest_get is a CHEAP READ over the in-memory evaluation store
	// (no market feed, no subprocess). backtest_out_of_sample stays exposed (the gate + the
	// standalone binary use it) but is the EVALUATE op behind the data-feed seam — the front
	// dispatches only the deterministic read (backtest_get). The builder ignores its ctx and
	// returns the default server, like context/evolve/provision.
	"backtester": func(context.Context) (*mcp.Server, error) {
		return backtestersrv.NewServer(), nil
	},
	// ── S59-batch DEP-FREE read servers (ADR 0092: the Go engine is the SINGLE live source). ──
	// Each of the six below is DEP-FREE like context/evolve/provision/pact-verifier/backtester:
	// no DSN, no store, no clock, no embedder, NO LLM in the dispatch path (determinism-first,
	// §6/§8). Every dispatched tool is a CHEAP/pure read (a graph-walk, a compute, a hash) whose
	// output is a VALUE with WroteKernel=false — the wall holds (§2): no kernel/mirrors/fitness
	// write reaches a backend (the router refuses a truth-write before any dispatch). The builder
	// ignores its ctx and returns the default server; it dispatches identically whatever DSN is set.
	//
	// why-tree (FK13 /why) — build/serialize/kinds: a content-addressed WhyTree from a red symptom,
	// its kernel.link body, the link-kind discriminator. Freezing the terminal mirror stays /goal.
	"why-tree": func(context.Context) (*mcp.Server, error) {
		return whytreesrv.NewServer(), nil
	},
	// goal-piloting (S66) — goal_pilot_open/close/live_red_set: pure computation that PROPOSES a
	// DRAFT ChangeSet (by id/status reference, never the RawMessage envelope body) + the LIVE red
	// set; the NON-GAMEABLE close gate. Persistence rides the changeset door under approval — there
	// is no apply/close-stamp tool (closing stays the aidos role).
	"goal-piloting": func(context.Context) (*mcp.Server, error) {
		return goalpilotingsrv.NewServer(), nil
	},
	// federation (S103/§51) — saga_over_cells/fan_out/temporal_over_cells: PURE cross-cell
	// compositions returning the per-cell RedWorkQueue waves as VALUES. fan_out NEVER enqueues —
	// the actual INSERT into runtime.red_work_queue is the S22 PostKernelChange hook's job below the
	// waterline (the tool computes the waves; the hook writes them). Writes nothing here.
	"federation": func(context.Context) (*mcp.Server, error) {
		return federationsrv.NewServer(), nil
	},
	// learn (S107/E12) — bump_hash/targeted_wave/close_loop: READ-ONLY on the kernel; every tool's
	// WroteKernel is false and the direct Reality→Kernel edge is always refused. The dispatch-safe
	// Target carries spec_body as an OBJECT (learnsrv wraps learn.Target.SpecBody, a json.RawMessage,
	// behind a map[string]any so the HTTP input schema is an object, not a byte-array — the S59 scar).
	"learn": func(context.Context) (*mcp.Server, error) {
		return learnsrv.NewServer(), nil
	},
	// conscience (FK09) — reconcile/decision_cards: PURE aggregation of the EXISTING judges'
	// verdicts (AUCUN NOUVEAU JUGE) into a ConsciousnessReport / the §FKE-31 decision cards. A
	// divergence card is a SIGNAL routed to idea → mirror → /goal — never a write (the wall).
	"conscience": func(context.Context) (*mcp.Server, error) {
		return consciencesrv.NewServer(), nil
	},
	// arch-fitness (S102) — measure/ratchet/gate are dispatched (PURE graph algorithms returning a
	// metric/verdict VALUE). `propose` is NOT dispatched (it stays exposed by the server for the
	// stdio binary + CI): it returns a DRAFT ChangeSet whose Delta.Body is a json.RawMessage (the
	// byte-array output scar) AND it is the baseline-MOVE proposal the front never fires
	// synchronously — the move goes through the changeset commit gate under approval (like
	// run_mutation: a proposal/heavy tool is governed/async by design, never a blocking one-shot).
	"arch-fitness": func(context.Context) (*mcp.Server, error) {
		return archfitnesssrv.NewServer(), nil
	},
	// mutation-runner — read_threshold is the CHEAP dispatched read (SELECT-only on fitness,
	// the declared mutation-score bar the /mutation-score panel shows live). run_mutation stays
	// exposed (the standalone binary + CI use it) but is HEAVY (gremlins/Stryker subprocess,
	// minutes) — async/CI by design, never dispatched synchronously from a screen. Built over
	// AIDOS_RUNTIME_DSN (falls back to AIDOS_GATEWAY_DSN); the pgx threshold read is the wall's
	// SELECT-only fitness grade, never an authored bar.
	"mutation-runner": func(ctx context.Context) (*mcp.Server, error) {
		return mutationrunnersrv.NewFromDSN(ctx, serverDSN("AIDOS_RUNTIME_DSN"))
	},
	// ── ADR 0092 batch-2 DEP-FREE read servers (the Go engine is the SINGLE live source). ──
	// Each of the six below is DEP-FREE like context/evolve/provision/pact-verifier/backtester:
	// no DSN, no store, no clock, no embedder, NO LLM in the dispatch path (determinism-first,
	// §6/§8). Every dispatched tool is a CHEAP/pure read (a meter over declared budgets, a loop
	// verdict, a §43 cut check, a debt scan, an A0..A8 enforcement, a library browse) whose
	// output is a VALUE — WroteKernel is always false; no kernel/mirrors/fitness write reaches a
	// backend (the router refuses a truth-write before any dispatch). Every I/O is a scalar
	// OBJECT (no json.RawMessage body — the S59 byte-array transport scar is avoided by
	// construction; behaviors.attach echoes behavior.Policy/Fixture as plain object structs).
	// The builder ignores its ctx and returns the default server; it dispatches identically
	// whatever DSN is set.
	//
	// cost-meter (S111) — cost_meter_cell/cost_disjoncteur_signal/cost_validate_budget: meter a
	// cell from its REAL recorded AgentRuns against its DECLARED HarnessCostBudget (a COUNT, never
	// an estimate); raising a cap stays /goal.
	"cost-meter": func(context.Context) (*mcp.Server, error) {
		return costmetersrv.NewServer(), nil
	},
	// build-console (S86) — buildconsole_project/buildconsole_record_stable_phase: the FAITHFUL
	// projection of the app-builder console + the §43 coherent-cut verdict. record_stable_phase
	// returns the per-project DAG node to record (a VALUE); the privileged aidos writer commits it.
	"build-console": func(context.Context) (*mcp.Server, error) {
		return buildconsolesrv.NewServer(), nil
	},
	// build-loop (S83) — buildloop_terminate/buildloop_no_progress/buildloop_verdicts: the
	// non-gameable termination Decision + the deterministic no-progress circuit-breaker (a
	// FUNCTION OF THE HISTORY, never an LLM judgment).
	"build-loop": func(context.Context) (*mcp.Server, error) {
		return buildloopsrv.NewServer(), nil
	},
	// kernel-garden (S112/§82.4) — garden_tend_project/garden_suggest_trim/garden_accept_proposal:
	// the per-project KernelDebt scan + /trim (suggest-only — deletes_anything is ALWAYS false;
	// accepting a proposal OPENS an idea → mirror → /goal → human approval, never a removal).
	"kernel-garden": func(context.Context) (*mcp.Server, error) {
		return kernelgardensrv.NewServer(), nil
	},
	// autonomy (FK10) — enforce/promote: the closed A0..A8 ladder, FAIL-CLOSED enforcement and
	// PURE promotion-from-history (the level is COMPUTED from the record, never declared §8);
	// freezing a promotion stays idea → mirror → /goal.
	"autonomy": func(context.Context) (*mcp.Server, error) {
		return autonomysrv.NewServer(), nil
	},
	// behaviors (S79) — browse/search/tag/publish/soft_delete/comment/attach: the project-scoped
	// behavior LIBRARY. attach PREVIEWS (DRAFT) or LANDS via an APPROVED ChangeSet (the wall:
	// propose → approve); WroteKernel is always false (the kernel freeze is the aidos CLI's job).
	"behaviors": func(context.Context) (*mcp.Server, error) {
		return behaviorssrv.NewServer(), nil
	},
	// ── ADR 0092 batch-3 DEP-FREE servers (the Go engine is the SINGLE live source). ──
	// Each of the three below is DEP-FREE like context/evolve/provision/pact-verifier/backtester:
	// no DSN, no store, no clock, no embedder, NO LLM in the dispatch path (determinism-first,
	// §6/§8). Every dispatched tool is a CHEAP/pure read whose output is a VALUE with WroteKernel=false
	// — the wall holds (§2): no kernel/mirrors/fitness write reaches a backend. The builder ignores
	// its ctx and returns the default server; it dispatches identically whatever DSN is set.
	//
	// billing (S114) — plans/meter/meter_project/check_quota: the closed plan ladder + the COUNTED
	// usage fold over the REAL AgentRun ledger + the quota verdict (a COUNT, never an estimate, never
	// an LLM); ingest_webhook is the idempotent S73 inbound async op + pact_verify the read-only Pact
	// check. All BELOW THE LINE (runtime/commercial rows) — a plan/limit is DECLARED data (§8); raising
	// a quota stays /goal. Every I/O is a scalar object (billing.Quota/Usage/IngestEvent), no RawMessage.
	"billing": func(context.Context) (*mcp.Server, error) {
		return billingsrv.NewServer(), nil
	},
	// dsl-editor (S77) — dsl_kinds/dsl_parse/dsl_propose: the typed editors over the four behaviour
	// DSLs. dsl_propose returns a DRAFT ChangeSet VALUE (never applies — there is NO apply tool; freezing
	// the edited source stays /goal). The S59 RawMessage scar is guarded in dsleditorsrv (DslDoc.Body /
	// Parsed.Canonical wrapped as OBJECT map[string]any schemas), so dsl_parse/dsl_propose dispatch over
	// HTTP. WroteKernel always false — the wall holds (§2).
	"dsl-editor": func(context.Context) (*mcp.Server, error) {
		return dsleditorsrv.NewServer(), nil
	},
	// templates (S81) — templates_list/get/instantiate/fork: the curated starter catalogue. instantiate
	// + fork are DRY-RUN VALUE computations (WroteKernel always false); the true fork/instantiate of the
	// bundle's kernel truths rides templates.Propose through the changeset door (propose → ChangeSet →
	// approval), NOT these read tools. Every I/O is a scalar object (Bundle/StarterProject), no RawMessage.
	"templates": func(context.Context) (*mcp.Server, error) {
		return templatessrv.NewServer(), nil
	},
	// ── ADR 0092 batch-4A RLS-scoped + stateless servers (the Go engine is the SINGLE live source). ──
	// besoin-intake (EL15) is the ONLY DSN-backed one in this batch — a DUAL store, RLS-scoped. It opens
	// TWO seams over one DSN: the `besoin` need-graph Store (SCOPED to `project` via the SET LOCAL
	// `aidos.project` GUC, S55 — project A's rows are invisible to a B-scoped session) AND the `ideas`
	// reuse IdeaStore (the legal EL05 emission door). Like telemetry-reader, the two are co-located schemas
	// in the one truth-store: serverDSN resolves AIDOS_BESOIN_DSN for the besoin store and AIDOS_IDEAS_DSN
	// for the ideas reuse door (the SAME env idea-intake reads, so emitted Ideas land in one ideas schema).
	// NO clock, NO embedder, NO LLM in the dispatch path (determinism-first §6/§8): every routing/verdict is
	// the pure besoin.* engine. The capture/emit tools append a DRAFT idea (WroteKernel ALWAYS false; a
	// kernel write is refused by GRANT — the wall, §2). Promotion stays the /goal flow (S64).
	"besoin-intake": func(ctx context.Context) (*mcp.Server, error) {
		store, err := besoinintakesrv.NewStore(ctx, serverDSN("AIDOS_BESOIN_DSN"))
		if err != nil {
			return nil, err
		}
		ideaStore, err := besoinintakesrv.NewIdeaStore(ctx, serverDSN("AIDOS_IDEAS_DSN"))
		if err != nil {
			return nil, err
		}
		return besoinintakesrv.NewServer(store, ideaStore), nil
	},
	// self-cert (S84) is DEP-FREE (like context/evolve/provision): the three tools (certify/gate/kinds) are
	// PURE folds of a per-sensor verdict set — no DSN, no store, no clock, no embedder, no LLM. The judge is
	// the deterministic mirror (anti-passthrough: a missing sensor is RED); WroteKernel is always false. The
	// builder ignores its ctx and returns the default server; it dispatches identically whatever DSN is set.
	"self-cert": func(context.Context) (*mcp.Server, error) {
		return selfcertsrv.NewServer(), nil
	},
	// app-auth (S80) is DEP-FREE + STATELESS: expand/check_access/attach are PURE functions over the emitted
	// app's auth subsystem. check_access is a pure role→operation lookup (NEVER an LLM); attach PREVIEWS or
	// LANDS via an APPROVED ChangeSet (changeset.Apply, a value computation — WroteKernel ALWAYS false, the
	// kernel freeze is the aidos CLI's job, like behaviors_attach). The builder ignores its ctx (no DSN).
	"app-auth": func(context.Context) (*mcp.Server, error) {
		return appauthsrv.NewServer(), nil
	},
	// workspace (S82) is DEP-FREE + STATELESS: provision/can_access/check_resources/build_hello are PURE
	// functions of their input. provisioning is a DRY-RUN descriptor (WroteKernel ALWAYS false); can_access
	// is the cross-project isolation verdict (a path under another project or the truth-store is refused with
	// SANDBOX_ESCAPE — the truth-store is OUTSIDE every workspace root, the wall §2). The builder ignores its
	// ctx (no DSN); it dispatches identically whatever DSN is set.
	"workspace": func(context.Context) (*mcp.Server, error) {
		return workspacesrv.NewServer(), nil
	},
	// ── ADR 0092 batch-4B PURE (NON-DSN, NON-RLS) servers (the Go engine is the SINGLE live source). ──
	// Each of the four below is DEP-FREE + STATELESS like context/self-cert/workspace: no DSN, no store,
	// no clock, no embedder, NO LLM in the dispatch path (determinism-first §6/§8). The builder ignores
	// its ctx and returns the default server; it dispatches identically whatever DSN is set. Only the
	// CHEAP/pure READ tools are registered (the registry's below() set) — the `*_propose` tools stay
	// EXPOSED by each server (the stdio binary + CI use them) but are NOT in the registry, so a propose
	// call routes to unknown_tool and the panel uses its own propose→ChangeSet door (the arch-fitness
	// `propose` precedent). Every dispatched I/O is a scalar OBJECT (no json.RawMessage body — the S59
	// byte-array transport scar avoided by construction). All dispatched tools are below the line —
	// WroteKernel always false (the wall, §2).
	//
	// entity-modeler (S75) — schema_validate/schema_hash/canvas_merge/canvas_presence: the canvas-side
	// modeler reads (CRDT three-way merge surfaces conflicts as VALUES, never last-write-wins).
	"entity-modeler": func(context.Context) (*mcp.Server, error) {
		return entitymodelersrv.NewServer(), nil
	},
	// shape-editor (S68) — shape_derive/shape_parse/shape_merge: the mirror-shaper reads (the parser is
	// pure, never an LLM; the merge LOCKS a same-field clash, never last-write-wins).
	"shape-editor": func(context.Context) (*mcp.Server, error) {
		return shapeeditorsrv.NewServer(), nil
	},
	// context-map (S101/§46) — verify_pair/verify_all/check_call: the federation pact-verifier reads (the
	// verifier is an algorithm — a cross-cell call over an unhonored/absent pair is refused CROSS_CELL_NO_CONTRACT).
	"context-map": func(context.Context) (*mcp.Server, error) {
		return contextmapsrv.NewServer(), nil
	},
	// grilling-loop (S65, EL06) — grill_route/grill_verify_verdict/grill_verdicts: the in-product /grill
	// reads. ALL THREE dispatch (no RawMessage): grill_route returns a VerdictRecord idea VALUE (a DRAFT;
	// persistence rides the idea_capture door, WroteKernel always false), grill_verify_verdict is the
	// barricaded re-verify gate over the closed verdict schema, grill_verdicts a closed-table read.
	"grilling-loop": func(context.Context) (*mcp.Server, error) {
		return grillingloopsrv.NewServer(), nil
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
		// telemetry-reader's own schemas (incidents observe/learn + the telemetry SELECT-only
		// landing); it shares AIDOS_IDEAS_DSN for the S27 capture door (counted above).
		"AIDOS_INCIDENTS_DSN", "AIDOS_TELEMETRY_DSN",
		// besoin-intake's own `besoin` need-graph schema (RLS-scoped, batch-4A); it shares
		// AIDOS_IDEAS_DSN for the EL05 idea-capture reuse door (counted above). self-cert ·
		// app-auth · workspace are DEP-FREE (like context): no DSN, no store — they contribute
		// NO env here (they are reachable the moment any DSN arms the dispatcher).
		"AIDOS_BESOIN_DSN",
		// evolve · reality-ingest · provision are DEP-FREE (like context): no DSN, no store —
		// they dispatch over in-memory/pure state regardless of any configured store, so they
		// contribute NO env here (a gateway with one of THEM as its only wired server still has
		// no DSN to open; they are reachable the moment any DSN arms the dispatcher).
	} {
		if os.Getenv(fallback) != "" {
			return true
		}
	}
	return false
}

// buildDispatcher constructs the S59 Dispatcher when a DSN is configured, else nil (the wall
// still holds for gateway_call — see (*server).call). The StoreProvider consults serverBuilders:
// changeset · store · dag · project · memory · context · idea-intake · telemetry-reader · evolve ·
// reality-ingest · provision · mirror-runner · pact-verifier · backtester · why-tree ·
// goal-piloting · federation · learn · conscience · arch-fitness are wired (the last six are the
// ADR 0092 dep-free read batch — their CHEAP/pure read tools dispatch in-process so the Go engine
// is the single live source and the TS twin dies); every OTHER server returns ErrServerNotDispatched,
// so the front falls back to demo for the un-wired ones (strictly additive cutover, no regression).
//
// mutation-runner is DELIBERATELY left UN-WIRED (route_undispatched → demo). Its dominant tool
// run_mutation shells out to gremlins/Stryker — a LONG subprocess that must NOT block a
// synchronous one-shot gateway_call (async/CI-by-design, KRD §19 the pipeline drawer). Its one
// cheap read (read_threshold, a SELECT on the fitness bar) needs AIDOS_RUNTIME_DSN and is
// exercised through the standalone binary / CI, not the synchronous front door — so wiring it
// would only expose the heavy subprocess for no synchronous-read gain. It stays exposed by its
// own server; the front does not dispatch it (the audit's `document-async-only`).
//
// Each backend store is opened LAZILY (on the first dispatch to that server), so a gateway with
// a DSN but no traffic for a server never touches its Postgres pool.
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
