package agentrun_test

// Property mirror (∀) for the GV03 tamper-evident (Merkle) audit ledger.
// reflects=runtime.agent_ledger · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. The ledger is runtime audit telemetry, never a layer/truth.
//
// The invariants (the GV03 done-criterion: a TAMPER turns Verify RED; append-only; deterministic):
//  1. REPRODUCIBILITY: Append/Root/Verify are deterministic + total — same ordered runs ⇒ same
//     root, and a freshly built ledger always Verifies OK (no clock, no rng).
//  2. TAMPER-EVIDENCE — ALTER: change one BOM field of one row ⇒ the tip root CHANGES ⇒ Verify
//     goes RED (entry_hash_mismatch). This is the per-row integrity BA28 already had.
//  3. TAMPER-EVIDENCE — DELETE: silently remove one row (the gap BA28 could NOT detect) ⇒ the
//     root changes ⇒ Verify goes RED. The cross-row Merkle chain is what catches it.
//  4. TAMPER-EVIDENCE — REORDER: swap two adjacent rows ⇒ the root changes ⇒ Verify goes RED.
//  5. APPEND-ONLY: Append never mutates the caller's slice nor any prior entry; the prefix of
//     a grown ledger is byte-identical to the pre-Append ledger.
//  6. Decision-BOM is a faithful PROJECTION: DeriveBOM carries exactly the run's decision fields.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"pgregory.net/rapid"
)

// drawLedgerRun draws a recorded run for the ledger mirror (named distinctly from the
// replay mirror's drawRecordedRun, which lives in the same _test package).
func drawLedgerRun(rt *rapid.T) agentrun.AgentRun {
	results := agentrun.Results()
	r := agentrun.AgentRun{
		Agent:       rapid.StringN(1, 10, 10).Draw(rt, "agent"),
		Goal:        rapid.StringN(0, 10, 10).Draw(rt, "goal"),
		RedWorkItem: rapid.StringN(0, 10, 10).Draw(rt, "rwi"),
		ContextPack: rapid.StringN(0, 10, 10).Draw(rt, "pack"),
		Result:      results[rapid.IntRange(0, len(results)-1).Draw(rt, "result")],
		StartedAt:   "2026-06-06T00:00:00Z",
		EndedAt:     "2026-06-06T00:01:00Z",
	}
	rec, err := agentrun.Record(r)
	if err != nil {
		rt.Fatalf("Record: %v", err)
	}
	return rec
}

func drawLedgerRuns(rt *rapid.T, min int) []agentrun.AgentRun {
	n := rapid.IntRange(min, 6).Draw(rt, "n")
	runs := make([]agentrun.AgentRun, n)
	for i := range runs {
		runs[i] = drawLedgerRun(rt)
	}
	return runs
}

// 1. REPRODUCIBILITY — same ordered runs ⇒ same root; a fresh ledger Verifies OK.
func TestLedger_Reproducible_And_Intact(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := drawLedgerRuns(rt, 0)
		a, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger a: %v", err)
		}
		b, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger b: %v", err)
		}
		if agentrun.Root(a) != agentrun.Root(b) {
			rt.Fatalf("non-deterministic root: %s vs %s", agentrun.Root(a), agentrun.Root(b))
		}
		if v := agentrun.Verify(a); !v.OK {
			rt.Fatalf("fresh ledger must verify, got tamper=%q at %d", v.Tamper, v.AtIndex)
		}
		if len(runs) == 0 && agentrun.Root(a) != agentrun.GenesisRoot {
			rt.Fatalf("empty ledger root must be genesis, got %s", agentrun.Root(a))
		}
	})
}

// 2. TAMPER — ALTER a BOM field of one row ⇒ root changes ⇒ Verify red.
func TestLedger_Alter_TurnsRed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := drawLedgerRuns(rt, 1)
		ledger, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger: %v", err)
		}
		rootBefore := agentrun.Root(ledger)
		i := rapid.IntRange(0, len(ledger)-1).Draw(rt, "i")
		// Forge a row: change its BOM but keep its stored hashes/root (a silent edit).
		tampered := make([]agentrun.LedgerEntry, len(ledger))
		copy(tampered, ledger)
		tampered[i].BOM.Goal = tampered[i].BOM.Goal + "X"
		v := agentrun.Verify(tampered)
		if v.OK {
			rt.Fatalf("altered row %d must fail verification", i)
		}
		// A HONEST rebuild after the alteration must change the root (the alteration is visible).
		runs[i].Goal = runs[i].Goal + "X"
		runs[i], _ = agentrun.Record(runs[i])
		rebuilt, _ := agentrun.BuildLedger(runs)
		if agentrun.Root(rebuilt) == rootBefore {
			rt.Fatalf("altering row %d must change the root", i)
		}
	})
}

