// ledger.go — BA29: the fidelity-to-reality LEDGER tool wired into the existing agentloop MCP
// server (gap H2; ADR 0009 — one tool = one backend op). It exposes a deterministic, READ-ONLY
// query over recorded AgentRuns joined with the INDEPENDENT boundary effect-log, reconciling
// each run's recorded actions against what the harness boundary actually witnessed.
//
// WHY (gap H2). BA28's Replay proves a run RE-DERIVES (hash-equality) — but that only proves the
// RECORD is internally consistent, NOT that the REAL run matched it. A bash side-effect the loop
// never recorded does not move the recorded hash, yet betrays fidelity. The ledger RECONCILES
// the boundary effect-log against the recorded actions: a run is AUDITABLE iff it both re-derives
// (replay) AND reconciles (effects). "replay-equality + réconciliation-effets ensemble =
// auditable."
//
// READ-ONLY VIEW, DETERMINISTIC (§6, the same posture as drive/watch). This server holds no DB:
// it derives its runs from the DECLARED scenarios (the model-free SHELL) and pairs each with a
// DECLARED boundary effect-log fixture, so the ledger is reproducible byte-for-byte. The pure
// agentloop.QueryLedger engine is the AUTHORITY; the tool only feeds it data + renders the result.
// THE WALL: no truth is written (the ledger observes; a fidelity breach is an observation).
package main

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── Tool I/O ──

type ledgerInput struct {
	Agent  string `json:"agent,omitempty" jsonschema:"optional filter: only runs by this CoucheAgent @version"`
	Goal   string `json:"goal,omitempty" jsonschema:"optional filter: only runs serving this /goal"`
	Result string `json:"result,omitempty" jsonschema:"optional filter: terminal result (green|still_red|blocked|abandoned)"`
}

type ledgerDrift struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
}

type ledgerEntry struct {
	RunID          string         `json:"run_id"`
	Agent          string         `json:"agent"`
	Goal           string         `json:"goal"`
	Result         string         `json:"result"`
	StartedAt      string         `json:"started_at"`
	EndedAt        string         `json:"ended_at"`
	ReplayMatches  bool           `json:"replay_matches"`
	Reconciled     bool           `json:"reconciled"`
	Drifts         []ledgerDrift  `json:"drifts"`
	Auditable      bool           `json:"auditable"`
	RefusalsByCode map[string]int `json:"refusals_by_code"`
}

type ledgerOutput struct {
	Entries       []ledgerEntry  `json:"entries"`
	TotalRefusals map[string]int `json:"total_refusals"`
	// WroteTruth is ALWAYS false — the ledger is a read-only derivation (the wall).
	WroteTruth bool `json:"wrote_truth"`
}

// codeCounts renders a map[blockreason.Code]int as a plain JSON map[string]int (stable shape).
func codeCounts(in map[blockreason.Code]int) map[string]int {
	out := make(map[string]int, len(in))
	for c, n := range in {
		out[string(c)] = n
	}
	return out
}

