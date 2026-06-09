// Command tech-spec is the AIDOS Tech-Spec Projection MCP server (FK15 part (b); ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over FK15 part (b) (back/runtime/generators/techspec): the
// TWO ASSEMBLED PROJECTIONS per kernel (FKE-20.1) — the Fiche de Spécification Technique
// and the Suite de Tests Techniques, ASSEMBLED from already-declared technical elements
// (Contrat F5 + Modèle F4 + the OSI stack + facet specs S1/B1/R1/V1/M1 + linked ADRs +
// N4/N5 tests), never hand-edited (hash-protected), never the truth (zero double-typing).
// Six PURE, write-nothing tools:
//
//	assemble      — a TechKernel + a projection → the deterministic file bytes + source-hash.
//	assemble_all  — a TechKernel → both projections, keyed by projection.
//	declared_refs — a TechKernel → the SORTED set of declared technical refs (the existing truth).
//	assembled_refs— a TechKernel → the SORTED set of refs that ACTUALLY appear in the bytes;
//	                equals declared_refs ⇔ zero new truth (no fabrication, no loss).
//	detect_drift  — a TechKernel + a projection + the on-disk content → HAND_EDITED (the FK15
//	                fault-injection) / MISSING_MARKER / STALE_HASH, or clean.
//	validate      — a TechKernel → its shape verdict OR a closed refusal (NO_KERNEL_ID /
//	                UNKNOWN_OSI_LAYER / UNKNOWN_FACET / UNKNOWN_TEST_KIND / EMPTY_REF /
//	                OSI_ON_PURE_FUNCTION).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING. It READS a kernel and returns file bytes /
// ref-sets / drifts — freezing a projection goes idea → mirror → /goal → human approval.
// DETERMINISM-FIRST (§8): all six tools are PURE — no clock, no rng, NO LLM (assembly is a
// deterministic render; the zero-new-truth check is a set comparison; drift is a byte
// comparison — exactly the checks that MUST be code, never an "LLM spec agent").
// Transport: stdio.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/generators/techspec"
)

// ── shared shapes (1:1 with techspec.TechKernel) ──

type declIn struct {
	Ref   string `json:"ref" jsonschema:"the stable declaration id (its lexicon name), e.g. contract:CheckoutAPI"`
	Title string `json:"title" jsonschema:"the human heading rendered in the projection"`
	Body  string `json:"body" jsonschema:"the rendered prose (français d'abord)"`
}

func (d declIn) to() techspec.Decl { return techspec.Decl{Ref: d.Ref, Title: d.Title, Body: d.Body} }

func decls(in []declIn) []techspec.Decl {
	out := make([]techspec.Decl, len(in))
	for i, d := range in {
		out[i] = d.to()
	}
	return out
}

type osiIn struct {
	Layer string   `json:"layer" jsonschema:"one of: L7-application|L6-presentation|L5-session|L4-transport"`
	Specs []declIn `json:"specs,omitempty"`
	Tests []declIn `json:"tests,omitempty"`
}

type facetIn struct {
	Facet string   `json:"facet" jsonschema:"one of the technical facets: S|B|R|V|M"`
	Specs []declIn `json:"specs,omitempty"`
	Tests []declIn `json:"tests,omitempty"`
}

type groupIn struct {
	Kind  string   `json:"kind" jsonschema:"one of: N4-unit|N4-integration|N5-infra|S3-security|B3-perf|R3-chaos|M3-arch"`
	Tests []declIn `json:"tests,omitempty"`
}

type kernelIn struct {
	KernelID   string    `json:"kernel_id" jsonschema:"the cell id carried into both projections"`
	Networked  bool      `json:"networked" jsonschema:"true for a communication boundary (API/MCP/connector); a pure function is false and has NO OSI section"`
	Contract   declIn    `json:"contract,omitempty" jsonschema:"the F5 interface declaration (the Contrat)"`
	Model      declIn    `json:"model,omitempty" jsonschema:"the F4 data declaration (the Modèle)"`
	OSI        []osiIn   `json:"osi,omitempty" jsonschema:"per-OSI-layer declarations (networked kernels only)"`
	Facets     []facetIn `json:"facets,omitempty" jsonschema:"the technical facet (S/B/R/V/M) spec+test declarations"`
	ADRs       []declIn  `json:"adrs,omitempty" jsonschema:"the linked architecture-decision declarations"`
	TestGroups []groupIn `json:"test_groups,omitempty" jsonschema:"the N4/N5 technical-test declarations"`
}

