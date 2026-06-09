// Command reality-evolution is the AIDOS S109 per-project COCKPIT MCP server
// (ROADMAP-app-builder §S109, EPIC 12 / E12; ADR 0009: every backend op is an MCP tool).
//
// S109 invents NO new mechanic — it is the COCKPIT capability door that COMPOSES the three
// already-built engines into one project-scoped surface:
//
//	close_reality   — the canonical §S109 journey in one call: INGEST a deployed app's telemetry
//	                  divergence (S106, realityingest.Ingest) → APPROVE the human's new mirror
//	                  (S107, learn.Close: bump the operation hash + seed a targeted red wave) →
//	                  return the worklist with red_wave_appeared. A healthy report yields no
//	                  divergence (nothing ingested, nothing learned).
//	cockpit_elites  — the per-project QD niches (S108, projectevolve.Niches): one GREEN élite per
//	                  niche of an ALREADY-frozen truth; the mirror-breaker is NEVER an élite.
//	promote_elite   — the authority-gated promotion (S108, projectevolve.Promote): a PROPOSAL with
//	                  authority (writes_truth=false), refused without it or for a red/oos-red variant.
//
// THE WALL (CLAUDE.md §2): this server is READ-ONLY on the kernel — every tool returns a VALUE
// whose WroteKernel / WritesTruth is false; the human authors the approved mirror and freezes a
// promotion at /goal, and the direct Reality→Kernel edge is ALWAYS refused
// (REALITY_CANNOT_DECLARE_TRUTH). Nothing learns its own fitness — the `fitness` schema is never named.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE composition of the engines' pure
// functions — no clock, no rng, no I/O, never an LLM. Same input → identical output (the S109
// reproducibility mirror). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/archive/projectevolve"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/realityingest"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// ── close_reality: the canonical S109 cockpit journey ──

type closeRealityInput struct {
	ProjectID   string                          `json:"project_id" jsonschema:"the project this telemetry belongs to (multi-tenant scope, S55)"`
	Report      realityingest.TelemetryReport   `json:"report" jsonschema:"the deployed app's per-operation telemetry aggregate (operation, calls, errors, p99_ms)"`
	Expectation realityingest.MirrorExpectation `json:"expectation" jsonschema:"the mirror's production promise the report is compared against (deterministic detection)"`
	Mirror      learn.ApprovedMirror            `json:"mirror" jsonschema:"the human-approved NEW mirror (the /goal outcome over this incident): mirror_id + the reflected target ref"`
	Target      learn.Target                    `json:"target" jsonschema:"the operation/policy target at its current head the approved mirror bumps"`
	Edges       []redwave.Edge                  `json:"edges" jsonschema:"the target's link edges (S17) the bump propagates over to seed the red wave"`
	Heads       links.Heads                     `json:"heads" jsonschema:"the head versions AFTER the bump (so the stale edges resolve and go red)"`
}

type closeRealityOutput struct {
	// Diverged is false when prod is within the mirror's promise (no incident, no learning).
	Diverged bool `json:"diverged"`
	// Draft is the S106 ingested incident (RealityMirror + draft idea, provenance=incident). Nil when healthy.
	Draft *realityingest.DraftFromDivergence `json:"draft,omitempty"`
	// Learn is the S107 loop-closure (bump + targeted red wave + the wall verdict). Nil when healthy.
	Learn *learn.Outcome `json:"learn,omitempty"`
	// RedWaveCount is the worklist size — the red wave that appeared (§S109 done-criterion).
	RedWaveCount int `json:"red_wave_count"`
	// RedWaveAppeared is the single boolean the done-criterion reads ("voir le red wave apparaître").
	RedWaveAppeared bool `json:"red_wave_appeared"`
	// WroteKernel is ALWAYS false — the cockpit writes no truth (the anti-circularity guarantee).
	WroteKernel bool `json:"wrote_kernel"`
}

// closeReality runs the WHOLE per-project journey deterministically: ingest (S106) → if a
// divergence is found, close the loop over the human-approved mirror (S107) → return the worklist.
// A healthy app yields Diverged=false (nothing ingested, nothing learned). Pure composition.
func closeReality(_ context.Context, _ *mcp.CallToolRequest, in closeRealityInput) (*mcp.CallToolResult, closeRealityOutput, error) {
	draft, err := realityingest.Ingest(in.ProjectID, in.Report, in.Expectation)
	if err != nil {
		return nil, closeRealityOutput{}, err
	}
	if draft == nil {
		return nil, closeRealityOutput{Diverged: false, WroteKernel: false}, nil
	}
	// The human's /goal approved the NEW mirror over this incident; the loop attaches it. The
	// incident is the S43 reality.Incident the divergence was observed as (deterministic, S106).
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: draft.Divergence.ID,
		Signal: reality.Signal{
			Operation:  draft.Divergence.Operation,
			Error:      draft.Idea.Intent,
			Recurrence: 1,
		},
		CauseSketch: "production diverged from the mirror's promise; the kernel is incomplete by omission",
		Taint:       []firewall.Taint{firewall.TaintIncidentDerived},
	})
	if err != nil {
		return nil, closeRealityOutput{}, err
	}
	out, err := learn.Close(inc, in.Mirror, in.Target, in.Edges, in.Heads)
	if err != nil {
		return nil, closeRealityOutput{}, err
	}
	count := len(out.Wave.Items)
	return nil, closeRealityOutput{
		Diverged:        true,
		Draft:           draft,
		Learn:           &out,
		RedWaveCount:    count,
		RedWaveAppeared: count > 0,
		WroteKernel:     false,
	}, nil
}

