package agentloop_test

// BA29 LEDGER + EFFECT-LOG FIXTURE MIRROR (workflow N2: runs + boundary effects → reconcile +
// ledger query). reflects = runtime ledger fidelity-to-reality (gap H2) · test_kind = fixture ·
// liveness = live.
//
//	Given a recorded AgentRun and an INDEPENDENT boundary effect-log,
//	When  the ledger reconciles the effects against the recorded actions,
//	Then  a faithful run reconciles cleanly (every effect recorded, every write realised) and is
//	      AUDITABLE (replay re-derives ∧ effects reconcile); an UNRECORDED boundary effect (a bash
//	      side-effect the loop never wrote down) is surfaced as drift and the run is NOT auditable;
//	      and the ledger query tallies wall refusals by their S13 BlockReason code.
//
// The wall holds: the ledger is a READ-ONLY derivation (no truth written). Determinism-first:
// reconciliation is a set-diff, the refusal count a tally — code, never an LLM judgment.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// a below-the-line write that the wall ALLOWS (a gen/ projection path).
func allowedWrite(target string) agentrun.AgentAction {
	return agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target, Autorisee: true}
}

// a write the wall REFUSED above the waterline, carrying the S13 BlockReason.
func refusedWrite(target string) agentrun.AgentAction {
	spec := agentlayer.AgentSpec{}
	return agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target}, spec)
}

func recordRun(t *testing.T, r agentrun.AgentRun) agentrun.AgentRun {
	t.Helper()
	rec, err := agentrun.Record(r)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	return rec
}

// Fixture 1 — a FAITHFUL run reconciles cleanly and is AUDITABLE. Every recorded allowed write
// has a matching boundary fs_write; the run also re-derives (BA28). reconciled ∧ replayMatches ⇒
// auditable.
func TestLedger_FaithfulRunIsAuditable(t *testing.T) {
	run := recordRun(t, agentrun.AgentRun{
		Agent:       "bdd-writer@v1",
		Goal:        "g-checkout",
		RedWorkItem: "redset:checkout.mirror",
		ContextPack: "pack-checkout",
		Actions: []agentrun.AgentAction{
			allowedWrite("back/gen/checkout.go"),
			{Type: agentrun.ActionRead, Cible: "KRD.md", Autorisee: true},
		},
		Result:    agentrun.ResultGreen,
		StartedAt: "2026-06-04T18:00:00Z",
		EndedAt:   "2026-06-04T18:05:00Z",
	})

	// the boundary saw EXACTLY the one write the run recorded.
	effects := []agentloop.Effect{
		{Run: run.ID, Kind: agentloop.EffectFSWrite, Target: "back/gen/checkout.go"},
	}

	rec := agentloop.Reconcile(run, effects)
	if !rec.Reconciled {
		t.Fatalf("a faithful run must reconcile cleanly, got drifts %+v", rec.Drifts)
	}

	led := agentloop.QueryLedger([]agentrun.AgentRun{run}, effects, agentloop.LedgerFilter{})
	if len(led.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(led.Entries))
	}
	e := led.Entries[0]
	if !e.ReplayMatches {
		t.Fatalf("a faithfully recorded run must re-derive (replay)")
	}
	if !e.Auditable {
		t.Fatalf("replay ∧ reconciled ⇒ auditable; got auditable=%v", e.Auditable)
	}
}

// Fixture 2 — an UNRECORDED boundary effect (the gap-H2 betrayal). The boundary saw a SECOND
// write the run never recorded (a bash side-effect). Hash-equality still holds (the record
// re-derives), but reconciliation surfaces the unrecorded effect as drift and the run is NOT
// auditable — proving fidelity needs the effect-log, not just replay.
func TestLedger_UnrecordedEffectBreaksFidelity(t *testing.T) {
	run := recordRun(t, agentrun.AgentRun{
		Agent:       "bdd-writer@v1",
		Goal:        "g-checkout",
		RedWorkItem: "redset:checkout.mirror",
		ContextPack: "pack-checkout",
		Actions: []agentrun.AgentAction{
			allowedWrite("back/gen/checkout.go"),
		},
		Result:    agentrun.ResultGreen,
		StartedAt: "2026-06-04T18:10:00Z",
		EndedAt:   "2026-06-04T18:15:00Z",
	})

	effects := []agentloop.Effect{
		{Run: run.ID, Kind: agentloop.EffectFSWrite, Target: "back/gen/checkout.go"},
		// the BETRAYAL: a write the boundary saw but the run never recorded.
		{Run: run.ID, Kind: agentloop.EffectFSWrite, Target: "/tmp/secret-exfil.sh"},
	}

	// the record STILL re-derives — replay alone would miss the breach.
	if !agentrun.ReplayMatches(run) {
		t.Fatalf("the record itself is consistent; replay must still match")
	}

	rec := agentloop.Reconcile(run, effects)
	if rec.Reconciled {
		t.Fatalf("an unrecorded boundary effect MUST break reconciliation")
	}
	found := false
	for _, d := range rec.Drifts {
		if d.Kind == agentloop.DriftUnrecordedEffect && d.Target == "/tmp/secret-exfil.sh" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the unrecorded effect must be surfaced as drift, got %+v", rec.Drifts)
	}

	led := agentloop.QueryLedger([]agentrun.AgentRun{run}, effects, agentloop.LedgerFilter{})
	if led.Entries[0].Auditable {
		t.Fatalf("a run with an unrecorded effect is NOT auditable (replay alone is not enough)")
	}
}

