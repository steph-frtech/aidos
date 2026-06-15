// live_ledger_test.go — ADR 0078 mirror. The Merkle ledger fed by the REAL Drive runs:
//
//   - REPRODUCIBILITY (determinism-first, §6/§8): the SAME really-driven runs ⇒ the SAME
//     Merkle root, byte-for-byte. The append path (AppendRunToLedger → agentrun.Append) carries
//     no clock, no rng — same runs ⇒ same ledger.
//   - TAMPER-EVIDENCE (§8): altering ONE appended ledger entry (its BOM) ⇒ VerifyLiveLedger goes
//     red at that row. The chain decides, never an agent.
//   - APPEND-ONLY / REALITY (§9, ADR 0078): the ledger chains the runs that REALLY executed (the
//     agentloop_live_ledger tool drives them on the real path), not the ledgerRuns() fixture; it
//     writes no truth (WroteTruth always false — the wall).
package main

import (
	"context"
	"encoding/json"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// realRuns drives the requested scenarios on the REAL call path and returns the recorded runs —
// the runs that really executed (what ADR 0078 wants the ledger fed by).
func realRuns(t *testing.T, scenarios []string) []agentrun.AgentRun {
	t.Helper()
	runs, err := newServer().driveRealRuns(liveLedgerInput{
		LayerRef:     "agent:builder@v1",
		Scenarios:    scenarios,
		GoalID:       "g-checkout",
		ContextPack:  "pack-x",
		TargetServer: "mirror-runner",
		TargetTool:   "run_mirror",
		StartedAt:    "2026-06-03T10:00:00Z",
		EndedAt:      "2026-06-03T10:05:00Z",
	})
	if err != nil {
		t.Fatalf("driveRealRuns: %v", err)
	}
	if len(runs) == 0 {
		t.Fatalf("expected at least one real run, got none")
	}
	return runs
}

// the living ledger writes no truth.
func TestLiveLedger_WritesNoTruth(t *testing.T) {
	_, out, err := newServer().liveLedger(context.Background(), nil, liveLedgerInput{
		LayerRef: "agent:builder@v1", GoalID: "g-checkout", ContextPack: "pack-x",
		TargetServer: "mirror-runner", TargetTool: "run_mirror",
		StartedAt: "2026-06-03T10:00:00Z", EndedAt: "2026-06-03T10:05:00Z",
	})
	if err != nil {
		t.Fatalf("liveLedger: %v", err)
	}
	if out.WroteTruth {
		t.Fatalf("the living ledger must write no truth (read-only audit surface, the wall)")
	}
}

// the living ledger chains the REAL runs and Verifies intact (the happy reality).
func TestLiveLedger_RealRunsAppendedAndVerify(t *testing.T) {
	runs := realRuns(t, scenarioNames())
	ledger, err := LiveLedger(runs)
	if err != nil {
		t.Fatalf("LiveLedger: %v", err)
	}
	if len(ledger) != len(runs) {
		t.Fatalf("ledger must chain every real run: got %d entries for %d runs", len(ledger), len(runs))
	}
	// each entry's BOM run id is the recorded run's content-address (the REAL run, not a fixture).
	for i, e := range ledger {
		if e.BOM.Run != runs[i].ID {
			t.Fatalf("entry %d chains BOM run %q, want real run id %q", i, e.BOM.Run, runs[i].ID)
		}
		if e.Index != i {
			t.Fatalf("entry %d has index %d (append-only ordering broken)", i, e.Index)
		}
	}
	if v := VerifyLiveLedger(ledger); !v.OK {
		t.Fatalf("an untampered live ledger must Verify OK, got %+v", v)
	}
}

// REPRODUCIBILITY (the §6 mirror ADR 0078 asks for): same real runs ⇒ same Merkle root.
func TestLiveLedger_SameRunsSameRoot(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// draw an ORDERED, non-empty subset of the declared scenarios (the runs that happened).
		n := rapid.IntRange(1, 4).Draw(rt, "n")
		all := scenarioNames()
		scenarios := make([]string, n)
		for i := 0; i < n; i++ {
			scenarios[i] = rapid.SampledFrom(all).Draw(rt, "scenario")
		}
		s := newServer()
		runsA, err := s.driveRealRuns(liveLedgerInput{
			LayerRef: "agent:builder@v1", Scenarios: scenarios, GoalID: "g-checkout", ContextPack: "pack-x",
			TargetServer: "mirror-runner", TargetTool: "run_mirror",
			StartedAt: "2026-06-03T10:00:00Z", EndedAt: "2026-06-03T10:05:00Z",
		})
		if err != nil {
			rt.Fatalf("driveRealRuns A: %v", err)
		}
		runsB, err := s.driveRealRuns(liveLedgerInput{
			LayerRef: "agent:builder@v1", Scenarios: scenarios, GoalID: "g-checkout", ContextPack: "pack-x",
			TargetServer: "mirror-runner", TargetTool: "run_mirror",
			StartedAt: "2026-06-03T10:00:00Z", EndedAt: "2026-06-03T10:05:00Z",
		})
		if err != nil {
			rt.Fatalf("driveRealRuns B: %v", err)
		}
		rootA, err := LiveLedgerRoot(runsA)
		if err != nil {
			rt.Fatalf("root A: %v", err)
		}
		rootB, err := LiveLedgerRoot(runsB)
		if err != nil {
			rt.Fatalf("root B: %v", err)
		}
		if rootA != rootB {
			rt.Fatalf("same real runs must fold to the same Merkle root: %q != %q", rootA, rootB)
		}
		// and the root is NOT the genesis (a non-empty ledger has a real chain root).
		if rootA == agentrun.GenesisRoot {
			rt.Fatalf("a non-empty live ledger must have a non-genesis root")
		}
	})
}

