package debt_test

// S41 FAULT-INJECTION (CLAUDE.md §5 hook honesty / KRD la chasse au monstre): a
// mirror that never goes red on real rot is dead. This test BREAKS the truth-store
// — it weakens a mirror so a mutant survives, re-points a mirror at a disappeared
// truth, and moves a pinned head — and asserts Scan goes RED (names the rot); then
// it RESTORES the snapshot and asserts Scan goes GREEN (empty debt). If the
// detectors ever silently passed real rot, this test fails.

import (
	"testing"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/trim"
)

func TestFaultInjection_BreakThenRestore(t *testing.T) {
	// A clean, complete snapshot: every mirror reflects a live head; the mutant was
	// killed. Scan must find NOTHING.
	clean := debt.Snapshot{
		KernelHead: "head-clean",
		Truths:     []debt.TruthRow{{ID: "truth-A", Version: "v2", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "fix-A", Reflects: mrec.LayerRef{LayerID: "truth-A", Version: "v2"}, TestKind: "fixture", Liveness: "alive"},
		},
		Mutation: []debt.MutationRow{{Target: "truth-A", Status: debt.MutationKilled}},
	}
	if d := debt.Scan(clean, 1); len(d.Items) != 0 {
		t.Fatalf("the clean snapshot must yield no debt, got %+v", d.Items)
	}

	// INJECT FAULT 1 — weaken the mirror so the mutant SURVIVES (a real test gap).
	weakened := clean
	weakened.Mutation = []debt.MutationRow{{Target: "truth-A", Status: debt.MutationSurvived, File: "f.go", Line: 7, Operator: "CONDITIONALS_BOUNDARY"}}
	d := debt.Scan(weakened, 1)
	if !hasKind(d, debt.KindSurvivingMutant) {
		t.Fatalf("weakening the mirror (survived mutant) must surface a surviving_mutant; got %+v", d.Items)
	}

	// INJECT FAULT 2 — re-point the mirror at a DISAPPEARED truth (orphan).
	orphaned := clean
	orphaned.Mirrors = []debt.MirrorRow{{ID: "fix-A", Reflects: mrec.LayerRef{LayerID: "truth-DISAPPEARED", Version: "v2"}, TestKind: "fixture", Liveness: "alive"}}
	d = debt.Scan(orphaned, 1)
	if !hasKind(d, debt.KindOrphanMirror) {
		t.Fatalf("re-pointing at a disappeared truth must surface an orphan_mirror; got %+v", d.Items)
	}

	// INJECT FAULT 3 — move the pinned head (the fixture goes stale).
	staled := clean
	staled.Truths = []debt.TruthRow{{ID: "truth-A", Version: "v5", Live: true}}
	d = debt.Scan(staled, 1)
	if !hasKind(d, debt.KindStaleFixture) {
		t.Fatalf("moving the pinned head must surface a stale_fixture; got %+v", d.Items)
	}

	// RESTORE — the clean snapshot is green again, and the trim plan is empty.
	d = debt.Scan(clean, 1)
	if len(d.Items) != 0 || len(trim.SuggestTrim(d).Suggestions) != 0 {
		t.Fatalf("restoring the snapshot must return to empty debt + empty plan, got %+v", d.Items)
	}
}

func hasKind(d debt.KernelDebt, k debt.Kind) bool {
	for _, it := range d.Items {
		if it.Kind == k {
			return true
		}
	}
	return false
}
