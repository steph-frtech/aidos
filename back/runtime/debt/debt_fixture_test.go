package debt_test

// S41 BDD MIRROR — FIXTURE (N2: state → command → events), conceptually stored in
// the `mirrors` schema (reflects: runtime.debt.Scan + runtime.debt.trim.SuggestTrim,
// test_kind: fixture, cert_language: operation-dsl/go, authority: below — fitness is
// a read-only diagnostic) and materialized here for the Go runner. These ARE the
// done criteria: an orphan mirror, a stale fixture and a surviving mutant are each
// detected; a trim is SUGGESTED (never executed); a clean kernel yields empty debt
// and an empty plan; the recorded snapshot id is the content hash of its body. The
// snapshot is read-only throughout — nothing is mutated or deleted.

import (
	"encoding/json"
	"reflect"
	"testing"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	krec "github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/trim"
)

const fixedNow int64 = 1_700_000_000

// fixture: an orphan mirror is detected as debt; nothing is deleted (THE done crit).
func TestFixture_OrphanMirrorDetected_NothingDeleted(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths:     []debt.TruthRow{{ID: "truth-1", Version: "v1", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "mir-9", Reflects: mrec.LayerRef{LayerID: "truth-GONE", Version: "v1"}, TestKind: "property", Liveness: "alive"},
		},
	}
	// snapshot defensive copy to prove read-only.
	before := deepCopy(t, snap)

	got := debt.Scan(snap, fixedNow)

	item := findByTarget(got.Items, "mir-9")
	if item == nil {
		t.Fatalf("expected an orphan_mirror DebtItem for mir-9, got %+v", got.Items)
	}
	if item.Kind != debt.KindOrphanMirror {
		t.Fatalf("expected kind orphan_mirror, got %q", item.Kind)
	}
	if !contains(item.Reason, "no_orphan_mirror") || !contains(item.Reason, "truth-GONE") {
		t.Fatalf("reason should name the no-live-truth monster (S12) and the missing target, got %q", item.Reason)
	}
	// read-only: the input snapshot is unchanged.
	if !reflect.DeepEqual(before, snap) {
		t.Fatalf("Scan mutated the input snapshot — the wall: it must be read-only")
	}
}

// fixture: a stale fixture is detected when its pinned truth moved (THE done crit).
func TestFixture_StaleFixtureDetected(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths:     []debt.TruthRow{{ID: "truth-2", Version: "v3", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "fix-4", Reflects: mrec.LayerRef{LayerID: "truth-2", Version: "v1"}, TestKind: "fixture", Liveness: "alive"},
		},
	}
	got := debt.Scan(snap, fixedNow)

	item := findByTarget(got.Items, "fix-4")
	if item == nil || item.Kind != debt.KindStaleFixture {
		t.Fatalf("expected a stale_fixture DebtItem for fix-4, got %+v", got.Items)
	}
	if !contains(item.Reason, "v1") || !contains(item.Reason, "v3") {
		t.Fatalf("reason should name the moved head (v1 → v3), got %q", item.Reason)
	}
}

// fixture: a surviving mutant is detected from the consumed mutation run (done crit).
func TestFixture_SurvivingMutantDetected(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths:     []debt.TruthRow{{ID: "truth-3", Version: "v1", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "mir-5", Reflects: mrec.LayerRef{LayerID: "truth-3", Version: "v1"}, TestKind: "property", Liveness: "alive"},
		},
		Mutation: []debt.MutationRow{{Target: "truth-3", Status: debt.MutationSurvived}},
	}
	got := debt.Scan(snap, fixedNow)

	item := findByTarget(got.Items, "truth-3")
	if item == nil || item.Kind != debt.KindSurvivingMutant {
		t.Fatalf("expected a surviving_mutant DebtItem for truth-3, got %+v", got.Items)
	}
	if !contains(item.Reason, "mir-5") {
		t.Fatalf("reason should name the mirror that should have killed it, got %q", item.Reason)
	}
}

