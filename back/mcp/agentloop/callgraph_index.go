package main

// callgraph_index.go — FN05: the MCP tool over the emitted CALL-GRAPH INDEX (ADR 0036; ADR 0009:
// every backend op is an MCP tool). It exposes the deterministic Understand-Anything index of one
// emitted Go file (agentloop.CallGraphIndex) and the ContextRouter selector over it
// (agentloop.AffectedSubgraph), so the Workbench, the CLI, and the harness share ONE door to the
// index the router consumes to target the affected sub-graph.
//
// THE WALL (CLAUDE.md §2): the index is BELOW the line — it READS emitted Go and reports the graph
// (context / telemetry), it NEVER writes truth.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): a pure AST walk — same source ⇒ same graph ⇒ same hash,
// never an LLM "read the code" judgement. Out-of-scope / unparseable source yields the empty index.

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
)

type callGraphIndexInput struct {
	Filename string `json:"filename" jsonschema:"the emitted file name (for diagnostics); defaults to emitted.go when empty"`
	Source   string `json:"source" jsonschema:"the emitted Go source to index; must carry the AIDOS marker to be in scope (ADR 0036 §3)"`
	// Changed is the optional set of changed symbols; when non-empty the tool ALSO returns the
	// affected sub-graph (the changed symbols + every node that transitively depends on them) — what
	// the ContextRouter (S33) consumes to target only the touched layers.
	Changed []string `json:"changed" jsonschema:"optional changed symbols; when set, the affected sub-graph is returned"`
}

type callGraphNode struct {
	Name  string   `json:"name"`
	Calls []string `json:"calls"`
}

type callGraphIndexOutput struct {
	Package  string          `json:"package"`
	Nodes    []callGraphNode `json:"nodes"`
	Hash     string          `json:"hash"`
	Affected []string        `json:"affected"`
}

func defaultIndexFilename(name string) string {
	if name == "" {
		return "emitted.go"
	}
	return name
}

func (s *server) callGraphIndex(_ context.Context, _ *mcp.CallToolRequest, in callGraphIndexInput) (*mcp.CallToolResult, callGraphIndexOutput, error) {
	idx := agentloop.CallGraphIndex(defaultIndexFilename(in.Filename), []byte(in.Source))
	out := callGraphIndexOutput{
		Package:  idx.Package,
		Hash:     idx.Hash,
		Nodes:    make([]callGraphNode, 0, len(idx.Nodes)),
		Affected: []string{},
	}
	for _, n := range idx.Nodes {
		out.Nodes = append(out.Nodes, callGraphNode{Name: n.Name, Calls: n.Calls})
	}
	if len(in.Changed) > 0 {
		out.Affected = agentloop.AffectedSubgraph(idx, in.Changed)
	}
	return nil, out, nil
}