// TAMPER-EVIDENCE (the §8 mirror): alter ONE appended entry ⇒ VerifyLiveLedger fails at it.
func TestLiveLedger_TamperFailsVerify(t *testing.T) {
	runs := realRuns(t, scenarioNames())
	if len(runs) < 2 {
		t.Fatalf("the tamper test needs at least two real runs, got %d", len(runs))
	}
	ledger, err := LiveLedger(runs)
	if err != nil {
		t.Fatalf("LiveLedger: %v", err)
	}
	if v := VerifyLiveLedger(ledger); !v.OK {
		t.Fatalf("the untampered ledger must Verify OK first, got %+v", v)
	}

	// Deep-copy the ledger, then ALTER one entry's BOM in place (a forged audit row) — the GV03
	// chain must detect it (its recomputed entry-hash no longer matches the stored one).
	raw, err := json.Marshal(ledger)
	if err != nil {
		t.Fatalf("marshal ledger: %v", err)
	}
	var tampered []agentrun.LedgerEntry
	if err := json.Unmarshal(raw, &tampered); err != nil {
		t.Fatalf("unmarshal ledger: %v", err)
	}
	const target = 1
	tampered[target].BOM.Result = agentrun.ResultGreen // overwrite the recorded outcome (a lie)
	if tampered[target].BOM.RedWorkItem == "tampered" {
		t.Fatalf("test bug: choose a value that actually changes the BOM")
	}
	tampered[target].BOM.RedWorkItem = "tampered" // a second alteration to guarantee a delta

	v := VerifyLiveLedger(tampered)
	if v.OK {
		t.Fatalf("a tampered entry must make Verify go red")
	}
	if v.AtIndex != target {
		t.Fatalf("Verify must flag the tampered row %d, flagged %d (%s)", target, v.AtIndex, v.Tamper)
	}
	if v.Tamper != agentrun.TamperEntryHash {
		t.Fatalf("altering a BOM must be an entry_hash_mismatch, got %q", v.Tamper)
	}
}

// the living ledger is the LIVE counterpart of the ledgerRuns() fixture: the fixture stays a
// reproducibility GOLD (anti-overwrite §9 — not deleted), and BOTH feed the SAME Merkle math, so
// the fixture runs themselves fold to a stable, verifiable root through the live append path.
func TestLiveLedger_FixtureStaysReproducibleGold(t *testing.T) {
	gold := ledgerRuns() // the requalified fixture (ADR 0078) — still present, now a gold mirror.
	r1, err := LiveLedgerRoot(gold)
	if err != nil {
		t.Fatalf("root1: %v", err)
	}
	r2, err := LiveLedgerRoot(gold)
	if err != nil {
		t.Fatalf("root2: %v", err)
	}
	if r1 != r2 {
		t.Fatalf("the gold fixture must fold to a stable root through the live append path")
	}
	led, err := LiveLedger(gold)
	if err != nil {
		t.Fatalf("LiveLedger(gold): %v", err)
	}
	if v := VerifyLiveLedger(led); !v.OK {
		t.Fatalf("the gold fixture's live ledger must Verify OK, got %+v", v)
	}
}
