// Command release is the AIDOS Runtime/Workbench per-ACCOUNT RELEASE MCP server (S117;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over the S117 account-release layer (back/runtime/adoption/
// accountrelease + back/runtime/adoption): the per-account release-v0 inventory — the
// account's projects (each with its HONEST demo-vs-real status), the live CLI/Workbench
// surface, the docs index, the test inventory, the changelog, the honest known-limits —
// PLUS the adoption ladder advising the next smallest ratchet.
//
// THE WALL (CLAUDE.md §2): every tool is BELOW the line and READ-ONLY. The server
// ASSEMBLES an inventory + COMPUTES a ladder; it AUTHORS NOTHING, installs nothing,
// ships nothing, writes NO kernel/mirrors/fitness. Advising the next tier is advice;
// turning on a capability goes through idea → mirror → /goal → human approval.
//
// Tools (one tool = one backend op):
//
//	release_assemble       — assemble an account's content-addressed release pack (honest inventory + next tier)
//	release_adoption_plan  — compute the adoption ladder (T0→T4) from an account's capabilities
//	release_cli_surface    — list the live `aidos` CLI verbs (core + the S117 gateway verbs) honestly
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input. Same
// input → same output (the clock is PASSED IN). The reproducibility mirrors
// (accountrelease_property_test.go + lib/account-release.test.ts) pin it. Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
	"github.com/steph-frtech/aidos/back/runtime/adoption/accountrelease"
)

// ── release_assemble ──

type assembleInput struct {
	View accountrelease.AccountView `json:"view" jsonschema:"the read-only per-account inventory: account, projects (with demo-vs-real status), CLI surface, routes, docs, mirrors, changesets, declared limits, capabilities"`
	Now  int64                      `json:"now,omitempty" jsonschema:"the assembled-at stamp (PASSED IN so the pack is deterministic); the pack id excludes it"`
}
type assembleOutput struct {
	Pack accountrelease.AccountReleasePack `json:"pack"`
}

func assemble(_ context.Context, _ *mcp.CallToolRequest, in assembleInput) (*mcp.CallToolResult, assembleOutput, error) {
	return nil, assembleOutput{Pack: accountrelease.Assemble(in.View, in.Now)}, nil
}

// ── release_adoption_plan ──

type planInput struct {
	Capabilities []adoption.Capability `json:"capabilities" jsonschema:"the capabilities live in the account's truth-store (tests, mutation, one_krd_cell, kernel, mirror, reality_mirror_live, context_graph, memory, evolution_sandbox, evolve, quality_diversity)"`
}
type planOutput struct {
	Plan adoption.AdoptionPlan `json:"plan"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	return nil, planOutput{Plan: adoption.Plan(in.Capabilities)}, nil
}

// ── release_cli_surface ──

// VerbInfo is one live `aidos` CLI verb, honestly classified as core (S03 declared
// behaviour) or a gateway verb (S117 — routed over the passerelle). The list is the
// AUTHORITATIVE CLI surface (the same a release pack inventories).
type VerbInfo struct {
	Name        string `json:"name"`
	Kind        string `json:"kind"` // "core" | "gateway"
	Tool        string `json:"tool,omitempty"`
	Disposition string `json:"disposition,omitempty"` // "below_line" for gateway verbs
}

type cliSurfaceInput struct{}
type cliSurfaceOutput struct {
	Verbs []VerbInfo `json:"verbs"`
}

// cliSurface lists the live CLI surface. The CORE verbs (S03) + the S117 GATEWAY verbs.
// Declared, never discovered — the same closed set the binary dispatches and the /cli
// projection renders. Every gateway verb names the below-the-line tool it routes over.
func cliSurface(_ context.Context, _ *mcp.CallToolRequest, _ cliSurfaceInput) (*mcp.CallToolResult, cliSurfaceOutput, error) {
	out := cliSurfaceOutput{Verbs: []VerbInfo{
		{Name: "check", Kind: "core"},
		{Name: "impact", Kind: "core"},
		{Name: "stable", Kind: "core"},
		{Name: "diff", Kind: "core"},
		{Name: "explain", Kind: "core"},
		{Name: "goal", Kind: "gateway", Tool: "changeset_open", Disposition: "below_line"},
		{Name: "grill", Kind: "gateway", Tool: "idea_grill", Disposition: "below_line"},
		{Name: "spike", Kind: "gateway", Tool: "idea_spike", Disposition: "below_line"},
		{Name: "harvest", Kind: "gateway", Tool: "idea_harvest", Disposition: "below_line"},
		{Name: "trim", Kind: "gateway", Tool: "idea_capture", Disposition: "below_line"},
		{Name: "init", Kind: "gateway", Tool: "project_create", Disposition: "below_line"},
	}}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-release", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "release_assemble", Description: "S117: assemble an account's content-addressed Release-v0 pack — the HONEST inventory of what EXISTS in the account's live truth-store (projects with demo-vs-real status, CLI/Workbench surface, docs, test inventory, changelog, honest known-limits) + the adoption ladder advising the next tier. ASSEMBLES; authors nothing, ships nothing, writes no truth. Pure (clock passed in)."}, assemble)
	mcp.AddTool(srv, &mcp.Tool{Name: "release_adoption_plan", Description: "S117/S47: compute the adoption ladder (T0→T4) from an account's live capabilities — the smallest ratchet that clicks next. T1 does NOT require QualityDiversity; T2 requires a live RealityMirror; T4 requires a live EvolutionSandbox. Pure; advises, installs nothing."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "release_cli_surface", Description: "S117: list the live `aidos` CLI surface — the five CORE verbs (S03) + the six S117 GATEWAY verbs (goal/grill/spike/harvest/trim/init), each naming the below-the-line passerelle tool it routes over. The authoritative, closed surface a release pack inventories. Pure."}, cliSurface)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("aidos-release MCP server: %v", err)
	}
}