// 3. TAMPER — DELETE a row ⇒ root changes ⇒ Verify red (the cross-row gap BA28 missed).
func TestLedger_Delete_TurnsRed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := drawLedgerRuns(rt, 2)
		ledger, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger: %v", err)
		}
		rootBefore := agentrun.Root(ledger)
		i := rapid.IntRange(0, len(ledger)-1).Draw(rt, "i")
		// Silently splice out row i, keeping the others' stored hashes (a deletion).
		spliced := make([]agentrun.LedgerEntry, 0, len(ledger)-1)
		spliced = append(spliced, ledger[:i]...)
		spliced = append(spliced, ledger[i+1:]...)
		// The deletion is ALWAYS tamper-EVIDENT — by exactly one of two complementary signals:
		//  - a TAIL deletion drops the tip, so the stored tip ROOT changes vs the trusted anchor
		//    an auditor pinned (the root is a content-address of the WHOLE ordered ledger);
		//  - a NON-TAIL deletion keeps a downstream row whose stored index/prior_root no longer
		//    recompute, so the in-band chain BREAKS (Verify goes RED).
		// At least one MUST fire — a silent deletion that is invisible to both is the BA28 gap
		// GV03 closes, and would be a determinism/audit hole.
		rootChanged := agentrun.Root(spliced) != rootBefore
		verifyRed := !agentrun.Verify(spliced).OK
		if !rootChanged && !verifyRed {
			rt.Fatalf("deleting row %d must be tamper-evident (root change or red verify)", i)
		}
		// An honest rebuild of the shortened sequence has a different root than the original.
		shorter := append(append([]agentrun.AgentRun{}, runs[:i]...), runs[i+1:]...)
		rebuilt, _ := agentrun.BuildLedger(shorter)
		if agentrun.Root(rebuilt) == rootBefore {
			rt.Fatalf("deleting row %d must change the honestly-rebuilt root", i)
		}
	})
}

// 4. TAMPER — REORDER two adjacent rows ⇒ root changes ⇒ Verify red.
func TestLedger_Reorder_TurnsRed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := drawLedgerRuns(rt, 2)
		ledger, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger: %v", err)
		}
		// Find an adjacent pair whose BOMs differ so a swap is a real reordering.
		j := -1
		for k := 0; k+1 < len(ledger); k++ {
			if ledger[k].BOM != ledger[k+1].BOM {
				j = k
				break
			}
		}
		if j < 0 {
			return // all identical: a swap is a no-op, nothing to prove this draw
		}
		swapped := make([]agentrun.LedgerEntry, len(ledger))
		copy(swapped, ledger)
		swapped[j], swapped[j+1] = swapped[j+1], swapped[j]
		if v := agentrun.Verify(swapped); v.OK {
			rt.Fatalf("reordering rows %d/%d must fail verification", j, j+1)
		}
	})
}

// 5. APPEND-ONLY — Append never mutates the caller's slice; the prefix stays identical.
func TestLedger_Append_IsAppendOnly(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		runs := drawLedgerRuns(rt, 1)
		ledger, err := agentrun.BuildLedger(runs)
		if err != nil {
			rt.Fatalf("BuildLedger: %v", err)
		}
		before := make([]agentrun.LedgerEntry, len(ledger))
		copy(before, ledger)
		extra := drawLedgerRun(rt)
		grown, err := agentrun.Append(ledger, extra)
		if err != nil {
			rt.Fatalf("Append: %v", err)
		}
		if len(grown) != len(ledger)+1 {
			rt.Fatalf("Append must grow by one: %d -> %d", len(ledger), len(grown))
		}
		for i := range ledger {
			if ledger[i] != before[i] {
				rt.Fatalf("Append mutated the caller's slice at %d", i)
			}
			if grown[i] != before[i] {
				rt.Fatalf("Append changed the prefix at %d", i)
			}
		}
		if v := agentrun.Verify(grown); !v.OK {
			rt.Fatalf("grown ledger must verify, got %q at %d", v.Tamper, v.AtIndex)
		}
	})
}

// 6. Decision-BOM is a faithful projection of the run's decision fields.
func TestLedger_DeriveBOM_Faithful(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := drawLedgerRun(rt)
		r.Impl = rapid.StringN(0, 8, 8).Draw(rt, "impl")
		r.Seed = rapid.StringN(0, 8, 8).Draw(rt, "seed")
		r, _ = agentrun.Record(r)
		bom := agentrun.DeriveBOM(r)
		if bom.Run != r.ID || bom.Agent != r.Agent || bom.Goal != r.Goal ||
			bom.RedWorkItem != r.RedWorkItem || bom.ContextPack != r.ContextPack ||
			bom.Impl != r.Impl || bom.Seed != r.Seed || bom.Result != r.Result {
			rt.Fatalf("DeriveBOM dropped a decision field: %+v vs run %+v", bom, r)
		}
	})
}
