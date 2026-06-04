// runtosignal.go — BA30: the RunToSignal GATEWAY tool wired into the agentloop MCP server
// (gap I1/I2; ADR 0009 — one tool = one backend op). It exposes a deterministic, READ-ONLY
// classification of the recorded AgentRuns into reality.Signals: a failed/abandoned/blocked run,
// or a GREEN run of abnormal shape (thrashing / determinism gap), maps to a signal carrying the
// incident_derived taint; an ordinary green run yields no signal. The signal's identity is
// content-addressed on the PATTERN (gap I2), so two distinct runs of the same failure mode
// collapse into one recurring incident id.
//
// READ-ONLY VIEW, DETERMINISTIC (§6). This server holds no DB: it derives its runs from the same
// DECLARED scenarios the ledger uses (the model-free shell), and pairs each with the PURE
// agentloop.RunToSignal engine (the AUTHORITY) + reality.Observe to expose the recurring incident
// id. THE WALL: no truth is written — the cause sketch is a HYPOTHESIS, the signal is reality, and
// the gateway proves it by re-asserting that reality.ToKernel still REFUSES the incident.
package main

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/reality"
)

// ── Tool I/O ──

type runToSignalInput struct {
	Agent  string `json:"agent,omitempty" jsonschema:"optional filter: only runs by this CoucheAgent @version"`
	Goal   string `json:"goal,omitempty" jsonschema:"optional filter: only runs serving this /goal"`
	Result string `json:"result,omitempty" jsonschema:"optional filter: terminal result (green|still_red|blocked|abandoned)"`
	// ThrashRefusals is the declared knob: a GREEN run with this many wall-refusals is flagged
	// hollow. 0 ⇒ use the canonical DefaultThresholds.
	ThrashRefusals int `json:"thrash_refusals,omitempty" jsonschema:"declared knob: green-run refusal count flagged as hollow (0 = default)"`
}

// signalEntry is one classified run: the pattern, severity, the reality.Signal, the recurring
// INCIDENT ID it collapses to (identity-by-pattern), and the kernel refusal proving no truth.
type signalEntry struct {
	RunID         string `json:"run_id"`
	Goal          string `json:"goal"`
	Result        string `json:"result"`
	Signalled     bool   `json:"signalled"` // false for an ordinary green run
	Class         string `json:"class"`
	Pattern       string `json:"pattern"`
	Severity      string `json:"severity"`
	Operation     string `json:"operation"`      // reality.Signal.Operation (pattern-derived)
	ErrorObs      string `json:"error"`          // reality.Signal.Error (pattern-derived)
	CauseSketch   string `json:"cause_sketch"`   // HYPOTHESIS, never a truth
	Provenance    string `json:"provenance"`     // human-facing "agent run R failed on goal G"
	IncidentID    string `json:"incident_id"`    // the recurring incident id (collapses by pattern)
	KernelRefusal string `json:"kernel_refusal"` // the BlockReason code reality.ToKernel returns
}

type runToSignalOutput struct {
	Entries []signalEntry `json:"entries"`
	// PatternRecurrence counts how many of the reported runs share each incident id — the
	// identity-by-pattern proof: distinct runs of the same mode collapse to one id, so the count
	// exceeds 1 (Recurrence climbs).
	PatternRecurrence map[string]int `json:"pattern_recurrence"`
	// WroteTruth is ALWAYS false — the gateway proposes a signal, it declares no truth (the wall).
	WroteTruth bool `json:"wrote_truth"`
}

// signalScenarios are the DECLARED runs that exercise the gateway's signal-producing classes
// (the ledger scenarios are all green/blocked). Two distinct still_red runs (different goals)
// share the SAME wall-thrash pattern — the identity-by-pattern demonstration: they collapse into
// ONE recurring incident id (PatternRecurrence > 1). Pure, total, no DB, no clock.
func signalScenarios() []agentrun.AgentRun {
	mk := func(goalID, item string, actions []agentrun.AgentAction, res agentrun.Result) agentrun.AgentRun {
		r, _ := agentrun.Record(agentrun.AgentRun{
			Agent: "builder@v1", Goal: goalID, RedWorkItem: item, ContextPack: "pack-" + goalID,
			Actions: actions, Result: res,
			StartedAt: "2026-06-04T19:00:00Z", EndedAt: "2026-06-04T19:05:00Z",
		})
		return r
	}
	refused := func(code blockreason.Code, target string) agentrun.AgentAction {
		br := blockreason.For(code)
		return agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target, Autorisee: false, RaisonBlocage: &br}
	}
	wallThrash := func(goalID string) agentrun.AgentRun {
		return mk(goalID, "redset:"+goalID, []agentrun.AgentAction{
			refused(blockreason.CodeAgentWriteAboveWaterline, "kernel.operation"),
		}, agentrun.ResultStillRed)
	}
	return []agentrun.AgentRun{
		// TWO distinct still_red runs sharing the wall-thrash pattern → ONE recurring incident.
		wallThrash("g-sig-a"),
		wallThrash("g-sig-b"),
		// an abandoned run (budget breach) → a distinct high-severity pattern.
		mk("g-sig-budget", "redset:budget", nil, agentrun.ResultAbandoned),
		// a GREEN run surfacing a determinism gap → a low-severity hollow-green signal (gap I1).
		mk("g-sig-detgap", "redset:detgap", []agentrun.AgentAction{
			refused(blockreason.CodeAgentDeterminismGap, "back/gen/x.go"),
		}, agentrun.ResultGreen),
	}
}

// runToSignal is the capability: derive the recorded runs (the shared ledger scenarios), classify
// each via the PURE agentloop.RunToSignal engine (the authority), and — for each signal — feed
// reality.Observe to expose the recurring incident id and reality.ToKernel to prove the refusal.
// Read-only; writes no truth.
func (s *server) runToSignal(_ context.Context, _ *mcp.CallToolRequest, in runToSignalInput) (*mcp.CallToolResult, runToSignalOutput, error) {
	th := agentloop.DefaultThresholds()
	if in.ThrashRefusals > 0 {
		th.ThrashRefusals = in.ThrashRefusals
	}

	runs := append(ledgerRuns(), signalScenarios()...)
	matches := func(r agentrun.AgentRun) bool {
		if in.Agent != "" && r.Agent != in.Agent {
			return false
		}
		if in.Goal != "" && r.Goal != in.Goal {
			return false
		}
		if in.Result != "" && string(r.Result) != in.Result {
			return false
		}
		return true
	}

	entries := make([]signalEntry, 0, len(runs))
	recurrence := map[string]int{}
	for _, r := range runs {
		if !matches(r) {
			continue
		}
		ps, ok := agentloop.RunToSignal(r, th)
		e := signalEntry{RunID: r.ID, Goal: r.Goal, Result: string(r.Result), Signalled: ok}
		if ok {
			inc, _ := reality.Observe(ps.ToObserveInput())
			refusal := reality.ToKernel(inc)
			e.Class = string(ps.Class)
			e.Pattern = ps.Pattern
			e.Severity = string(ps.Severity)
			e.Operation = ps.Signal.Operation
			e.ErrorObs = ps.Signal.Error
			e.CauseSketch = ps.CauseSketch
			e.Provenance = ps.Provenance
			e.IncidentID = inc.ID
			if refusal != nil {
				e.KernelRefusal = string(refusal.Code)
			}
			recurrence[inc.ID]++
		}
		entries = append(entries, e)
	}
	return nil, runToSignalOutput{
		Entries:           entries,
		PatternRecurrence: recurrence,
		WroteTruth:        false,
	}, nil
}
