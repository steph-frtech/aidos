// Package contextsrv is the AIDOS Runtime ContextRouter MCP server, exposed as a LIBRARY
// (S59 dispatcher reuse). It is the single capability door (ADR 0009: every backend op is an
// MCP tool) over the ContextRouter — compile the MINIMAL, branch-aware ContextPack a red goal
// needs (KRD §143/§144), replay a prior pack by its content hash (packs are versioned, §144),
// and read-only query the derived ContextGraph view. The Workbench and other agents call these
// tools; they never re-implement the router.
//
// Tools (one tool = one backend op):
//
//	context_compile      — run the ContextRouter over a goal+branch → a ContextPack{+hash}
//	context_pack_get     — replay a prior pack by its content hash (versioned packs)
//	context_graph_query  — read-only query the ContextGraph view (by_goal | by_bc | by_branch | by_term)
//
// THE WALL (CLAUDE.md §2): this server holds a READ-ONLY grant on the derived `context` schema
// and NO grant on kernel/mirrors/fitness. The router only READS the graph and RENDERS /kernel/**
// /mirror/** as forbidden paths in every pack — it writes no truth. The compile algorithm is a
// PURE total function (back/runtime/context.Compile); the MCP only feeds it the read-only view.
//
// DETERMINISM-FIRST (CLAUDE.md §6): the compile (router), the content-addressing (pack hash)
// and the graph indexing are pure functions; this server only feeds them the read-only view
// and caches the resulting pack VALUE for replay. No LLM enters — the code routes.
//
// READ/MOCKED VIEW (§6): the derived `context` schema (the ContextGraph derivation) is a
// separate persistence step; this server compiles over the deterministic ExampleGraph view
// (the mocked read-only view) so the capability is demonstrable end-to-end with no database.
// When the derived schema lands, the View is swapped to read it; the tools and the wall hold.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process: it builds the context *mcp.Server via NewServer and dispatches a routed
// read-only context_* call to it over an in-memory transport. Extracting the handlers here
// (rather than the old package-main) lets BOTH the standalone stdio binary (back/mcp/context)
// and the dispatcher construct identical behaviour — no duplicated logic, no twin (reuse, don't
// reinvent — CLAUDE.md §0).
package contextsrv

import (
	"context"
	"fmt"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
)

// ── Tool I/O types (JSON-serialisable) ──

type compileInput struct {
	Goal   string `json:"goal" jsonschema:"the red goal id to compile a ContextPack for"`
	Branch string `json:"branch" jsonschema:"the version branch to compile against (branch-aware)"`
}
type compileOutput struct {
	Pack rctx.ContextPack `json:"pack" jsonschema:"the compiled minimal, branch-aware ContextPack (content-addressed)"`
}

type packGetInput struct {
	Hash string `json:"hash" jsonschema:"the content hash of a previously compiled pack to replay"`
}
type packGetOutput struct {
	Pack  rctx.ContextPack `json:"pack"`
	Found bool             `json:"found" jsonschema:"whether a pack with that hash was compiled in this session"`
}

type graphQueryInput struct {
	By    string `json:"by" jsonschema:"the index to query: by_goal | by_bc | by_branch | by_term"`
	Value string `json:"value" jsonschema:"the query value (a goal id, a bounded context, a branch, or a term)"`
}
type graphQueryOutput struct {
	Layers    []rctx.Layer        `json:"layers"`
	Mirrors   []rctx.Mirror       `json:"mirrors"`
	Contracts []rctx.Contract     `json:"contracts"`
	Memory    []rctx.MemoryRecord `json:"memory"`
}

// View is the read-only ContextGraph provider (the derived `context` schema, mocked by
// ExampleView here). It is the server's ONLY dependency: there is no DSN, no embedder and no
// clock — the compile is a pure function over a read-only snapshot. When the derived `context`
// schema lands, a DB-backed View is injected via NewServer; the tools and the wall hold.
type View interface {
	Goal(id string) (rctx.Goal, bool)
	Graph() rctx.ContextGraph
}

// ExampleView serves the deterministic S33 example snapshot (the mocked read-only view, §6).
// It is the default wiring (DefaultServer) until the derived `context` schema is persisted.
type ExampleView struct{}