// fixture: trim is SUGGESTED, never executed — deletes nothing (THE done criterion).
func TestFixture_TrimSuggestedNeverExecuted(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths: []debt.TruthRow{
			{ID: "truth-2", Version: "v3", Live: true},
			{ID: "truth-3", Version: "v1", Live: true},
		},
		Mirrors: []debt.MirrorRow{
			{ID: "mir-9", Reflects: mrec.LayerRef{LayerID: "truth-GONE", Version: "v1"}, TestKind: "property", Liveness: "alive"},
			{ID: "fix-4", Reflects: mrec.LayerRef{LayerID: "truth-2", Version: "v1"}, TestKind: "fixture", Liveness: "alive"},
			{ID: "mir-5", Reflects: mrec.LayerRef{LayerID: "truth-3", Version: "v1"}, TestKind: "property", Liveness: "alive"},
		},
		Mutation: []debt.MutationRow{{Target: "truth-3", Status: debt.MutationSurvived}},
	}
	before := deepCopy(t, snap)

	d := debt.Scan(snap, fixedNow)
	plan := trim.SuggestTrim(d)

	if len(plan.Suggestions) != 3 {
		t.Fatalf("expected 3 suggestions (orphan, stale, survivor), got %d: %+v", len(plan.Suggestions), plan.Suggestions)
	}
	for _, s := range plan.Suggestions {
		if !trim.IsAction(s.ProposedAction) {
			t.Fatalf("proposed_action %q is not a declared open_idea_* action", s.ProposedAction)
		}
		if s.Requires != trim.TheDoor {
			t.Fatalf("every suggestion must require %q, got %q", trim.TheDoor, s.Requires)
		}
	}
	// SuggestTrim opens no ChangeSet and deletes nothing: the snapshot is unchanged.
	if !reflect.DeepEqual(before, snap) {
		t.Fatalf("SuggestTrim/Scan mutated the input — they must delete nothing, write no truth")
	}
}

// fixture: a clean kernel yields empty debt and an empty trim plan (no false pos).
func TestFixture_CleanKernel_EmptyDebtEmptyPlan(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths:     []debt.TruthRow{{ID: "truth-1", Version: "v1", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "mir-1", Reflects: mrec.LayerRef{LayerID: "truth-1", Version: "v1"}, TestKind: "property", Liveness: "alive"},
		},
		Mutation: []debt.MutationRow{{Target: "truth-1", Status: debt.MutationKilled}},
	}
	d := debt.Scan(snap, fixedNow)
	plan := trim.SuggestTrim(d)
	if len(d.Items) != 0 {
		t.Fatalf("clean kernel must yield empty debt, got %+v", d.Items)
	}
	if len(plan.Suggestions) != 0 {
		t.Fatalf("clean kernel must yield empty trim plan, got %+v", plan.Suggestions)
	}
}

// fixture: the recorded snapshot id is the content hash of its body (S01/S02 reuse).
func TestFixture_SnapshotIDIsContentHash(t *testing.T) {
	snap := debt.Snapshot{
		KernelHead: "head-1",
		Truths:     []debt.TruthRow{{ID: "truth-1", Version: "v1", Live: true}},
		Mirrors: []debt.MirrorRow{
			{ID: "mir-9", Reflects: mrec.LayerRef{LayerID: "truth-GONE", Version: "v1"}, TestKind: "property", Liveness: "alive"},
		},
	}
	d := debt.Scan(snap, fixedNow)
	plan := trim.SuggestTrim(d)
	body, err := json.Marshal(struct {
		Debt debt.KernelDebt `json:"debt"`
		Plan trim.TrimPlan   `json:"plan"`
	}{d, plan})
	if err != nil {
		t.Fatal(err)
	}
	id, err := debt.SnapshotID(body)
	if err != nil {
		t.Fatal(err)
	}
	canon, _ := krec.Canonicalize(body)
	if id != krec.Hash(canon) {
		t.Fatalf("snapshot id must be Hash(Canonicalize(body)); got %q want %q", id, krec.Hash(canon))
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

func findByTarget(items []debt.DebtItem, target string) *debt.DebtItem {
	for i := range items {
		if items[i].TargetRef == target {
			return &items[i]
		}
	}
	return nil
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func deepCopy(t *testing.T, s debt.Snapshot) debt.Snapshot {
	t.Helper()
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatal(err)
	}
	var out debt.Snapshot
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}
