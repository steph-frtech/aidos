// Command facet is the AIDOS Kernel facet MCP server (FK02; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over FK02 (back/kernel/facets): the eight canonical KRD
// facets (FKE-1.3, F/I/S/B/R/V/M/X), the collapsible facet-set a kernel declares, and the
// validator that refuses a kernel with no functional facet, an empty facet, or a declared
// facet missing its proof pair:
//
//	validate  — the SOLE legal facet validator: a FacetSet → its verdict (valid + issues).
//	hash      — the content-addressed facet signature: a FacetSet → its order/kernel-independent digest.
//	facets    — the eight canonical FKE-1.3 lenses in canonical F→X order (the panel filter set).
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to the kernel/mirrors/fitness. The
// facet-set is a value the validator JUDGES; persisting it onto a record goes through the
// privileged aidos CLI role at the legal door, never from here.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no
// clock, no rng, no I/O, never an LLM. Same FacetSet → same verdict, same hash (the FK02
// done-criteria). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// ── validate ──

type validateInput struct {
	KernelID  string            `json:"kernel_id,omitempty" jsonschema:"the kernel whose facets these are (for the panel; not hashed)"`
	Instances []facets.Instance `json:"instances" jsonschema:"the declared facet instances — one per instantiated lens (facet, has_intent, has_proof_pair)"`
}

type issueOut struct {
	Facet    string `json:"facet,omitempty"`
	Code     string `json:"code"`
	Advisory bool   `json:"advisory"`
}

type validateOutput struct {
	OK            bool       `json:"ok"`
	Valid         bool       `json:"valid"`
	HasFunctional bool       `json:"has_functional"`
	Issues        []issueOut `json:"issues"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOutput, error) {
	res := facets.Validate(facets.FacetSet{KernelID: in.KernelID, Instances: in.Instances})
	out := validateOutput{OK: true, Valid: res.Valid, HasFunctional: res.HasFunctional}
	for _, is := range res.Issues {
		out.Issues = append(out.Issues, issueOut{Facet: string(is.Facet), Code: is.Code, Advisory: is.Advisory})
	}
	return nil, out, nil
}

// ── hash ──

type hashInput struct {
	KernelID  string            `json:"kernel_id,omitempty" jsonschema:"ignored by the signature (the digest is over the facet declarations only)"`
	Instances []facets.Instance `json:"instances" jsonschema:"the declared facet instances to content-address"`
}

type hashOutput struct {
	OK        bool   `json:"ok"`
	Signature string `json:"signature"`
}

func hash(_ context.Context, _ *mcp.CallToolRequest, in hashInput) (*mcp.CallToolResult, hashOutput, error) {
	sig := facets.Hash(facets.FacetSet{KernelID: in.KernelID, Instances: in.Instances})
	return nil, hashOutput{OK: true, Signature: sig}, nil
}

// ── facets ──

type facetsInput struct{}

type facetRow struct {
	Letter string `json:"letter"`
	Name   string `json:"name"`
	Soft   bool   `json:"soft"`
}

type facetsOutput struct {
	OK     bool       `json:"ok"`
	Facets []facetRow `json:"facets"`
}

func listFacets(_ context.Context, _ *mcp.CallToolRequest, _ facetsInput) (*mcp.CallToolResult, facetsOutput, error) {
	out := facetsOutput{OK: true}
	for _, f := range facets.Facets() {
		out.Facets = append(out.Facets, facetRow{Letter: string(f), Name: f.Name(), Soft: f.IsSoft()})
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-facet", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "validate", Description: "FK02: the SOLE legal facet validator — refuse a kernel with no functional facet (F incompressible), an empty facet, or a declared facet missing its proof pair (a monster; advisory only for the soft X). PURE, deterministic; writes nothing (the wall)."}, validate)
	mcp.AddTool(srv, &mcp.Tool{Name: "hash", Description: "FK02: the content-addressed facet signature — the order/kernel-independent SHA-256 of the declared facets (the round-trip content-addressed done-criterion). PURE."}, hash)
	mcp.AddTool(srv, &mcp.Tool{Name: "facets", Description: "FK02: the eight canonical FKE-1.3 facets (F/I/S/B/R/V/M/X) in canonical order — the closed lens set, never invented (X is the soft lens). PURE."}, listFacets)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("facet: run: %w", err))
	}
}