func (ExampleView) Graph() rctx.ContextGraph { return rctx.ExampleGraph() }
func (ExampleView) Goal(id string) (rctx.Goal, bool) {
	g := rctx.ExampleGoal()
	if id == "" || id == g.ID {
		return g, true
	}
	return rctx.Goal{}, false
}

// server wires the MCP tool handlers to the read-only ContextGraph view and a session-local
// content-addressed cache of compiled packs (for replay). The cache holds VALUES only; it is
// never persisted above the wall. It is unexported: callers construct the configured
// *mcp.Server via NewServer / DefaultServer and never touch the handlers directly.
type server struct {
	view  View
	mu    sync.Mutex
	packs map[string]rctx.ContextPack
}

func (s *server) compile(_ context.Context, _ *mcp.CallToolRequest, in compileInput) (*mcp.CallToolResult, compileOutput, error) {
	goal, ok := s.view.Goal(in.Goal)
	if !ok {
		return nil, compileOutput{}, fmt.Errorf("context: unknown goal %q (no red-set view)", in.Goal)
	}
	branch := in.Branch
	if branch == "" {
		branch = "main"
	}
	pack := rctx.Compile(goal, branch, s.view.Graph())
	s.mu.Lock()
	s.packs[pack.Hash] = pack
	s.mu.Unlock()
	return nil, compileOutput{Pack: pack}, nil
}

func (s *server) packGet(_ context.Context, _ *mcp.CallToolRequest, in packGetInput) (*mcp.CallToolResult, packGetOutput, error) {
	s.mu.Lock()
	p, ok := s.packs[in.Hash]
	s.mu.Unlock()
	return nil, packGetOutput{Pack: p, Found: ok}, nil
}

func (s *server) graphQuery(_ context.Context, _ *mcp.CallToolRequest, in graphQueryInput) (*mcp.CallToolResult, graphQueryOutput, error) {
	g := s.view.Graph()
	out := graphQueryOutput{}
	switch in.By {
	case "by_bc":
		for _, l := range g.Layers {
			if l.BoundedContext == in.Value {
				out.Layers = append(out.Layers, l)
			}
		}
		for _, m := range g.Mirrors {
			if m.BoundedContext == in.Value {
				out.Mirrors = append(out.Mirrors, m)
			}
		}
		for _, c := range g.Contracts {
			if c.BoundedContext == in.Value {
				out.Contracts = append(out.Contracts, c)
			}
		}
		for _, r := range g.Memory {
			if r.Scope == in.Value {
				out.Memory = append(out.Memory, r)
			}
		}
	case "by_branch":
		for _, l := range g.Layers {
			if l.Branch == in.Value || l.Branch == "" {
				out.Layers = append(out.Layers, l)
			}
		}
	case "by_term":
		for _, r := range g.Memory {
			if r.ID == in.Value {
				out.Memory = append(out.Memory, r)
			}
		}
	default: // by_goal (the affected subgraph) — return the whole snapshot the goal compiles over.
		out.Layers = g.Layers
		out.Mirrors = g.Mirrors
		out.Contracts = g.Contracts
		out.Memory = g.Memory
	}
	return nil, out, nil
}

// NewServer builds the configured ContextRouter *mcp.Server over a single read-only View. It
// registers the three read-only capability-door tools (compile/pack_get/graph_query) — identical
// behaviour whether driven by the standalone stdio binary or the S59 gateway dispatcher over an
// in-memory transport. The pack-replay cache is fresh per server (session-local values).
func NewServer(v View) *mcp.Server {
	s := &server{view: v, packs: map[string]rctx.ContextPack{}}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-context", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_compile", Description: "Run the ContextRouter over a goal+branch → a minimal, branch-aware ContextPack (content-addressed)."}, s.compile)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_pack_get", Description: "Replay a previously compiled ContextPack by its content hash (versioned packs)."}, s.packGet)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_graph_query", Description: "Read-only query the ContextGraph view (by_goal | by_bc | by_branch | by_term)."}, s.graphQuery)
	return srv
}

// DefaultServer builds the context server over the deterministic ExampleView — the default
// wiring (no DSN, no embedder, no clock) until the derived `context` schema is persisted. The
// gateway builder and the standalone binary both call this until a DB-backed View exists.
func DefaultServer() *mcp.Server { return NewServer(ExampleView{}) }
