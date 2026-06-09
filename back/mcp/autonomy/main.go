// Command autonomy is the AIDOS Kernel autonomy MCP server (FK10; ADR 0009: every backend op
// is an MCP tool).
//
// It is the capability door over FK10 (back/kernel/autonomy): the closed A0..A8 autonomy
// ladder, its FAIL-CLOSED enforcement and its PURE promotion-from-history. Two pure,
// write-nothing tools:
//
//	enforce — a declared autonomy level + an attempted action (name, required level, critical)
//	          → a Decision (allowed, or refused with the S13 BlockReason
//	          AGENT_AUTONOMY_EXCEEDED). Required > declared is REFUSED; A8 never governs a
//	          critical action (capped at A7, human escalation).
//	promote — a current level + an AgentRun history (per-run: green, evidence E0..E7, incident)
//	          + the promotion bar (N green E4+ no-incident runs) → the PROMOTED level (current+1
//	          IFF the window is all green at E≥floor with no incident, never past A8). The level
//	          is COMPUTED from the record, never declared (§8 anti-Goodhart).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS a declared level
// + a run history and returns a verdict / a proposed level — freezing a promotion goes idea →
// mirror → /goal → human decision. DETERMINISM-FIRST (§8): both tools are PURE — no clock, no
// rng, no LLM (the promotion is a function of the history, never a second agent's judgment).
// Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/autonomy"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
)

// ── enforce ──

type enforceIn struct {
	Declared int    `json:"declared" jsonschema:"the agent's declared autonomy level 0..8 (A0..A8)"`
	Action   string `json:"action" jsonschema:"the action name (e.g. merge, read, deploy)"`
	Required int    `json:"required" jsonschema:"the minimum autonomy level the action needs (0..8)"`
	Critical bool   `json:"critical" jsonschema:"is the action critical (a merge / deploy / irreversible truth write)?"`
}

type enforceOut struct {
	OK          bool     `json:"ok"`
	Allowed     bool     `json:"allowed"`
	Declared    string   `json:"declared"`
	Required    string   `json:"required"`
	Critical    bool     `json:"critical"`
	Code        string   `json:"code,omitempty"`
	Severity    string   `json:"severity,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func enforce(_ context.Context, _ *mcp.CallToolRequest, in enforceIn) (*mcp.CallToolResult, enforceOut, error) {
	declared := autonomy.Level(in.Declared)
	action := autonomy.Action{Name: in.Action, Required: autonomy.Level(in.Required), Critical: in.Critical}
	dec := autonomy.Enforce(declared, action)
	out := enforceOut{
		OK:       true,
		Allowed:  dec.Allowed,
		Declared: declared.String(),
		Required: action.Required.String(),
		Critical: in.Critical,
	}
	if dec.BlockReason != nil {
		out.Code = string(dec.BlockReason.Code)
		out.Severity = string(dec.BlockReason.Severity)
		out.Explanation = dec.BlockReason.Explanation
		out.HowToFix = dec.BlockReason.HowToFix
	}
	return nil, out, nil
}

// ── promote ──

type runIn struct {
	Green    bool `json:"green" jsonschema:"did the run end green (result == green)?"`
	Evidence int  `json:"evidence" jsonschema:"the evidence level the run reached (0..7, E0..E7)"`
	Incident bool `json:"incident" jsonschema:"was an incident recorded against the run?"`
}

type promoteIn struct {
	Current      int     `json:"current" jsonschema:"the current autonomy level 0..8 (A0..A8)"`
	History      []runIn `json:"history" jsonschema:"the AgentRun history, oldest→newest"`
	MinGreenRuns int     `json:"min_green_runs,omitempty" jsonschema:"N consecutive green runs required (default 3)"`
	MinEvidence  int     `json:"min_evidence,omitempty" jsonschema:"the evidence floor 0..7 (default 4 = E4)"`
}

type promoteOut struct {
	OK         bool   `json:"ok"`
	Current    string `json:"current"`
	Promoted   string `json:"promoted"`
	Earned     bool   `json:"earned"`
	WindowN    int    `json:"window_n"`
	MinEv      string `json:"min_evidence"`
	HistoryLen int    `json:"history_len"`
}

func promote(_ context.Context, _ *mcp.CallToolRequest, in promoteIn) (*mcp.CallToolResult, promoteOut, error) {
	policy := autonomy.DefaultPolicy
	if in.MinGreenRuns > 0 {
		policy.MinGreenRuns = in.MinGreenRuns
	}
	if in.MinEvidence > 0 {
		policy.MinEvidence = prooftype.ELevel(in.MinEvidence)
	}
	current := autonomy.Level(in.Current)
	history := make([]autonomy.RunOutcome, 0, len(in.History))
	for _, r := range in.History {
		history = append(history, autonomy.RunOutcome{
			Green: r.Green, Evidence: prooftype.ELevel(r.Evidence), Incident: r.Incident,
		})
	}
	promoted := autonomy.PromotionFromHistory(current, history, policy)
	return nil, promoteOut{
		OK:         true,
		Current:    current.String(),
		Promoted:   promoted.String(),
		Earned:     promoted > current,
		WindowN:    policy.MinGreenRuns,
		MinEv:      policy.MinEvidence.Name(),
		HistoryLen: len(history),
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-autonomy", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "enforce",
		Description: "FK10 (autonomy enforcement): a declared autonomy level A0..A8 + an attempted action (name, required level, critical) → a fail-closed Decision. required > declared is REFUSED with AGENT_AUTONOMY_EXCEEDED; a critical action never admits A8 (capped at A7, human escalation). PURE; writes nothing (the wall).",
	}, enforce)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "promote",
		Description: "FK10 (promotion-from-history): a current level + an AgentRun history (green, evidence E0..E7, incident, oldest→newest) + the bar (N green E4+ no-incident runs) → the PROMOTED level (current+1 IFF the window is all green at E≥floor with no incident, never past A8). The level is COMPUTED from the record, never declared (§8). PURE; writes nothing — freezing a promotion goes idea → mirror → /goal.",
	}, promote)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("autonomy: run: %w", err))
	}
}