// ledgerRuns derives the recorded AgentRuns the ledger reports over, from the DECLARED scenarios
// (deterministic, model-free). Each scenario is recorded once via agentrun.Record so the runs
// carry stable content-addressed ids. Pure, total, no DB, no clock (timestamps supplied).
func ledgerRuns() []agentrun.AgentRun {
	mk := func(agent, goalID, item string, actions []agentrun.AgentAction, res agentrun.Result, start, end string) agentrun.AgentRun {
		r, _ := agentrun.Record(agentrun.AgentRun{
			Agent: agent, Goal: goalID, RedWorkItem: item, ContextPack: "pack-" + goalID,
			Actions: actions, Result: res, StartedAt: start, EndedAt: end,
		})
		return r
	}
	allowedWrite := func(t string) agentrun.AgentAction {
		return agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: t, Autorisee: true}
	}
	refused := func(t string) agentrun.AgentAction {
		br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
		return agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: t, Autorisee: false, RaisonBlocage: &br}
	}
	return []agentrun.AgentRun{
		// a FAITHFUL run: one allowed below-the-line write, witnessed at the boundary → auditable.
		mk("bdd-writer@v1", "g-checkout", "redset:checkout.mirror",
			[]agentrun.AgentAction{allowedWrite("back/gen/checkout.go")},
			agentrun.ResultGreen, "2026-06-04T18:00:00Z", "2026-06-04T18:05:00Z"),
		// a REFUSED-write run: an above-waterline write the wall stopped → counted, reconciles clean.
		mk("bdd-writer@v1", "g-checkout", "redset:checkout.kernel",
			[]agentrun.AgentAction{refused("kernel.operation")},
			agentrun.ResultBlocked, "2026-06-04T18:10:00Z", "2026-06-04T18:11:00Z"),
		// a BETRAYED run: it recorded one write but the boundary saw a SECOND, unrecorded one.
		mk("evolver@v1", "g-evolve", "redset:evolve.mirror",
			[]agentrun.AgentAction{allowedWrite("back/gen/evolve.go")},
			agentrun.ResultGreen, "2026-06-04T18:20:00Z", "2026-06-04T18:25:00Z"),
	}
}

// ledgerEffects is the DECLARED boundary effect-log fixture, attributed by run id. It pairs the
// faithful run with exactly its write, gives the refused run NOTHING (the write never reached the
// boundary), and gives the betrayed run an EXTRA unrecorded effect (the gap-H2 fidelity breach).
func ledgerEffects(runs []agentrun.AgentRun) []agentloop.Effect {
	var effects []agentloop.Effect
	for _, r := range runs {
		switch r.Goal {
		case "g-checkout":
			if len(r.Actions) > 0 && r.Actions[0].Autorisee {
				effects = append(effects, agentloop.Effect{Run: r.ID, Kind: agentloop.EffectFSWrite, Target: r.Actions[0].Cible})
			}
		case "g-evolve":
			effects = append(effects,
				agentloop.Effect{Run: r.ID, Kind: agentloop.EffectFSWrite, Target: "back/gen/evolve.go"},
				// the BETRAYAL: a write the boundary saw but the run never recorded.
				agentloop.Effect{Run: r.ID, Kind: agentloop.EffectFSWrite, Target: "/tmp/exfil.sh"},
			)
		}
	}
	return effects
}

// ledger is the capability: derive the recorded runs + the boundary effect-log, reconcile via the
// PURE agentloop.QueryLedger engine (the authority), and render the ledger. Read-only; writes no
// truth.
func (s *server) ledger(_ context.Context, _ *mcp.CallToolRequest, in ledgerInput) (*mcp.CallToolResult, ledgerOutput, error) {
	runs := ledgerRuns()
	effects := ledgerEffects(runs)
	led := agentloop.QueryLedger(runs, effects, agentloop.LedgerFilter{
		Agent:  in.Agent,
		Goal:   in.Goal,
		Result: agentrun.Result(in.Result),
	})

	entries := make([]ledgerEntry, len(led.Entries))
	for i, e := range led.Entries {
		drifts := make([]ledgerDrift, len(e.Reconciliation.Drifts))
		for j, d := range e.Reconciliation.Drifts {
			drifts[j] = ledgerDrift{Kind: string(d.Kind), Target: d.Target}
		}
		entries[i] = ledgerEntry{
			RunID:          e.Run.ID,
			Agent:          e.Run.Agent,
			Goal:           e.Run.Goal,
			Result:         string(e.Run.Result),
			StartedAt:      e.Run.StartedAt,
			EndedAt:        e.Run.EndedAt,
			ReplayMatches:  e.ReplayMatches,
			Reconciled:     e.Reconciliation.Reconciled,
			Drifts:         drifts,
			Auditable:      e.Auditable,
			RefusalsByCode: codeCounts(e.RefusalsByCode),
		}
	}
	return nil, ledgerOutput{
		Entries:       entries,
		TotalRefusals: codeCounts(led.TotalRefusals),
		WroteTruth:    false,
	}, nil
}
