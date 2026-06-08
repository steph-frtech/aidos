// Command grilling-loop is the AIDOS Runtime grilling-loop MCP server (S65; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S65 in-product grilling loop
// (back/runtime/grillingloop): a human grills an INTENTION (prose intent + ≤ 5
// candidate scenarios) and routes it on the closed three-value /grill verdict
// (sharp → grilled ; fuzzy → spiking ; bad → rejected, traced). The routing is
// DETERMINISTIC and AUTHORITATIVE; the LLM is the barricaded exception for the
// dialogue only, and a verdict it suggests is re-verified against the closed verdict
// schema before it can route anything.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the routed
// VerdictRecord as VALUES and writes NOTHING. Persistence of the routed `ideas` row
// rides the idea-intake MCP (idea_capture then idea_grill/idea_spike/idea_reject),
// the aidos role on the `ideas` schema; this server never touches a DB and never
// touches the kernel/mirrors/fitness. There is deliberately no promote-to-kernel
// tool: promotion is the /goal flow.
//
// Tools (one tool = one backend op):
//
//	grill_route          — validate an intention (≤ 5 scenarios) + route it on a verdict → VerdictRecord
//	grill_verify_verdict — re-verify an LLM-suggested verdict string against the closed schema
//	grill_verdicts       — read the closed three-value verdict set (sharp|fuzzy|bad)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input —
// no clock, no rng, no I/O. Same input → same output (the reproducibility mirrors
// grillingloop_property_test.go + lib/grilling-loop.test.ts pin it). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
	"github.com/steph-frtech/aidos/back/runtime/grillingloop"
)

// ── Tool I/O types ──

type routeInput struct {
	Proposes  string   `json:"proposes" jsonschema:"the layer/kind the intention would become: control|policy|operation|action|entity|product"`
	Intent    string   `json:"intent" jsonschema:"the sketched behaviour in prose (the human utterance)"`
	Scenarios []string `json:"scenarios,omitempty" jsonschema:"the ≤ 5 candidate scenarios sketched for this intention (a sixth is refused)"`
	Verdict   string   `json:"verdict" jsonschema:"the closed three-value /grill verdict: sharp | fuzzy | bad"`
	Detail    string   `json:"detail,omitempty" jsonschema:"the human utterance verbatim recorded as provenance; empty falls back to the intent"`
	Reason    string   `json:"reason,omitempty" jsonschema:"the traced rejection reason (used only for the bad verdict)"`
}

type routeOutput struct {
	ID       string `json:"id"`
	Proposes string `json:"proposes"`
	Intent   string `json:"intent"`
	Source   string `json:"source"`
	Detail   string `json:"detail"`
	// Status is the routed lifecycle lane: grilled | spiking | rejected.
	Status string `json:"status"`
	// Verdict is the verdict that routed the idea (recorded, never invented).
	Verdict string `json:"verdict"`
	// Reason is the traced rejection reason — non-empty only for the bad verdict.
	Reason string `json:"reason,omitempty"`
}

type verifyInput struct {
	Raw string `json:"raw" jsonschema:"the RAW verdict string a dialogue model produced, re-verified against the closed schema"`
}
type verifyOutput struct {
	// OK is true iff Raw validates against the closed verdict schema.
	OK bool `json:"ok"`
	// Verdict is the typed verdict — non-empty only when OK.
	Verdict string `json:"verdict,omitempty"`
}

type verdictsOutput struct {
	Verdicts []string `json:"verdicts"`
}

func toRouteOutput(rec grillingloop.VerdictRecord) routeOutput {
	return routeOutput{
		ID:       rec.Idea.ID,
		Proposes: string(rec.Idea.Proposes),
		Intent:   rec.Idea.Intent,
		Source:   string(rec.Idea.Provenance.Source),
		Detail:   rec.Idea.Provenance.Detail,
		Status:   string(rec.Idea.Status),
		Verdict:  string(rec.Verdict),
		Reason:   rec.Reason,
	}
}

// route is the grill_route tool: it validates the intention and routes it on the
// verdict via the pure grillingloop.Route. It writes NOTHING; persistence rides the
// idea-intake door (the wall). An invalid intention or an off-schema verdict is an
// error, never a coerced routing.
func route(_ context.Context, _ *mcp.CallToolRequest, in routeInput) (*mcp.CallToolResult, routeOutput, error) {
	intention := grillingloop.Intention{Intent: in.Intent, Scenarios: in.Scenarios}
	rec, err := grillingloop.Route(ideas.Proposes(in.Proposes), intention, exploration.GrillVerdict(in.Verdict), in.Detail, in.Reason)
	if err != nil {
		return nil, routeOutput{}, err
	}
	return nil, toRouteOutput(rec), nil
}

// verify is the grill_verify_verdict tool: the re-verification gate for the
// barricaded LLM exception. A model-suggested verdict is accepted ONLY if it
// validates against the closed schema; an off-schema suggestion returns ok=false,
// never a coerced nearest-match. PURE.
func verify(_ context.Context, _ *mcp.CallToolRequest, in verifyInput) (*mcp.CallToolResult, verifyOutput, error) {
	v, err := grillingloop.VerifyLLMVerdict(in.Raw)
	if err != nil {
		return nil, verifyOutput{OK: false}, nil
	}
	return nil, verifyOutput{OK: true, Verdict: string(v)}, nil
}

// verdicts is the grill_verdicts tool: the closed three-value verdict set, in
// canonical order. The Workbench picker renders exactly these.
func verdicts(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, verdictsOutput, error) {
	vs := exploration.Verdicts()
	out := verdictsOutput{Verdicts: make([]string, len(vs))}
	for i, v := range vs {
		out.Verdicts[i] = string(v)
	}
	return nil, out, nil
}

// newMCPServer builds the MCP server and registers the three grilling-loop tools.
// There is deliberately NO persistence tool: the routed idea is persisted via the
// idea-intake door; this server is pure computation (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-grilling-loop", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "grill_route", Description: "S65: validate an intention (≤ 5 scenarios) + route it on the closed /grill verdict (sharp→grilled, fuzzy→spiking, bad→rejected/traced) → VerdictRecord. Deterministic, authoritative; writes nothing (the wall)."}, route)
	mcp.AddTool(srv, &mcp.Tool{Name: "grill_verify_verdict", Description: "S65: re-verify an LLM-suggested verdict string against the closed verdict schema (the barricaded LLM exception). ok=false for any off-schema verdict; never coerced."}, verify)
	mcp.AddTool(srv, &mcp.Tool{Name: "grill_verdicts", Description: "S65: read the closed three-value verdict set (sharp|fuzzy|bad), in canonical order."}, verdicts)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("grilling-loop: run: %w", err))
	}
}
