// ledger_property_test.go — the BA29 reproducibility + invariant mirror (∀), determinism-first
// (CLAUDE.md §6/§8). These rapid properties pin the effect-log reconciliation + the ledger query:
//
//   - RECONCILE REPRODUCIBLE: identical (run, effects) ⇒ identical Reconciliation, twice (no
//     clock, no rng, no I/O).
//   - QUERY REPRODUCIBLE: identical (runs, effects, filter) ⇒ identical Ledger, twice.
//   - FAITHFUL ⇒ RECONCILED: a run whose boundary effect-log is EXACTLY its allowed writes
//     reconciles with zero drift (the fidelity definition).
//   - EXTRA EFFECT ⇒ DRIFT: adding ONE unrecorded boundary effect ALWAYS breaks reconciliation
//     (the gap-H2 betrayal is never silently absorbed).
//   - REFUSED WRITES ARE NEVER EXPECTED: a run made only of refused (above-waterline) writes
//     reconciles cleanly against an empty effect-log (the wall stopped them before any effect).
//   - AUDITABLE ⇒ RECONCILED: an auditable entry is always reconciled (auditable = replay ∧
//     reconciled, so it can never be true while drifting).
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"pgregory.net/rapid"
)

// genAllowedWriteRun draws a run with N allowed below-the-line writes to distinct targets.
func genAllowedWriteRun(t *rapid.T) (agentrun.AgentRun, []string) {
	n := rapid.IntRange(0, 4).Draw(t, "n-writes")
	targets := make([]string, 0, n)
	actions := make([]agentrun.AgentAction, 0, n)
	for i := 0; i < n; i++ {
		tg := "back/gen/" + rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "target") + ".go"
		targets = append(targets, tg)
		actions = append(actions, agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: tg, Autorisee: true})
	}
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent: "a@v1", Goal: "g", RedWorkItem: "r", ContextPack: "p",
		Actions: actions, Result: agentrun.ResultGreen,
		StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:05:00Z",
	})
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	return run, targets
}

// effectsFor builds the faithful boundary effect-log for a run's allowed writes.
func effectsFor(run agentrun.AgentRun, targets []string) []Effect {
	out := make([]Effect, 0, len(targets))
	for _, tg := range targets {
		out = append(out, Effect{Run: run.ID, Kind: EffectFSWrite, Target: tg})
	}
	return out
}

func TestProp_ReconcileReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run, targets := genAllowedWriteRun(t)
		eff := effectsFor(run, targets)
		if !reflect.DeepEqual(Reconcile(run, eff), Reconcile(run, eff)) {
			t.Fatalf("Reconcile must be reproducible")
		}
	})
}

func TestProp_QueryReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run, targets := genAllowedWriteRun(t)
		eff := effectsFor(run, targets)
		a := QueryLedger([]agentrun.AgentRun{run}, eff, LedgerFilter{})
		b := QueryLedger([]agentrun.AgentRun{run}, eff, LedgerFilter{})
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("QueryLedger must be reproducible")
		}
	})
}

func TestProp_FaithfulReconciles(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run, targets := genAllowedWriteRun(t)
		rec := Reconcile(run, effectsFor(run, targets))
		if !rec.Reconciled {
			t.Fatalf("a faithful run must reconcile, got drifts %+v", rec.Drifts)
		}
	})
}

func TestProp_ExtraEffectAlwaysDrifts(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run, targets := genAllowedWriteRun(t)
		eff := effectsFor(run, targets)
		// add ONE unrecorded effect to a unique target.
		eff = append(eff, Effect{Run: run.ID, Kind: EffectFSWrite, Target: "/tmp/unrecorded-x"})
		rec := Reconcile(run, eff)
		if rec.Reconciled {
			t.Fatalf("an extra unrecorded effect must always break reconciliation")
		}
	})
}

func TestProp_RefusedWritesNeverExpectEffect(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(1, 4).Draw(t, "n-refused")
		actions := make([]agentrun.AgentAction, 0, n)
		for i := 0; i < n; i++ {
			a := agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: "kernel.operation"}, agentlayer.AgentSpec{})
			actions = append(actions, a)
		}
		run, err := agentrun.Record(agentrun.AgentRun{
			Agent: "a@v1", Goal: "g", RedWorkItem: "r", ContextPack: "p",
			Actions: actions, Result: agentrun.ResultBlocked,
			StartedAt: "2026-06-04T18:00:00Z", EndedAt: "2026-06-04T18:05:00Z",
		})
		if err != nil {
			t.Fatalf("Record: %v", err)
		}
		// refused writes never reach the boundary → clean reconciliation against an empty log.
		if !Reconcile(run, nil).Reconciled {
			t.Fatalf("refused writes must expect no effect")
		}
	})
}

func TestProp_AuditableImpliesReconciled(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		run, targets := genAllowedWriteRun(t)
		// random subset of the faithful effects (may under- or exactly-cover).
		full := effectsFor(run, targets)
		eff := make([]Effect, 0, len(full))
		for _, e := range full {
			if rapid.Bool().Draw(t, "keep") {
				eff = append(eff, e)
			}
		}
		led := QueryLedger([]agentrun.AgentRun{run}, eff, LedgerFilter{})
		for _, entry := range led.Entries {
			if entry.Auditable && !entry.Reconciliation.Reconciled {
				t.Fatalf("auditable entry must be reconciled")
			}
		}
	})
}
