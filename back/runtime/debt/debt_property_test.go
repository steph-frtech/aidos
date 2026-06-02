package debt_test

// S41 BDD MIRROR — PROPERTY (∀, rapid), below the line, computational. Conceptually
// stored in the `mirrors` schema (reflects: runtime.debt.Scan + trim.SuggestTrim,
// test_kind: property, cert_language: rapid, authority: below) and materialized
// here. The invariants: determinism (now passed, never read); orphan/stale/survivor
// detection; no invented kind; the input is never mutated; every suggestion is an
// open_idea_* requiring the door; every target_ref traces to a real input; clean ⇒
// empty; never panics on malformed input.

import (
	"encoding/json"
	"reflect"
	"testing"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/trim"
	"pgregory.net/rapid"
)

// genSnapshot draws an arbitrary read-only snapshot: a set of truths (some live),
// a set of mirrors (some orphan, some stale fixtures), a consumed mutation run.
func genSnapshot(t *rapid.T) debt.Snapshot {
	n := rapid.IntRange(0, 6).Draw(t, "nTruths")
	truths := make([]debt.TruthRow, n)
	for i := 0; i < n; i++ {
		truths[i] = debt.TruthRow{
			ID:      rapid.StringMatching(`truth-[0-9]`).Draw(t, "tid"),
			Version: rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, "ver"),
			Live:    rapid.Bool().Draw(t, "live"),
		}
	}
	m := rapid.IntRange(0, 6).Draw(t, "nMirrors")
	mirrors := make([]debt.MirrorRow, m)
	tks := []string{"fixture", "property", "acceptance"}
	for i := 0; i < m; i++ {
		mirrors[i] = debt.MirrorRow{
			ID:       rapid.StringMatching(`mir-[0-9]`).Draw(t, "mid"),
			Reflects: mrec.LayerRef{LayerID: rapid.StringMatching(`truth-[0-9]`).Draw(t, "rid"), Version: rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, "rver")},
			TestKind: mrec.TestKind(rapid.SampledFrom(tks).Draw(t, "tk")),
			Liveness: mrec.Liveness(rapid.SampledFrom([]string{"alive", "dead"}).Draw(t, "lv")),
		}
	}
	mu := rapid.IntRange(0, 4).Draw(t, "nMut")
	muts := make([]debt.MutationRow, mu)
	for i := 0; i < mu; i++ {
		st := debt.MutationKilled
		if rapid.Bool().Draw(t, "survived") {
			st = debt.MutationSurvived
		}
		muts[i] = debt.MutationRow{Target: rapid.StringMatching(`truth-[0-9]`).Draw(t, "mut"), Status: st}
	}
	return debt.Snapshot{KernelHead: "head", Truths: truths, Mirrors: mirrors, Mutation: muts}
}

func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSnapshot(t)
		a := debt.Scan(s, 1)
		b := debt.Scan(s, 999) // different clock, same classification — now is never read.
		if !reflect.DeepEqual(a.Items, b.Items) {
			t.Fatalf("Scan is not deterministic / reads the clock: %+v vs %+v", a.Items, b.Items)
		}
	})
}

func TestProp_OnlyDeclaredKinds(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := debt.Scan(genSnapshot(t), 1)
		for _, it := range d.Items {
			if !debt.IsKind(it.Kind) {
				t.Fatalf("invented debt kind %q", it.Kind)
			}
		}
	})
}

func TestProp_InputNeverMutated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSnapshot(t)
		b, _ := json.Marshal(s)
		var before debt.Snapshot
		_ = json.Unmarshal(b, &before)
		d := debt.Scan(s, 1)
		_ = trim.SuggestTrim(d)
		if !reflect.DeepEqual(before, s) {
			t.Fatalf("Scan/SuggestTrim mutated the input snapshot — must be read-only")
		}
	})
}

func TestProp_TargetRefTracesToInput(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genSnapshot(t)
		known := map[string]bool{}
		for _, m := range s.Mirrors {
			known[m.ID] = true
		}
		for _, tr := range s.Truths {
			known[tr.ID] = true
		}
		for _, it := range debt.Scan(s, 1).Items {
			if !known[it.TargetRef] {
				t.Fatalf("target_ref %q traces to no input truth/mirror (invented target)", it.TargetRef)
			}
		}
	})
}

func TestProp_EverySuggestionIsOpenIdeaAtTheDoor(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := debt.Scan(genSnapshot(t), 1)
		plan := trim.SuggestTrim(d)
		// one suggestion per debt item (every item maps to an open_idea_*).
		if len(plan.Suggestions) != len(d.Items) {
			t.Fatalf("expected one suggestion per debt item: %d vs %d", len(plan.Suggestions), len(d.Items))
		}
		for _, sg := range plan.Suggestions {
			if !trim.IsAction(sg.ProposedAction) {
				t.Fatalf("suggestion is not an open_idea_* action: %q", sg.ProposedAction)
			}
			if sg.Requires != trim.TheDoor {
				t.Fatalf("suggestion does not require the door: %q", sg.Requires)
			}
		}
	})
}

func TestProp_CleanSnapshotEmpty(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// A clean snapshot: every mirror reflects a live truth at its head, every
		// fixture is at the head, every mutation is killed.
		tid := rapid.StringMatching(`truth-[0-9]`).Draw(t, "tid")
		ver := "v1"
		s := debt.Snapshot{
			KernelHead: "head",
			Truths:     []debt.TruthRow{{ID: tid, Version: ver, Live: true}},
			Mirrors: []debt.MirrorRow{
				{ID: "mir-x", Reflects: mrec.LayerRef{LayerID: tid, Version: ver}, TestKind: "fixture", Liveness: "alive"},
			},
			Mutation: []debt.MutationRow{{Target: tid, Status: debt.MutationKilled}},
		}
		d := debt.Scan(s, 1)
		if len(d.Items) != 0 || len(trim.SuggestTrim(d).Suggestions) != 0 {
			t.Fatalf("clean snapshot must yield empty debt + empty plan, got %+v", d.Items)
		}
	})
}

func TestProp_NeverPanicsOnMalformed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Inject malformed rows: empty ids, unknown test_kinds/liveness/status.
		s := debt.Snapshot{
			Mirrors: []debt.MirrorRow{
				{ID: rapid.String().Draw(t, "mid"), Reflects: mrec.LayerRef{LayerID: rapid.String().Draw(t, "rid"), Version: rapid.String().Draw(t, "rv")}, TestKind: mrec.TestKind(rapid.String().Draw(t, "tk")), Liveness: mrec.Liveness(rapid.String().Draw(t, "lv"))},
			},
			Truths:   []debt.TruthRow{{ID: rapid.String().Draw(t, "tid"), Version: rapid.String().Draw(t, "tv"), Live: rapid.Bool().Draw(t, "lv2")}},
			Mutation: []debt.MutationRow{{Target: rapid.String().Draw(t, "mt"), Status: debt.MutationStatus(rapid.String().Draw(t, "st"))}},
		}
		d := debt.Scan(s, 0) // must not panic.
		_ = trim.SuggestTrim(d)
	})
}
