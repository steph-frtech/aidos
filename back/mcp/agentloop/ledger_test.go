// ledger_test.go — BA29: the agentloop_ledger MCP tool mirror. The ledger is READ-ONLY and
// DETERMINISTIC: same call ⇒ same ledger; it never writes truth; a faithful run is auditable, a
// betrayed run (an unrecorded boundary effect) is NOT auditable and surfaces the drift; refusals
// are tallied by their S13 BlockReason code.
package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

func callLedger(t *testing.T, in ledgerInput) ledgerOutput {
	t.Helper()
	_, out, err := newServer().ledger(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("ledger: %v", err)
	}
	return out
}

// the ledger writes no truth.
func TestLedger_WritesNoTruth(t *testing.T) {
	if callLedger(t, ledgerInput{}).WroteTruth {
		t.Fatalf("the ledger must write no truth (read-only surface)")
	}
}

// a faithful run is auditable (replay ∧ reconciled); a betrayed run is not, and surfaces the
// unrecorded-effect drift.
func TestLedger_AuditableVsBetrayed(t *testing.T) {
	out := callLedger(t, ledgerInput{})
	var faithful, betrayed *ledgerEntry
	for i := range out.Entries {
		switch out.Entries[i].Goal {
		case "g-checkout":
			if out.Entries[i].Result == "green" {
				faithful = &out.Entries[i]
			}
		case "g-evolve":
			betrayed = &out.Entries[i]
		}
	}
	if faithful == nil || betrayed == nil {
		t.Fatalf("expected a faithful (g-checkout/green) and a betrayed (g-evolve) entry, got %+v", out.Entries)
	}
	if !faithful.ReplayMatches || !faithful.Reconciled || !faithful.Auditable {
		t.Fatalf("faithful run must be auditable: replay=%v reconciled=%v auditable=%v",
			faithful.ReplayMatches, faithful.Reconciled, faithful.Auditable)
	}
	if betrayed.Auditable {
		t.Fatalf("a betrayed run (unrecorded effect) must NOT be auditable")
	}
	// the betrayed run re-derives (replay) yet does not reconcile — proving replay alone misses it.
	if !betrayed.ReplayMatches {
		t.Fatalf("the betrayed run's RECORD is still consistent (replay matches)")
	}
	found := false
	for _, d := range betrayed.Drifts {
		if d.Kind == "unrecorded_effect" && d.Target == "/tmp/exfil.sh" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the betrayed run must surface the unrecorded-effect drift, got %+v", betrayed.Drifts)
	}
}

// refusals are tallied by their S13 BlockReason code.
func TestLedger_RefusalsByCode(t *testing.T) {
	out := callLedger(t, ledgerInput{})
	if out.TotalRefusals[string(blockreason.CodeAgentWriteAboveWaterline)] < 1 {
		t.Fatalf("the ledger must tally the AGENT_WRITE_ABOVE_WATERLINE refusal, got %+v", out.TotalRefusals)
	}
}

// the filter narrows deterministically (by goal).
func TestLedger_FilterByGoal(t *testing.T) {
	out := callLedger(t, ledgerInput{Goal: "g-evolve"})
	for _, e := range out.Entries {
		if e.Goal != "g-evolve" {
			t.Fatalf("filter goal=g-evolve must exclude %s", e.Goal)
		}
	}
	if len(out.Entries) != 1 {
		t.Fatalf("expected 1 g-evolve entry, got %d", len(out.Entries))
	}
}

// the ledger is reproducible (same call ⇒ same JSON).
func TestLedger_Reproducible(t *testing.T) {
	a := callLedger(t, ledgerInput{})
	b := callLedger(t, ledgerInput{})
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatalf("the ledger must be reproducible")
	}
}
