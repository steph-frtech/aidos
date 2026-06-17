// Package templatessrv (extracted, ADR 0092 batch-3) is the reusable AIDOS S81 CURATED TEMPLATE
// CATALOGUE MCP server (ADR 0009: every backend op is an MCP tool). It is the capability door over
// back/kernel/templates — the curated starter apps (e-commerce, CRM, booking) packaged as
// content-addressed bundles. Four tools:
//
//	templates_list         — list the curated bundles (id, labels, BundleID, piece counts). PURE.
//	templates_get          — fetch one bundle's full shape (entities/relations/operations/mirrors/UI).
//	templates_instantiate  — DRY-RUN instantiate a template for a target slug → a deterministic GREEN
//	                         StarterProject (the duplicate-from-template of S56). Writes nothing.
//	templates_fork         — "fork this app": instantiate a starter from a STABLE PHASE (deterministic).
//
// STATELESS + DETERMINISTIC (CLAUDE.md §6/§8). Each tool is a PURE function of its input; the server
// holds no DB, no clock, no RNG, and never touches kernel/mirrors/fitness (the wall). Instantiation +
// fork are dry-run VALUES (WroteKernel always false); landing the bundle's truths goes via the wall
// (propose → ChangeSet → approval), which is templates.Propose (exposed by the gateway changeset
// handler, NOT one of these read tools). The starter-project ROW (a duplicate-from-template) is
// written below the line by the project/DAG store path (S56), not by this pure server.
//
// Every dispatched I/O is a scalar object: templates.Bundle / StarterProject are plain structs (NO
// json.RawMessage body — the only RawMessage in the package is templates.Propose's changeset Delta,
// which is NOT one of these four read tools), so the S59 byte-array transport scar is avoided by
// construction and all four read tools dispatch through the gateway over HTTP.
//
// Extracted at ADR 0092 batch-3 so the gateway dispatcher reuses the SAME server in-process — reuse,
// don't reinvent (CLAUDE.md §0); the engine is the SINGLE live source and the TS twin
// (lib/templates.ts) becomes the demo fallback only. Transport: stdio.
package templatessrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/templates"
)

// ── list ──

type listInput struct{}

type bundleSummary struct {
	ID         string            `json:"id"`
	Labels     map[string]string `json:"labels"`
	BundleID   string            `json:"bundle_id"`
	Entities   int               `json:"entities"`
	Relations  int               `json:"relations"`
	Behaviors  []string          `json:"behaviors"`
	Operations int               `json:"operations"`
	Mirrors    int               `json:"mirrors"`
	UISources  int               `json:"ui_sources"`
}

type listOutput struct {
	OK        bool            `json:"ok"`
	Error     string          `json:"error,omitempty"`
	Templates []bundleSummary `json:"templates,omitempty"`
}

func toSummary(b templates.Bundle) bundleSummary {
	return bundleSummary{
		ID: string(b.ID), Labels: b.Labels, BundleID: b.BundleID,
		Entities: len(b.Entities), Relations: len(b.Relations), Behaviors: b.Behaviors,
		Operations: len(b.Operations), Mirrors: len(b.Mirrors), UISources: len(b.UISources),
	}
}

func listTool(_ context.Context, _ *mcp.CallToolRequest, _ listInput) (*mcp.CallToolResult, listOutput, error) {
	cur, err := templates.Curated()
	if err != nil {
		return nil, listOutput{OK: false, Error: err.Error()}, nil
	}
	out := make([]bundleSummary, 0, len(cur))
	for _, b := range cur {
		out = append(out, toSummary(b))
	}
	return nil, listOutput{OK: true, Templates: out}, nil
}

// ── get ──

type getInput struct {
	ID string `json:"id" jsonschema:"the curated template id (ecommerce|crm|booking)"`
}

type getOutput struct {
	OK     bool              `json:"ok"`
	Error  string            `json:"error,omitempty"`
	Bundle *templates.Bundle `json:"bundle,omitempty"`
}

func getTool(_ context.Context, _ *mcp.CallToolRequest, in getInput) (*mcp.CallToolResult, getOutput, error) {
	b, err := templates.Get(templates.TemplateID(in.ID))
	if err != nil {
		return nil, getOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, getOutput{OK: true, Bundle: &b}, nil
}

// ── instantiate (duplicate-from-template, S56) ──

type instantiateInput struct {
	ID     string `json:"id" jsonschema:"the curated template id (ecommerce|crm|booking)"`
	Target string `json:"target" jsonschema:"the target project slug the starter is instantiated for (non-empty)"`
}

type instantiateOutput struct {
	OK          bool     `json:"ok"`
	Error       string   `json:"error,omitempty"`
	Template    string   `json:"template,omitempty"`
	Target      string   `json:"target,omitempty"`
	Pieces      []string `json:"pieces,omitempty"`
	PieceCount  int      `json:"piece_count,omitempty"`
	HasAppAuth  bool     `json:"has_app_auth"`
	StarterID   string   `json:"starter_id,omitempty"`
	WroteKernel bool     `json:"wrote_kernel"`
}

func toInstantiateOutput(sp templates.StarterProject) instantiateOutput {
	return instantiateOutput{
		OK: true, Template: string(sp.Template), Target: sp.Target,
		Pieces: templates.SortedNames(sp), PieceCount: templates.PieceCount(sp),
		HasAppAuth: sp.Auth != nil, StarterID: sp.StarterID, WroteKernel: sp.WroteKernel,
	}
}

func instantiateTool(_ context.Context, _ *mcp.CallToolRequest, in instantiateInput) (*mcp.CallToolResult, instantiateOutput, error) {
	sp, err := templates.Instantiate(templates.TemplateID(in.ID), in.Target)
	if err != nil {
		return nil, instantiateOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, toInstantiateOutput(sp), nil
}

// ── fork (fork this app at a stable phase) ──

type forkInput struct {
	ID          string `json:"id" jsonschema:"the curated template id (ecommerce|crm|booking)"`
	Target      string `json:"target" jsonschema:"the NEW target project slug of the fork (non-empty)"`
	ParentPhase string `json:"parent_phase" jsonschema:"the content-addressed stable phase the fork forks from"`
}

func forkTool(_ context.Context, _ *mcp.CallToolRequest, in forkInput) (*mcp.CallToolResult, instantiateOutput, error) {
	sp, err := templates.Fork(templates.TemplateID(in.ID), in.Target, in.ParentPhase)
	if err != nil {
		return nil, instantiateOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, toInstantiateOutput(sp), nil
}

// NewServer registers the four S81 templates tools. Every tool is PURE; instantiate/fork are dry-run
// value computations, never a direct kernel write (the wall). The gateway dispatcher reuses this SAME
// constructor in-process for the read tools (the live path).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-templates", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "templates_list", Description: "S81: list the curated starter templates (ecommerce/crm/booking) as content-addressed bundle summaries. Deterministic; writes nothing."}, listTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "templates_get", Description: "S81: fetch one curated bundle's full shape (entities/relations/operations/mirrors/UI). Deterministic."}, getTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "templates_instantiate", Description: "S81: DRY-RUN instantiate a template for a target slug → a deterministic GREEN starter project (duplicate-from-template, S56). Writes nothing."}, instantiateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "templates_fork", Description: "S81: fork this app — instantiate a starter from a stable phase (deterministic copy). Writes nothing."}, forkTool)
	return srv
}
