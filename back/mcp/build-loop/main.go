// Command build-loop is the AIDOS Runtime build-loop MCP server (S83; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S83 build-loop service + its DETERMINISTIC CIRCUIT
// BREAKER (back/runtime/buildloop): the executing agent of the app-builder that takes a red
// set → compiles a ContextPack (S33 algorithm) → calls the LLM → writes the sandbox (S82) →
// runs the affected mirrors → iterates red→green → records the AgentRun/AgentAction (S52),
// and STOPS HONESTLY the instant the non-gameable Stop passes OR a build that spends without
// advancing is detected (BUILD_LOOP_NO_PROGRESS), wired to the HarnessCostBudget (S51).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the termination
// Decision / no-progress verdict as VALUES and writes NOTHING. Persistence of the AgentRun
// rides the agentloop MCP (the below-the-line INSERT grant); the sandbox write rides the S82
// workspace; the kernel/mirrors/fitness are SELECT-only to the agent. There is deliberately
// NO truth-write tool — a truth proposed by the loop goes through propose→ChangeSet (S85).
//
// Tools (one tool = one backend op):
//
//	buildloop_terminate   — compute the non-gameable termination Decision over the run's
//	                        Stop input + iteration history + declared budget → green | no_progress | continue
//	buildloop_no_progress — compute the deterministic no-progress verdict over an iteration history
//	buildloop_verdicts    — read the closed three-value termination verdict set
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O. Termination is a FUNCTION OF THE HISTORY (same history → same halt), never
// an LLM judgment; the judge is the mirror verdict + the pure detector. The reproducibility
// mirrors (buildloop_property_test.go + lib/build-loop.test.ts) pin it. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// ── Tool I/O types (flat, JSON-schema-tagged for the picker) ──

type iterationIn struct {
	DiffHash     string   `json:"diff_hash" jsonschema:"content-hash of the diff the LLM produced this turn (a repeat = churn)"`
	GreenMirrors []string `json:"green_mirrors,omitempty" jsonschema:"the mirror refs green AFTER this turn's sensors ran"`
}

type terminateInput struct {
	GoalID string   `json:"goal_id" jsonschema:"the /goal id being driven"`
	RedSet []string `json:"red_set" jsonschema:"the ordered failing mirror refs that ARE the goal"`
	// Stop input — the live sensor verdicts + the non-gameable conditions.
	GreenSensors  []string `json:"green_sensors,omitempty" jsonschema:"red-set mirror refs currently GREEN (the rest are red)"`
	PriorBroken   bool     `json:"prior_broken,omitempty" jsonschema:"true iff a previously-green mirror went red (blocks the close)"`
	Mutation      float64  `json:"mutation,omitempty" jsonschema:"current mutation score 0..1"`
	MutationFloor float64  `json:"mutation_floor,omitempty" jsonschema:"declared mutation floor 0..1"`
	Monsters      []string `json:"monsters,omitempty" jsonschema:"monster findings (orphan mirror / mirror-less truth); any ⇒ block"`
	// History + policy — the breaker input.
	History          []iterationIn `json:"history,omitempty" jsonschema:"the iteration history so far (sole input to the no-progress breaker)"`
	MaxIterations    int           `json:"max_iterations,omitempty" jsonschema:"declared hard cap on loop turns (0 = no cap)"`
	StagnationWindow int           `json:"stagnation_window,omitempty" jsonschema:"consecutive zero-progress turns before the breaker trips (≥1 to arm)"`
	// Budget — the HarnessCostBudget wiring (S51).
	CellRef            string `json:"cell_ref,omitempty" jsonschema:"the cell the HarnessCostBudget is declared against"`
	MaxLLMTokens       int    `json:"max_llm_tokens_per_goal,omitempty" jsonschema:"declared LLM token cap per goal (0 = no cap)"`
	MaxCIMinutes       int    `json:"max_ci_minutes,omitempty" jsonschema:"declared CI minutes cap (0 = no cap)"`
	SpentLLMTokens     int    `json:"spent_llm_tokens,omitempty" jsonschema:"measured LLM tokens consumed so far (S52-derived count)"`
	SpentCIMinutes     int    `json:"spent_ci_minutes,omitempty" jsonschema:"measured CI minutes consumed so far"`
	ValueCaseJustified bool   `json:"value_case_justified,omitempty" jsonschema:"true iff a justified ValueCase clears an over-budget flag"`
}

type terminateOutput struct {
	Verdict        string   `json:"verdict"`                    // green | no_progress | continue
	BlockCode      string   `json:"block_code,omitempty"`       // BUILD_LOOP_NO_PROGRESS when halted
	Explanation    string   `json:"explanation,omitempty"`      // the BlockReason explanation
	HowToFix       []string `json:"how_to_fix,omitempty"`       // the actionable fix path
	OverBudgetAxes []string `json:"over_budget_axes,omitempty"` // budget axes that contributed to a budget halt
}

