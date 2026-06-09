// Command reality-ingest is the AIDOS S106 REALITY-INGEST MCP server (ROADMAP-app-builder
// §S106, EPIC 12 / E12; ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S106 (back/runtime/realityingest): the EXTERNAL loop that
// turns a DEPLOYED emitted app's production OpenTelemetry DIVERGENCE — read by the
// telemetry-reader (S43/E12) — into a project-scoped RealityMirror (provenance=incident) and a
// DRAFT idea whose text is a DETERMINISTIC TEMPLATE projection (never an LLM summary):
//
//	detect_divergence — compare a telemetry report against a mirror's expectation; return the
//	                    divergence record, or null when prod is within the mirror's promise.
//	                    The deterministic frontier (ROADMAP §S106 "détection = code").
//	ingest_divergence — the whole loop: detect → project-scoped RealityMirror → DRAFT idea
//	                    (template text, provenance=incident). Returns null on no divergence.
//	render_idea_text  — the template projection over a divergence (same record → same text);
//	                    proves the rédaction is code, not an LLM summary.
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY on the kernel — every tool returns a VALUE
// whose WroteKernel is false; the only outward edge is a DRAFT idea (idea → mirror → /goal →
// approval). The direct Reality→Kernel edge is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same input → identical output (the S106 reproducibility
// mirror). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/realityingest"
)

// ── detect_divergence ──

type detectInput struct {
	ProjectID   string                          `json:"project_id" jsonschema:"the deployed app this telemetry belongs to (non-empty, multi-tenant scope)"`
	Report      realityingest.TelemetryReport   `json:"report" jsonschema:"the telemetry-reader per-operation aggregate: operation, calls, errors, p99_ms"`
	Expectation realityingest.MirrorExpectation `json:"expectation" jsonschema:"the mirror's promise about the operation: mirror_ref, operation, max_error_rate, max_p99_ms"`
}

type detectOutput struct {
	Diverged   bool                      `json:"diverged"`
	Divergence *realityingest.Divergence `json:"divergence,omitempty"`
}

func detectDivergence(_ context.Context, _ *mcp.CallToolRequest, in detectInput) (*mcp.CallToolResult, detectOutput, error) {
	div, err := realityingest.DetectDivergence(in.ProjectID, in.Report, in.Expectation)
	if err != nil {
		return nil, detectOutput{}, err
	}
	return nil, detectOutput{Diverged: div != nil, Divergence: div}, nil
}

// ── ingest_divergence ──

type ingestOutput struct {
	Diverged bool                               `json:"diverged"`
	Draft    *realityingest.DraftFromDivergence `json:"draft,omitempty"`
}

func ingestDivergence(_ context.Context, _ *mcp.CallToolRequest, in detectInput) (*mcp.CallToolResult, ingestOutput, error) {
	draft, err := realityingest.Ingest(in.ProjectID, in.Report, in.Expectation)
	if err != nil {
		return nil, ingestOutput{}, err
	}
	return nil, ingestOutput{Diverged: draft != nil, Draft: draft}, nil
}

// ── render_idea_text ──

type renderInput struct {
	Divergence realityingest.Divergence `json:"divergence" jsonschema:"a divergence record (from detect_divergence) to project into the idea text"`
}

type renderOutput struct {
	Text string `json:"text"`
}

func renderIdeaText(_ context.Context, _ *mcp.CallToolRequest, in renderInput) (*mcp.CallToolResult, renderOutput, error) {
	return nil, renderOutput{Text: realityingest.RenderIdeaText(in.Divergence)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-reality-ingest", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "detect_divergence", Description: "S106/E12: compare a project's prod telemetry report against a mirror's expectation; return the project-scoped divergence record (error_rate | latency), or diverged=false when prod is within the mirror's promise. PURE deterministic comparison (no LLM), writes nothing (the wall)."}, detectDivergence)
	mcp.AddTool(srv, &mcp.Tool{Name: "ingest_divergence", Description: "S106/E12: the whole external loop — detect a divergence, reflect it as a project-scoped RealityMirror (provenance=incident), and project it into a DRAFT idea whose Intent is the deterministic TEMPLATE text. Returns diverged=false on a healthy app. WroteKernel always false; the direct Reality→Kernel edge is always refused. PURE, deterministic."}, ingestDivergence)
	mcp.AddTool(srv, &mcp.Tool{Name: "render_idea_text", Description: "S106/E12: render the DRAFT idea text from a divergence record — a deterministic TEMPLATE projection (same record → byte-identical text), never an LLM summary (ROADMAP §S106). PURE."}, renderIdeaText)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("reality-ingest: run: %w", err))
	}
}