func (k kernelIn) to() techspec.TechKernel {
	osi := make([]techspec.OSISpec, len(k.OSI))
	for i, o := range k.OSI {
		osi[i] = techspec.OSISpec{Layer: techspec.OSILayer(o.Layer), Specs: decls(o.Specs), Tests: decls(o.Tests)}
	}
	facets := make([]techspec.FacetSpec, len(k.Facets))
	for i, f := range k.Facets {
		facets[i] = techspec.FacetSpec{Facet: techspec.SpecFacet(f.Facet), Specs: decls(f.Specs), Tests: decls(f.Tests)}
	}
	groups := make([]techspec.TestGroup, len(k.TestGroups))
	for i, g := range k.TestGroups {
		groups[i] = techspec.TestGroup{Kind: techspec.TestKind(g.Kind), Tests: decls(g.Tests)}
	}
	return techspec.TechKernel{
		KernelID:   k.KernelID,
		Networked:  k.Networked,
		Contract:   k.Contract.to(),
		Model:      k.Model.to(),
		OSI:        osi,
		Facets:     facets,
		ADRs:       decls(k.ADRs),
		TestGroups: groups,
	}
}

// ── assemble ──

type assembleIn struct {
	Kernel     kernelIn `json:"kernel"`
	Projection string   `json:"projection" jsonschema:"one of: fiche-specification-technique|suite-tests-techniques"`
}

type assembleOut struct {
	OK         bool   `json:"ok"`
	File       string `json:"file,omitempty"`
	SourceHash string `json:"source_hash,omitempty"`
	Error      string `json:"error,omitempty"`
}

func assemble(_ context.Context, _ *mcp.CallToolRequest, in assembleIn) (*mcp.CallToolResult, assembleOut, error) {
	k := in.Kernel.to()
	file, err := techspec.Assemble(k, techspec.Projection(in.Projection))
	if err != nil {
		return nil, assembleOut{OK: true, Error: classify(err)}, nil
	}
	h, _ := techspec.SourceHash(k)
	return nil, assembleOut{OK: true, File: file, SourceHash: h}, nil
}

// ── assemble_all ──

type projFileOut struct {
	Projection string `json:"projection"`
	File       string `json:"file"`
}

type assembleAllOut struct {
	OK         bool          `json:"ok"`
	Files      []projFileOut `json:"files,omitempty"`
	SourceHash string        `json:"source_hash,omitempty"`
	Error      string        `json:"error,omitempty"`
}

func assembleAll(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, assembleAllOut, error) {
	k := in.to()
	files, err := techspec.AssembleAll(k)
	if err != nil {
		return nil, assembleAllOut{OK: true, Error: classify(err)}, nil
	}
	out := make([]projFileOut, 0, len(files))
	for _, p := range techspec.Projections() {
		out = append(out, projFileOut{Projection: string(p), File: files[p]})
	}
	h, _ := techspec.SourceHash(k)
	return nil, assembleAllOut{OK: true, Files: out, SourceHash: h}, nil
}

// ── declared_refs / assembled_refs ──

type refsOut struct {
	OK    bool     `json:"ok"`
	Refs  []string `json:"refs,omitempty"`
	Error string   `json:"error,omitempty"`
}

func declaredRefs(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, refsOut, error) {
	k := in.to()
	if err := techspec.Validate(k); err != nil {
		return nil, refsOut{OK: true, Error: classify(err)}, nil
	}
	return nil, refsOut{OK: true, Refs: techspec.DeclaredRefs(k)}, nil
}

func assembledRefs(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, refsOut, error) {
	k := in.to()
	if err := techspec.Validate(k); err != nil {
		return nil, refsOut{OK: true, Error: classify(err)}, nil
	}
	refs, err := techspec.AssembledRefs(k)
	if err != nil {
		return nil, refsOut{OK: true, Error: classify(err)}, nil
	}
	return nil, refsOut{OK: true, Refs: refs}, nil
}