// Fixture 3 — an UNREALISED action (a claimed write the boundary never saw). The run recorded an
// allowed write but no boundary effect matches it → unrealised_action drift.
func TestLedger_UnrealisedActionIsDrift(t *testing.T) {
	run := recordRun(t, agentrun.AgentRun{
		Agent:       "bdd-writer@v1",
		Goal:        "g-checkout",
		RedWorkItem: "redset:checkout.mirror",
		ContextPack: "pack-checkout",
		Actions: []agentrun.AgentAction{
			allowedWrite("back/gen/never-written.go"),
		},
		Result:    agentrun.ResultStillRed,
		StartedAt: "2026-06-04T18:20:00Z",
		EndedAt:   "2026-06-04T18:25:00Z",
	})

	rec := agentloop.Reconcile(run, nil) // boundary saw NOTHING
	if rec.Reconciled {
		t.Fatalf("a recorded write with no boundary effect must be drift")
	}
	if rec.Drifts[0].Kind != agentloop.DriftUnrealisedAction {
		t.Fatalf("expected unrealised_action, got %s", rec.Drifts[0].Kind)
	}
}

// Fixture 4 — a REFUSED write expects NO boundary effect (it never reached the boundary), and the
// ledger tallies it by its S13 BlockReason code. A run that only attempted an above-waterline
// write reconciles cleanly (the wall stopped it before any effect) yet shows a refusal count.
func TestLedger_RefusedWriteCountedNotExpected(t *testing.T) {
	refused := refusedWrite("kernel.operation") // above the waterline → AGENT_WRITE_ABOVE_WATERLINE
	if refused.Autorisee {
		t.Fatalf("precondition: an above-waterline write must be refused by the wall")
	}
	run := recordRun(t, agentrun.AgentRun{
		Agent:       "bdd-writer@v1",
		Goal:        "g-checkout",
		RedWorkItem: "redset:checkout.mirror",
		ContextPack: "pack-checkout",
		Actions:     []agentrun.AgentAction{refused},
		Result:      agentrun.ResultBlocked,
		StartedAt:   "2026-06-04T18:30:00Z",
		EndedAt:     "2026-06-04T18:31:00Z",
	})

	// no boundary effect — the refused write never reached the FS. Reconciliation is clean.
	rec := agentloop.Reconcile(run, nil)
	if !rec.Reconciled {
		t.Fatalf("a refused write expects NO effect; reconciliation must be clean, got %+v", rec.Drifts)
	}

	led := agentloop.QueryLedger([]agentrun.AgentRun{run}, nil, agentloop.LedgerFilter{})
	if led.TotalRefusals[blockreason.CodeAgentWriteAboveWaterline] != 1 {
		t.Fatalf("the ledger must tally the AGENT_WRITE_ABOVE_WATERLINE refusal, got %+v", led.TotalRefusals)
	}
}

// Fixture 5 — the filter narrows the query deterministically (by goal), and entries come back in
// stable StartedAt order.
func TestLedger_FilterAndStableOrder(t *testing.T) {
	a := recordRun(t, agentrun.AgentRun{
		Agent: "a@v1", Goal: "g-1", RedWorkItem: "r1", ContextPack: "p1",
		Result: agentrun.ResultGreen, StartedAt: "2026-06-04T20:00:00Z", EndedAt: "2026-06-04T20:01:00Z",
	})
	b := recordRun(t, agentrun.AgentRun{
		Agent: "b@v1", Goal: "g-2", RedWorkItem: "r2", ContextPack: "p2",
		Result: agentrun.ResultGreen, StartedAt: "2026-06-04T19:00:00Z", EndedAt: "2026-06-04T19:01:00Z",
	})
	c := recordRun(t, agentrun.AgentRun{
		Agent: "c@v1", Goal: "g-1", RedWorkItem: "r3", ContextPack: "p3",
		Result: agentrun.ResultGreen, StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:01:00Z",
	})

	led := agentloop.QueryLedger([]agentrun.AgentRun{a, b, c}, nil, agentloop.LedgerFilter{Goal: "g-1"})
	if len(led.Entries) != 2 {
		t.Fatalf("filter goal=g-1 should match 2 runs, got %d", len(led.Entries))
	}
	// stable StartedAt order: c (18:00) before a (20:00).
	if led.Entries[0].Run.ID != c.ID || led.Entries[1].Run.ID != a.ID {
		t.Fatalf("entries must be ordered by StartedAt; got %s then %s", led.Entries[0].Run.ID, led.Entries[1].Run.ID)
	}
}
