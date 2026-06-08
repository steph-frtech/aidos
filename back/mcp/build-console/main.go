// Command build-console is the AIDOS Workbench build-console MCP server (S86; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S86 build-console projection + the per-project
// stable-phase recording gate (back/runtime/buildconsole): the live console of the
// app-builder — the diff streamed per attempt, the sensor results, the HarnessCostBudget
// consumption (S51), the circuit-breaker (S83) state, the AgentRun timeline (S52), and the
// human approval gate (S85) — PLUS `aidos stable`'s per-project node recording at the
// S23/S40 verdict.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the console state /
// the stable-phase node as VALUES and writes NOTHING. The console is a FAITHFUL projection
// of records that already exist; recording a DAG node rides the privileged `aidos` writer
// via the S24 dag store — never the agent, never from here. An inconsistent cut is REFUSED
// (STABLE_PHASE_INCONSISTENT_CUT) — no node is born from a red mirror (KRD §43).
//
// Tools (one tool = one backend op):
//
//	buildconsole_project              — project the streamed console state from a recorded
//	                                    AgentRun + history + loop decision + cost + pending
//	buildconsole_record_stable_phase  — compute the §43 verdict for a project's cut → record
//	                                    the per-project DAG node (stable) or refuse (unstable)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): both tools are PURE functions of their input — no
// clock, no rng, no I/O, no LLM. The console state is a transform (never "summarise the
// build"); the stable verdict is phases.IsStable (the single engine). The reproducibility
// mirror (buildconsole_property_test.go + lib/build-console.test.ts) pins it. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/buildconsole"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// ── buildconsole_project ──

type writeIn struct {
	DiffHash   string `json:"diff_hash" jsonschema:"content-hash of the diff written this attempt (empty = no write)"`
	Authorised bool   `json:"authorised" jsonschema:"the wall verdict on the write: true = below the line + applied"`
}

type projectInput struct {
	RunID          string    `json:"run_id" jsonschema:"the recorded AgentRun id (S52) the console projects"`
	Goal           string    `json:"goal" jsonschema:"the /goal the run served"`
	Result         string    `json:"result" jsonschema:"the run's closed result: green|still_red|blocked|abandoned"`
	Writes         []writeIn `json:"writes,omitempty" jsonschema:"the run's recorded write actions, in turn order"`
	DiffHashes     []string  `json:"diff_hashes,omitempty" jsonschema:"the per-turn diff hashes from the loop history"`
	GreenMirrors   []string  `json:"green_mirrors,omitempty" jsonschema:"the latest turn's green mirror refs"`
	Verdict        string    `json:"verdict,omitempty" jsonschema:"the loop's closed verdict: continue|green|no_progress"`
	MaxCIMinutes   int       `json:"max_ci_minutes,omitempty" jsonschema:"declared CI minutes cap (0 = no cap)"`
	MaxLLMTokens   int       `json:"max_llm_tokens_per_goal,omitempty" jsonschema:"declared LLM tokens/goal cap (0 = no cap)"`
	SpentCIMinutes int       `json:"spent_ci_minutes,omitempty" jsonschema:"measured CI minutes consumed"`
	SpentLLMTokens int       `json:"spent_llm_tokens,omitempty" jsonschema:"measured LLM tokens consumed"`
	OverBudgetAxes []string  `json:"over_budget_axes,omitempty" jsonschema:"axes the breaker flagged over budget"`
	Pending        []string  `json:"pending,omitempty" jsonschema:"proposal ids awaiting human approval (S85 BuildInbox)"`
}

