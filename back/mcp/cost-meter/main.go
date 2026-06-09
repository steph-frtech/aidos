// Command cost-meter is the AIDOS Runtime COST-METER MCP server (S111; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over the S111 per-cell harness COST METER
// (back/runtime/costmeter): each cell DECLARES a HarnessCostBudget
// (max_ci_minutes/max_llm_tokens_per_goal/max_mutation_runtime/max_human_review_minutes/
// expected_risk_reduction); the meter AGGREGATES the consumption of the cell's REAL recorded
// AgentRuns (S52) — a COUNT, never an estimate — and feeds it to economics.Evaluate (the
// §66.3 advisory) and to the S83 disjoncteur (the circuit-breaker over-budget signal). A
// costly cell WITHOUT a justified ValueCase is FLAGGED (advisory), never silently blocked
// (« plus une contrainte coûte cher, plus elle doit justifier sa valeur »).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION over the DECLARED, above-the-line
// budget (the agent is SELECT-only on the fitness zone). It WRITES NOTHING — no kernel, no
// mirrors, no fitness. A flagged cell is an advisory; raising a cap is a /goal, never an edit.
//
// Tools (one tool = one backend op):
//
//	cost_meter_cell        — meter a cell from its real AgentRuns → CellMeter + §66.3 verdict
//	cost_disjoncteur_signal — project the metered verdict onto the S83 circuit-breaker signal
//	cost_validate_budget   — validate the DECLARED HarnessCostBudget shape (read, never authored)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the cost
// is COUNTED, the verdict is the deterministic economics.Evaluate switch, never an LLM. Same
// input → same verdict. The reproducibility mirrors (costmeter_property_test.go +
// lib/cost-meter.test.ts) pin it. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/costmeter"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// ── shared input shapes ──

type budgetIn struct {
	CellRef                  string `json:"cell_ref" jsonschema:"the cell the budget is declared for (per-cell, KRD §66.3)"`
	MaxCIMinutes             int    `json:"max_ci_minutes" jsonschema:"declared cap on CI minutes (non-negative)"`
	MaxLLMTokensPerGoal      int    `json:"max_llm_tokens_per_goal" jsonschema:"declared cap on LLM tokens per goal (non-negative)"`
	MaxMutationRuntimeSecond int    `json:"max_mutation_runtime_seconds" jsonschema:"declared cap on mutation runtime in seconds (non-negative)"`
	MaxHumanReviewMinutes    int    `json:"max_human_review_minutes" jsonschema:"declared cap on human-review minutes (non-negative)"`
	ExpectedRiskReduction    string `json:"expected_risk_reduction" jsonschema:"the declared risk the budget buys down: low|medium|high|critical"`
}

type runCostIn struct {
	RedWorkItem string `json:"red_work_item" jsonschema:"the red set item the run worked (content-addresses the run)"`
	Tokens      int    `json:"tokens" jsonschema:"the LLM tokens this run consumed (the RunMeter token tally, BA11)"`
	CIMinutes   int    `json:"ci_minutes" jsonschema:"the CI minutes this run consumed"`
}

type valueCaseIn struct {
	Truth          string `json:"truth" jsonschema:"the costly truth ref the value case justifies"`
	RiskIfBroken   string `json:"risk_if_broken" jsonschema:"low|medium|high|critical"`
	ExpectedImpact string `json:"expected_impact,omitempty" jsonschema:"human-authored free text (data, never a judgment)"`
	Decision       string `json:"decision" jsonschema:"justified|too_expensive|revisit — only justified clears the flag"`
}

// ── output shapes ──

type meterOut struct {
	CellRef     string   `json:"cell_ref"`
	RunCount    int      `json:"run_count"`
	Tokens      int      `json:"metered_tokens"`        // the COUNTED sum, never an estimate
	CIMinutes   int      `json:"metered_ci_minutes"`    // the COUNTED sum
	Verdict     string   `json:"verdict"`               // within_budget|over_budget_justified|over_budget_flagged
	OverAxes    []string `json:"over_axes,omitempty"`   // the caps exceeded (ubiquitous language)
	Flagged     bool     `json:"flagged"`               // advisory raised? (== over_budget_flagged)
	BlockCode   string   `json:"block_code,omitempty"`  // HARNESS_COST_EXCEEDS_BUDGET when flagged
	Explanation string   `json:"explanation,omitempty"` // the §66.3 advisory text
	HowToFix    []string `json:"how_to_fix,omitempty"`  // open_value_case|reduce_harness_cost|raise_budget_via_goal
}

type signalOut struct {
	Trip        bool     `json:"trip"`                  // the S83 disjoncteur over-budget signal
	OverAxes    []string `json:"over_axes,omitempty"`   //
	BlockCode   string   `json:"block_code,omitempty"`  //
	Explanation string   `json:"explanation,omitempty"` //
	HowToFix    []string `json:"how_to_fix,omitempty"`  //
}

