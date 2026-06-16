// Command reality-ingest is the AIDOS S106 REALITY-INGEST MCP server (ROADMAP-app-builder
// §S106, EPIC 12 / E12; ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S106 (back/runtime/realityingest): the EXTERNAL loop that
// turns a DEPLOYED emitted app's production OpenTelemetry DIVERGENCE — read by the
// telemetry-reader (S43/E12) — into a project-scoped RealityMirror (provenance=incident) and a
// DRAFT idea whose text is a DETERMINISTIC TEMPLATE projection (never an LLM summary):
//
//	detect_divergence — compare a telemetry report against a mirror's expectation.
//	ingest_divergence — the whole loop: detect → RealityMirror → DRAFT idea (provenance=incident).
//	render_idea_text  — the template projection over a divergence (same record → same text).
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY on the kernel — every tool returns a VALUE
// whose WroteKernel is false; the only outward edge is a DRAFT idea (idea → mirror → /goal →
// approval). The direct Reality→Kernel edge is ALWAYS refused (REALITY_CANNOT_DECLARE_TRUTH).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. Same input → identical output (the S106 reproducibility
// mirror). Transport: stdio.
//
// The server itself lives in the realityingestsrv LIBRARY so the gateway dispatcher (S59,
// back/mcp/gateway) reuses the SAME server in-process — no duplicated logic, no twin. The S106
// runtime is pure functions, so NewServer takes no deps; main only wires it to stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/mcp/reality-ingest/realityingestsrv"
)

func main() {
	ctx := context.Background()
	srv := realityingestsrv.NewServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("reality-ingest: run: %w", err))
	}
}