type attemptOut struct {
	Index      int    `json:"index"`
	DiffHash   string `json:"diff_hash"`
	Authorised bool   `json:"authorised"`
}
type sensorOut struct {
	ID    string `json:"id"`
	Green bool   `json:"green"`
}
type projectOutput struct {
	RunID          string       `json:"run_id"`
	Goal           string       `json:"goal"`
	Result         string       `json:"result"`
	Attempts       []attemptOut `json:"attempts,omitempty"`
	Sensors        []sensorOut  `json:"sensors,omitempty"`
	CiSpent        int          `json:"ci_minutes_spent"`
	CiCap          int          `json:"ci_minutes_cap"`
	TokensSpent    int          `json:"llm_tokens_spent"`
	TokensCap      int          `json:"llm_tokens_cap"`
	OverBudgetAxes []string     `json:"over_budget_axes,omitempty"`
	Verdict        string       `json:"verdict"`
	BreakerTripped bool         `json:"breaker_tripped"`
	PendingCount   int          `json:"approval_pending_count"`
	PendingIDs     []string     `json:"approval_pending_ids,omitempty"`
	// FaithfulProjection is the non-gameable check: the projected state EQUALS the recorded run.
	FaithfulProjection bool `json:"faithful_projection"`
}

func projectState(_ context.Context, _ *mcp.CallToolRequest, in projectInput) (*mcp.CallToolResult, projectOutput, error) {
	// Reconstruct a recorded AgentRun shape so the projection + faithfulness check run against
	// the same actions the caller declared. The run is content-addressed by agentrun.Record.
	actions := []agentrun.AgentAction{}
	for _, w := range in.Writes {
		actions = append(actions, agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: "sandbox", Autorisee: w.Authorised})
	}
	run := agentrun.AgentRun{ID: in.RunID, Goal: in.Goal, Result: agentrun.Result(in.Result), Actions: actions}

	var hist buildloop.History
	for i, d := range in.DiffHashes {
		var greens []string
		if i == len(in.DiffHashes)-1 {
			greens = in.GreenMirrors
		}
		hist = append(hist, buildloop.Iteration{DiffHash: d, GreenMirrors: greens})
	}

	st := buildconsole.Project(buildconsole.Input{
		Run:      run,
		History:  hist,
		Decision: buildloop.Decision{Verdict: buildloop.Verdict(in.Verdict), OverBudgetAxes: in.OverBudgetAxes},
		Budget:   economics.HarnessCostBudget{MaxCIMinutes: in.MaxCIMinutes, MaxLLMTokensPerGoal: in.MaxLLMTokens},
		Cost:     economics.MeasuredCost{CIMinutes: in.SpentCIMinutes, LLMTokens: in.SpentLLMTokens},
		Pending:  in.Pending,
	})

	out := projectOutput{
		RunID: st.RunID, Goal: st.Goal, Result: string(st.Result),
		CiSpent: st.Cost.CiMinutesSpent, CiCap: st.Cost.CiMinutesCap,
		TokensSpent: st.Cost.LlmTokensSpent, TokensCap: st.Cost.LlmTokensCap,
		OverBudgetAxes: st.Cost.OverBudgetAxes,
		Verdict:        string(st.Breaker.Verdict), BreakerTripped: st.Breaker.Tripped,
		PendingCount: st.Approval.PendingCount, PendingIDs: st.Approval.PendingIDs,
		FaithfulProjection: buildconsole.StateEqualsRun(st, run),
	}
	for _, a := range st.Attempts {
		out.Attempts = append(out.Attempts, attemptOut{Index: a.Index, DiffHash: a.DiffHash, Authorised: a.Authorised})
	}
	for _, s := range st.Sensors {
		out.Sensors = append(out.Sensors, sensorOut{ID: s.ID, Green: s.Green})
	}
	return nil, out, nil
}

// ── buildconsole_record_stable_phase ──