type validateOut struct {
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

// ── adapters ──

func toBudget(b budgetIn) economics.HarnessCostBudget {
	return economics.HarnessCostBudget{
		CellRef:                  b.CellRef,
		MaxCIMinutes:             b.MaxCIMinutes,
		MaxLLMTokensPerGoal:      b.MaxLLMTokensPerGoal,
		MaxMutationRuntimeSecond: b.MaxMutationRuntimeSecond,
		MaxHumanReviewMinutes:    b.MaxHumanReviewMinutes,
		ExpectedRiskReduction:    economics.Risk(b.ExpectedRiskReduction),
	}
}

// toRunCosts records each run (content-addressed, S52) paired with its RunMeter. The
// timestamps are FIXED so the flow stays a pure function (no arg-less clock, CLAUDE.md §6).
func toRunCosts(cellRef string, runs []runCostIn) []costmeter.RunCost {
	out := make([]costmeter.RunCost, 0, len(runs))
	for _, r := range runs {
		run, err := agentrun.Record(agentrun.AgentRun{
			Agent:       "build-agent@v1",
			Goal:        "goal-" + cellRef,
			RedWorkItem: r.RedWorkItem,
			ContextPack: "pack-" + cellRef,
			Result:      agentrun.ResultGreen,
			StartedAt:   "2026-06-09T10:00:00Z",
			EndedAt:     "2026-06-09T10:05:00Z",
		})
		if err != nil {
			// A malformed run is skipped with a zero contribution (the honesty rule — never
			// fabricate a cost). In practice Record only errors on an out-of-enum result.
			continue
		}
		out = append(out, costmeter.RunCost{
			Run:   run,
			Meter: agentimpl.RunMeter{Tokens: r.Tokens, CIMinutes: r.CIMinutes},
		})
	}
	return out
}

func toValueCase(vc *valueCaseIn) *economics.ValueCase {
	if vc == nil {
		return nil
	}
	return &economics.ValueCase{
		Truth:          vc.Truth,
		RiskIfBroken:   economics.Risk(vc.RiskIfBroken),
		ExpectedImpact: vc.ExpectedImpact,
		Decision:       economics.Decision(vc.Decision),
	}
}

func toMeterOut(cm costmeter.CellMeter, dec economics.EconomicsDecision) meterOut {
	out := meterOut{
		CellRef:   cm.CellRef,
		RunCount:  cm.RunCount,
		Tokens:    cm.Cost.LLMTokens,
		CIMinutes: cm.Cost.CIMinutes,
		Verdict:   string(dec.Verdict),
		OverAxes:  dec.OverAxes,
		Flagged:   costmeter.OverBudget(dec),
	}
	if dec.BlockReason != nil {
		out.BlockCode = string(dec.BlockReason.Code)
		out.Explanation = dec.BlockReason.Explanation
		out.HowToFix = dec.BlockReason.HowToFix
	}
	return out
}

// ── tools ──

type meterInput struct {
	Budget    budgetIn     `json:"budget"`
	Runs      []runCostIn  `json:"runs" jsonschema:"the cell's REAL recorded AgentRuns, each with its consumed cost"`
	ValueCase *valueCaseIn `json:"value_case,omitempty" jsonschema:"an OPTIONAL value case; decision=justified clears an over-budget flag (KRD §66.3)"`
}

func meterTool(_ context.Context, _ *mcp.CallToolRequest, in meterInput) (*mcp.CallToolResult, meterOut, error) {
	b := toBudget(in.Budget)
	cm, dec := costmeter.MeterCell(b, toRunCosts(b.CellRef, in.Runs), toValueCase(in.ValueCase))
	return nil, toMeterOut(cm, dec), nil
}

func signalTool(_ context.Context, _ *mcp.CallToolRequest, in meterInput) (*mcp.CallToolResult, signalOut, error) {
	b := toBudget(in.Budget)
	_, dec := costmeter.MeterCell(b, toRunCosts(b.CellRef, in.Runs), toValueCase(in.ValueCase))
	sig := costmeter.DisjoncteurSignal(dec)
	out := signalOut{Trip: sig.Trip, OverAxes: sig.OverAxes}
	if sig.BlockReason != nil {
		out.BlockCode = string(sig.BlockReason.Code)
		out.Explanation = sig.BlockReason.Explanation
		out.HowToFix = sig.BlockReason.HowToFix
	}
	return nil, out, nil
}

type validateInput struct {
	Budget budgetIn `json:"budget"`
}

func validateTool(_ context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOut, error) {
	if err := economics.ValidateBudget(toBudget(in.Budget)); err != nil {
		return nil, validateOut{Valid: false, Error: err.Error()}, nil
	}
	return nil, validateOut{Valid: true}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-cost-meter", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "cost_meter_cell", Description: "S111: meter a cell from its REAL recorded AgentRuns (S52) against its DECLARED HarnessCostBudget. The metered cost is the COUNTED sum of the runs' consumption (never an estimate); economics.Evaluate (the §66.3 judge) returns the verdict. A cell over a cap WITHOUT a justified value_case is FLAGGED with HARNESS_COST_EXCEEDS_BUDGET (advisory, never a silent block); a value_case{justified} earns its keep (over_budget_justified). Writes nothing (the wall)."}, meterTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "cost_disjoncteur_signal", Description: "S111→S83: project the metered §66.3 verdict onto the disjoncteur (circuit-breaker) over-budget signal. trip == (verdict == over_budget_flagged): a within-budget or justified cell does NOT trip the breaker. The signal carries the over-budget axes and the advisory BlockReason verbatim — never a fabricated trip. The build-loop composes it (OR no-progress) exactly as buildloop.Terminate does."}, signalTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "cost_validate_budget", Description: "S111: validate the shape of a DECLARED HarnessCostBudget — non-empty cell_ref, non-negative caps, expected_risk_reduction in {low,medium,high,critical}. This validates a bar the agent READS; it never authors it (the agent is SELECT-only on the fitness zone, §8)."}, validateTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("cost-meter: run: %w", err))
	}
}
