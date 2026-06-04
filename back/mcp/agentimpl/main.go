// Command agentimpl is the AIDOS Runtime AgentImplementation MCP server (BA06).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the
// deterministic emitter agentimpl.Project (BA03): given a layerRef (a CoucheAgent@version),
// it returns the PROJECTED AgentImplementation — the below-the-line, regenerable runnable
// configuration (model, temperature/maxturns/seed, resolved tools/skills/hooks, allowed/
// forbidden paths, allowed network hosts/exec, budgets) PLUS its content hash. Re-projecting
// the SAME layerRef yields the SAME hash (determinism-first, the reproducibility mirror pins it).
//
// Tools (one per backend op):
//
//	agentimpl_project  — project a governed CoucheAgent (by layerRef) → its AgentImplementation{+hash}
//	agentimpl_list     — read-only list of the governed layers available to project (layerRef + role)
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY. Project is a PURE, TOTAL function
// (back/runtime/agentimpl.Project) — no LLM, no clock, no rng, no I/O — and PERSISTS NOTHING
// above the line (a projection is regenerable, carries NO truth: no version-as-truth, no
// mirror). The emitted AgentImplementation ALWAYS carries the wall: ForbiddenPaths is the
// single-sourced WallForbiddenPaths (kernel/mirrors/fitness + the truth path prefixes), and
// AllowedNetworkHosts is EMPTY ⇒ no egress by default (fail-closed). There is NO run control
// here — nothing executes until something is applied (the loop is BA15+).
//
// READ/MOCKED VIEW (§6): the governed `kernel.agent_layer` SELECT view is materialized as a
// deterministic example snapshot (the mocked read-only view — exampleLayers), mirroring the
// front fixture lib/agentlayer-data.ts verbatim so the Workbench and the MCP agree. When the
// derived read view lands, newView is swapped to read it; the tools and the wall hold.
//
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"
	"sort"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// ── Tool I/O types (JSON-serialisable) ──

type projectInput struct {
	LayerRef string `json:"layer_ref" jsonschema:"the CoucheAgent@version (layer ref) to project into a runnable AgentImplementation"`
}
type projectOutput struct {
	Impl  agentimpl.AgentImplementation `json:"impl" jsonschema:"the projected AgentImplementation (below the line, regenerable, carries no truth)"`
	Hash  string                        `json:"hash" jsonschema:"the deterministic content-hash of the projection (re-project ⇒ same hash)"`
	Found bool                          `json:"found" jsonschema:"whether a governed layer with that layer_ref exists in the read-only view"`
}

type listOutput struct {
	Layers []layerRefRow `json:"layers" jsonschema:"the governed layers available to project (read-only)"`
}
type layerRefRow struct {
	LayerRef string `json:"layer_ref"`
	Role     string `json:"role"`
	Kind     string `json:"kind"`
}

// server wires the read-only governed-layer view to the deterministic emitter. It holds NO
// mutable state above the line — a projection is regenerated on every call (idempotent).
type server struct {
	view view
}

// view is the read-only governed-layer provider (the kernel.agent_layer SELECT view, mocked here).
type view interface {
	Layer(layerRef string) (agentlayer.CoucheAgent, bool)
	Layers() []agentlayer.CoucheAgent
}

// exampleView serves the deterministic example snapshot (the mocked read-only view, §6),
// mirroring the front fixture lib/agentlayer-data.ts.
type exampleView struct{}

func (exampleView) Layers() []agentlayer.CoucheAgent { return exampleLayers() }
func (exampleView) Layer(layerRef string) (agentlayer.CoucheAgent, bool) {
	for _, c := range exampleLayers() {
		if agentimpl.LayerRef(c) == layerRef || c.Version == layerRef || c.Spec.Role == layerRef {
			return c, true
		}
	}
	return agentlayer.CoucheAgent{}, false
}

// project is the capability: project the governed layer (by ref) into its AgentImplementation
// + content-hash. A projection is REGENERATED on every call (pure, idempotent) — nothing is
// persisted above the line. An unknown ref is reported not-found, never fabricated.
func (s *server) project(_ context.Context, _ *mcp.CallToolRequest, in projectInput) (*mcp.CallToolResult, projectOutput, error) {
	layer, ok := s.view.Layer(in.LayerRef)
	if !ok {
		return nil, projectOutput{Found: false}, nil
	}
	// providerCfg carries ONLY the resolved endpoint/credential (gate inputs equal the
	// layer's own provider/model) — NEVER a behaviour knob (BA03). The knobs come uniquely
	// from the governed SOURCE; perturbing endpoint/key leaves the hash identical.
	cfg := agentimpl.ProviderCfg{
		Provider: layer.Spec.Provider,
		Model:    layer.Spec.Modele,
		Endpoint: "https://api.example.test/v1",
		APIKey:   "sk-resolved-secret",
	}
	impl, err := agentimpl.Project(layer, cfg, "pack-readonly")
	if err != nil {
		return nil, projectOutput{}, fmt.Errorf("agentimpl: project %q: %w", in.LayerRef, err)
	}
	h, err := agentimpl.Hash(impl)
	if err != nil {
		return nil, projectOutput{}, fmt.Errorf("agentimpl: hash: %w", err)
	}
	return nil, projectOutput{Impl: impl, Hash: h, Found: true}, nil
}

// list is the read-only enumeration of the governed layers available to project.
func (s *server) list(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, listOutput, error) {
	out := listOutput{}
	for _, c := range s.view.Layers() {
		out.Layers = append(out.Layers, layerRefRow{
			LayerRef: agentimpl.LayerRef(c),
			Role:     c.Spec.Role,
			Kind:     string(c.Kind),
		})
	}
	sort.Slice(out.Layers, func(i, j int) bool { return out.Layers[i].LayerRef < out.Layers[j].LayerRef })
	return nil, out, nil
}

// newMCPServer builds the MCP server and registers the two read-only agentimpl tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-agentimpl", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentimpl_project", Description: "Project a governed CoucheAgent (by layer_ref) into its runnable AgentImplementation + content-hash (read-only, regenerable, persists no truth)."}, s.project)
	mcp.AddTool(srv, &mcp.Tool{Name: "agentimpl_list", Description: "Read-only list of the governed layers available to project (layer_ref + role + kind)."}, s.list)
	return srv
}

func newServer() *server {
	return &server{view: exampleView{}}
}

func main() {
	srv := newMCPServer(newServer())
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("agentimpl: run: %v", err)
	}
}