type linkIn struct {
	FromID string `json:"from_id" jsonschema:"the dependant ref id"`
	FromV  string `json:"from_version" jsonschema:"the dependant ref version"`
	ToID   string `json:"to_id" jsonschema:"the dependency ref id"`
	ToV    string `json:"to_version" jsonschema:"the dependency ref version (off-head ⇒ stale)"`
}
type sensorIn struct {
	ID   string `json:"id" jsonschema:"the sensor/mirror id"`
	Pass bool   `json:"pass" jsonschema:"true = green; a red sensor makes the cut unstable"`
}
type recordStableInput struct {
	ProjectSlug string            `json:"project_slug" jsonschema:"the project whose frontier the node would join"`
	Cut         map[string]string `json:"cut,omitempty" jsonschema:"the §43 cut: constraintId → version"`
	Heads       map[string]string `json:"heads,omitempty" jsonschema:"the current heads: id → version"`
	Links       []linkIn          `json:"links,omitempty" jsonschema:"the links in the cut (resolved against heads)"`
	Sensors     []sensorIn        `json:"sensors,omitempty" jsonschema:"the sensor snapshot over the cut"`
	Label       string            `json:"label,omitempty" jsonschema:"the human line name of the recorded phase"`
}
type recordStableOutput struct {
	Stable      bool     `json:"stable"`
	Recorded    bool     `json:"recorded"`
	NodeID      string   `json:"node_id,omitempty"`
	ParentIDs   []string `json:"parent_ids,omitempty"`
	Reasons     []string `json:"reasons,omitempty"`
	BlockCode   string   `json:"block_code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func recordStablePhase(_ context.Context, _ *mcp.CallToolRequest, in recordStableInput) (*mcp.CallToolResult, recordStableOutput, error) {
	p, err := project.New(in.ProjectSlug, in.ProjectSlug, "console", "2026-06-08T00:00:00Z")
	if err != nil {
		return nil, recordStableOutput{}, fmt.Errorf("build-console: invalid project slug: %w", err)
	}
	pd := projectdag.Genesis(p)

	heads := links.Heads{}
	for k, v := range in.Heads {
		heads[k] = v
	}
	var ls []links.Link
	for _, l := range in.Links {
		ls = append(ls, links.Link{Kind: links.KindBinds, From: links.Ref{ID: l.FromID, Version: l.FromV}, To: links.Ref{ID: l.ToID, Version: l.ToV}})
	}
	var ss []phases.SensorStatus
	for _, s := range in.Sensors {
		ss = append(ss, phases.SensorStatus{ID: s.ID, Pass: s.Pass})
	}
	cut := phases.Cut{}
	for k, v := range in.Cut {
		cut[k] = v
	}

	res := buildconsole.RecordStablePhase(buildconsole.StablePhaseRequest{
		Project: pd, Cut: cut, Heads: heads, Links: ls, Sensors: ss, Label: in.Label,
	})

	out := recordStableOutput{
		Stable: res.Phase.Stable, Recorded: res.Recorded,
		Reasons: res.Phase.Reasons,
	}
	if res.Recorded {
		out.NodeID = res.Node.ID
		out.ParentIDs = res.Node.ParentIDs
	}
	if res.BlockReason != nil {
		out.BlockCode = string(res.BlockReason.Code)
		out.Explanation = res.BlockReason.Explanation
		out.HowToFix = res.BlockReason.HowToFix
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-build-console", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "buildconsole_project", Description: "S86: project the live build-console state from a recorded AgentRun (S52) + the loop history + the termination decision (S83) + the HarnessCostBudget consumption (S51) + the approval inbox (S85). The state is a FAITHFUL projection (faithful_projection asserts it EQUALS the recorded run); writes nothing (the wall)."}, projectState)
	mcp.AddTool(srv, &mcp.Tool{Name: "buildconsole_record_stable_phase", Description: "S86: compute the §43 coherent-cut verdict (phases.IsStable) for a project's cut and, ONLY when stable, return the per-project DAG node to record (its id is the phase content-address; its parents are the project's heads). An inconsistent cut is REFUSED with STABLE_PHASE_INCONSISTENT_CUT — no node from a red mirror. Returns values; the privileged aidos writer commits the node."}, recordStablePhase)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("build-console: run: %w", err))
	}
}