type noProgressInput struct {
	History          []iterationIn `json:"history,omitempty" jsonschema:"the iteration history (the sole input)"`
	MaxIterations    int           `json:"max_iterations,omitempty" jsonschema:"declared max-iteration cap (0 = no cap)"`
	StagnationWindow int           `json:"stagnation_window,omitempty" jsonschema:"consecutive zero-progress turns before tripping (≥1 to arm)"`
}
type noProgressOutput struct {
	NoProgress bool `json:"no_progress"`
}

type verdictsOutput struct {
	Verdicts []string `json:"verdicts"`
}

func toHistory(in []iterationIn) buildloop.History {
	h := make(buildloop.History, 0, len(in))
	for _, it := range in {
		h = append(h, buildloop.Iteration{DiffHash: it.DiffHash, GreenMirrors: it.GreenMirrors})
	}
	return h
}

// terminate is the buildloop_terminate tool: the non-gameable termination Decision. PURE.
func terminate(_ context.Context, _ *mcp.CallToolRequest, in terminateInput) (*mcp.CallToolResult, terminateOutput, error) {
	g := goal.Goal{ID: in.GoalID, RedSet: in.RedSet, Status: goal.StatusOpen}

	green := map[string]bool{}
	for _, m := range in.GreenSensors {
		green[m] = true
	}
	sensors := make(map[string]goal.SensorState, len(in.RedSet))
	for _, m := range in.RedSet {
		if green[m] {
			sensors[m] = goal.SensorGreen
		} else {
			sensors[m] = goal.SensorRed
		}
	}
	prior := goal.PriorIntact
	if in.PriorBroken {
		prior = goal.PriorBroken
	}
	stop := goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    prior,
		Mutation:      in.Mutation,
		MutationFloor: in.MutationFloor,
		Monsters:      in.Monsters,
	}

	var vc *economics.ValueCase
	if in.ValueCaseJustified {
		vc = &economics.ValueCase{Truth: in.GoalID, Decision: economics.DecisionJustified}
	}

	dec := buildloop.Terminate(buildloop.TerminationInput{
		Goal:    g,
		Stop:    stop,
		History: toHistory(in.History),
		Policy:  buildloop.Policy{MaxIterations: in.MaxIterations, StagnationWindow: in.StagnationWindow},
		Budget: economics.HarnessCostBudget{
			CellRef:             in.CellRef,
			MaxLLMTokensPerGoal: in.MaxLLMTokens,
			MaxCIMinutes:        in.MaxCIMinutes,
		},
		Cost:      economics.MeasuredCost{LLMTokens: in.SpentLLMTokens, CIMinutes: in.SpentCIMinutes},
		ValueCase: vc,
	})

	out := terminateOutput{Verdict: string(dec.Verdict), OverBudgetAxes: dec.OverBudgetAxes}
	if dec.BlockReason != nil {
		out.BlockCode = string(dec.BlockReason.Code)
		out.Explanation = dec.BlockReason.Explanation
		out.HowToFix = dec.BlockReason.HowToFix
	}
	return nil, out, nil
}

// noProgress is the buildloop_no_progress tool: the deterministic no-progress verdict. PURE.
func noProgress(_ context.Context, _ *mcp.CallToolRequest, in noProgressInput) (*mcp.CallToolResult, noProgressOutput, error) {
	stuck := buildloop.NoProgress(toHistory(in.History), buildloop.Policy{MaxIterations: in.MaxIterations, StagnationWindow: in.StagnationWindow})
	return nil, noProgressOutput{NoProgress: stuck}, nil
}

// verdicts is the buildloop_verdicts tool: the closed three-value termination verdict set.
func verdicts(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, verdictsOutput, error) {
	vs := buildloop.Verdicts()
	out := verdictsOutput{Verdicts: make([]string, len(vs))}
	for i, v := range vs {
		out.Verdicts[i] = string(v)
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-build-loop", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "buildloop_terminate", Description: "S83: compute the NON-GAMEABLE termination Decision over the run's Stop input + iteration history + declared HarnessCostBudget → green (only when the Stop passes) | no_progress (the deterministic breaker / over-budget) | continue. Pure function of the history; writes nothing (the wall)."}, terminate)
	mcp.AddTool(srv, &mcp.Tool{Name: "buildloop_no_progress", Description: "S83: compute the deterministic no-progress verdict over an iteration history (repeated diff-hash / red↔green oscillation / zero newly-green / max-iterations). Same history → same verdict; never an LLM judgment."}, noProgress)
	mcp.AddTool(srv, &mcp.Tool{Name: "buildloop_verdicts", Description: "S83: read the closed three-value termination verdict set (continue|green|no_progress), in canonical order."}, verdicts)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("build-loop: run: %w", err))
	}
}