// ── cockpit_elites: the per-project QD niches (S108) ──

type elitesInput struct {
	Mirror   projectevolve.FixedMirror `json:"mirror" jsonschema:"the project's FIXED mirror — the frozen truth the variants compete to implement better"`
	Variants []projectevolve.Variant   `json:"variants" jsonschema:"the candidate variants the medium loop produced (some green survivors, some mirror-breakers)"`
}

type eliteRow struct {
	Niche       string  `json:"niche"`
	VariantID   string  `json:"variant_id"`
	Fitness     float64 `json:"fitness"`
	Mirror      string  `json:"mirror"`
	OutOfSample string  `json:"out_of_sample"`
}

type elitesOutput struct {
	Elites []eliteRow `json:"elites"`
}

// cockpitElites projects the QD niches (projectevolve.Niches) into per-niche élite rows — one
// green élite per project-scoped niche; the mirror-breaker is NEVER among them (anti-Goodhart).
func cockpitElites(_ context.Context, _ *mcp.CallToolRequest, in elitesInput) (*mcp.CallToolResult, elitesOutput, error) {
	m := projectevolve.Niches(in.Mirror, in.Variants)
	rows := make([]eliteRow, 0, len(m))
	for key, v := range m {
		niche := key
		if i := indexSep(key); i >= 0 {
			niche = key[i+2:]
		}
		rows = append(rows, eliteRow{
			Niche:       niche,
			VariantID:   v.ID,
			Fitness:     v.Fitness,
			Mirror:      string(v.Mirror),
			OutOfSample: string(v.OutOfSample),
		})
	}
	sortRows(rows)
	return nil, elitesOutput{Elites: rows}, nil
}

// ── promote_elite: the authority-gated promotion (S108) ──

type promoteInput struct {
	Mirror            projectevolve.FixedMirror `json:"mirror" jsonschema:"the project's fixed mirror the variant must reflect"`
	Variant           projectevolve.Variant     `json:"variant" jsonschema:"the élite variant to promote"`
	AuthorityApproved bool                      `json:"authority_approved" jsonschema:"whether the authority approved (the human freeze at /goal — required for a PROPOSAL)"`
}

type promoteOutput struct {
	Result projectevolve.PromotionResult `json:"result"`
}

// promoteElite runs the authority-gated promotion (projectevolve.Promote): a PROPOSAL with
// authority (writes_truth=false), refused without it / for a red / out-of-sample-red / foreign variant.
func promoteElite(_ context.Context, _ *mcp.CallToolRequest, in promoteInput) (*mcp.CallToolResult, promoteOutput, error) {
	return nil, promoteOutput{Result: projectevolve.Promote(in.Mirror, in.Variant, in.AuthorityApproved)}, nil
}

// indexSep returns the index of the "::" project-niche separator, or -1.
func indexSep(s string) int {
	for i := 0; i+1 < len(s); i++ {
		if s[i] == ':' && s[i+1] == ':' {
			return i
		}
	}
	return -1
}

// sortRows orders élite rows by niche for a byte-stable render (the determinism guarantee).
func sortRows(rows []eliteRow) {
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && rows[j-1].Niche > rows[j].Niche; j-- {
			rows[j-1], rows[j] = rows[j], rows[j-1]
		}
	}
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-reality-evolution", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "close_reality", Description: "S109/E12: the per-project cockpit journey in one call — INGEST a telemetry divergence (S106) → APPROVE the human's new mirror (S107: bump the operation hash + seed a TARGETED red wave) → return the worklist with red_wave_appeared. A healthy report yields diverged=false. WroteKernel always false; the human authors the mirror at /goal. PURE composition, deterministic, no LLM."}, closeReality)
	mcp.AddTool(srv, &mcp.Tool{Name: "cockpit_elites", Description: "S109/E12: the per-project QD niches (S108) — one GREEN élite per project-scoped niche of an ALREADY-frozen truth; the mirror-breaker is NEVER an élite whatever its fitness (anti-Goodhart). PURE, deterministic (byte-stable order)."}, cockpitElites)
	mcp.AddTool(srv, &mcp.Tool{Name: "promote_elite", Description: "S109/E12: the authority-gated promotion of a QD élite (S108) — a PROPOSAL with authority (writes_truth=false), refused without it or for a red / out-of-sample-red / foreign-project variant. The AI proposes, the human freezes at /goal. PURE, deterministic."}, promoteElite)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("reality-evolution: run: %w", err))
	}
}