// ── detect_drift ──

type detectIn struct {
	Kernel     kernelIn `json:"kernel"`
	Projection string   `json:"projection" jsonschema:"the projection to check"`
	OnDisk     string   `json:"on_disk" jsonschema:"the actual on-disk content of the file"`
}

type detectOut struct {
	OK        bool   `json:"ok"`
	Clean     bool   `json:"clean"`
	DriftKind string `json:"drift_kind,omitempty"`
	Expected  string `json:"expected,omitempty"`
	Error     string `json:"error,omitempty"`
}

func detectDrift(_ context.Context, _ *mcp.CallToolRequest, in detectIn) (*mcp.CallToolResult, detectOut, error) {
	d, err := techspec.DetectDrift(in.Kernel.to(), techspec.Projection(in.Projection), in.OnDisk)
	if err != nil {
		return nil, detectOut{OK: true, Error: classify(err)}, nil
	}
	if d == nil {
		return nil, detectOut{OK: true, Clean: true}, nil
	}
	return nil, detectOut{OK: true, Clean: false, DriftKind: string(d.Kind), Expected: d.Expected}, nil
}

// ── validate ──

type validateOut struct {
	OK    bool   `json:"ok"`
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, validateOut, error) {
	if err := techspec.Validate(in.to()); err != nil {
		return nil, validateOut{OK: true, Valid: false, Error: classify(err)}, nil
	}
	return nil, validateOut{OK: true, Valid: true}, nil
}

// classify maps a techspec error to its closed BlockReason code.
func classify(err error) string {
	switch {
	case errors.Is(err, techspec.ErrNoKernelID):
		return "NO_KERNEL_ID"
	case errors.Is(err, techspec.ErrUnknownOSILayer):
		return "UNKNOWN_OSI_LAYER"
	case errors.Is(err, techspec.ErrUnknownFacet):
		return "UNKNOWN_FACET"
	case errors.Is(err, techspec.ErrUnknownTestKind):
		return "UNKNOWN_TEST_KIND"
	case errors.Is(err, techspec.ErrEmptyRef):
		return "EMPTY_REF"
	case errors.Is(err, techspec.ErrOSIOnPureFunction):
		return "OSI_ON_PURE_FUNCTION"
	case errors.Is(err, techspec.ErrUnknownProjection):
		return "UNKNOWN_PROJECTION"
	default:
		return err.Error()
	}
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-tech-spec", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "assemble",
		Description: "FK15 (FKE-20.1): a TechKernel + a projection (fiche-specification-technique|suite-tests-techniques) → the deterministic file bytes + the source-hash. Same kernel ⇒ byte-identical file. PURE; writes nothing (the wall).",
	}, assemble)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "assemble_all",
		Description: "FK15: a TechKernel → BOTH projections, keyed by projection, deterministically. PURE; writes nothing.",
	}, assembleAll)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "declared_refs",
		Description: "FK15: a TechKernel → the SORTED set of declared technical refs (the existing truth the projections may assemble). PURE; writes nothing.",
	}, declaredRefs)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "assembled_refs",
		Description: "FK15 (zero new truth): a TechKernel → the SORTED set of refs that ACTUALLY appear in the assembled bytes; equals declared_refs ⇔ no fabrication and no loss. PURE; writes nothing.",
	}, assembledRefs)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "detect_drift",
		Description: "FK15 (the hash-protection): a TechKernel + a projection + the on-disk content → the drift verdict (HAND_EDITED — the FK15 fault-injection / MISSING_MARKER / STALE_HASH) or clean. The judge is a byte comparison + a hash equality, never a prompt. PURE; writes nothing.",
	}, detectDrift)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "validate",
		Description: "FK15: a TechKernel → its shape verdict OR the closed refusal (NO_KERNEL_ID / UNKNOWN_OSI_LAYER / UNKNOWN_FACET / UNKNOWN_TEST_KIND / EMPTY_REF / OSI_ON_PURE_FUNCTION). PURE; writes nothing.",
	}, validate)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("tech-spec: run: %w", err))
	}
}
