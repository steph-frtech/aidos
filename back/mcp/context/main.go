// Command context is the AIDOS Runtime ContextRouter MCP server (S33).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// ContextRouter — compile the MINIMAL, branch-aware ContextPack a red goal needs (KRD §143/§144),
// replay a prior pack by its content hash (packs are versioned, §144), and read-only query the
// derived ContextGraph view. The Workbench and other agents call these tools; they never
// re-implement the router.
//
// Tools (one per backend op):
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
// READ/MOCKED VIEW (§6): the derived `context` schema (the ContextGraph derivation) is a
// separate persistence step; this server compiles over the deterministic ExampleGraph view
// (the mocked read-only view) so the capability is demonstrable end-to-end with no database.
// When the derived schema lands, newView is swapped to read it; the tools and the wall hold.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"
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

// server wires the MCP tool handlers to the read-only ContextGraph view and a session-local
// content-addressed cache of compiled packs (for replay). The cache holds VALUES only; it is
// never persisted above the wall.
type server struct {
	view  view
	mu    sync.Mutex
	packs map[string]rctx.ContextPack
}

// view is the read-only ContextGraph provider (the derived `context` schema, mocked here).
type view interface {
	Goal(id string) (rctx.Goal, bool)
	Graph() rctx.ContextGraph
}

// exampleView serves the deterministic S33 example snapshot (the mocked read-only view, §6).
type exampleView struct{}

func (exampleView) Graph() rctx.ContextGraph { return rctx.ExampleGraph() }
func (exampleView) Goal(id string) (rctx.Goal, bool) {
	g := rctx.ExampleGoal()
	if id == "" || id == g.ID {
		return g, true
	}
	return rctx.Goal{}, false
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

// newMCPServer builds the MCP server and registers the three read-only context tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-context", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_compile", Description: "Run the ContextRouter over a goal+branch → a minimal, branch-aware ContextPack (content-addressed)."}, s.compile)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_pack_get", Description: "Replay a previously compiled ContextPack by its content hash (versioned packs)."}, s.packGet)
	mcp.AddTool(srv, &mcp.Tool{Name: "context_graph_query", Description: "Read-only query the ContextGraph view (by_goal | by_bc | by_branch | by_term)."}, s.graphQuery)
	return srv
}

func newServer() *server {
	return &server{view: exampleView{}, packs: map[string]rctx.ContextPack{}}
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("context: run: %v", err)
	}
}
