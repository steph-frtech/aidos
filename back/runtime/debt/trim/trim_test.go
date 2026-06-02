package trim_test

// S41 trim suggestion mirror (unit): every DebtItem maps to an open_idea_* action
// at the door; SuggestTrim deletes nothing, opens no ChangeSet; an empty debt
// yields an empty plan; a malformed/unknown-kind item is skipped, never panicked on.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/trim"
)

func TestSuggestTrim_KindToOpenIdeaAction(t *testing.T) {
	cases := []struct {
		kind debt.Kind
		want trim.Action
	}{
		{debt.KindOrphanMirror, trim.ActionRetireMirror},
		{debt.KindStaleFixture, trim.ActionRepinFixture},
		{debt.KindSurvivingMutant, trim.ActionStrengthenMirror},
	}
	for _, c := range cases {
		d := debt.KernelDebt{Items: []debt.DebtItem{{ID: "x", Kind: c.kind, TargetRef: "t", Reason: "r", Severity: debt.SeverityHigh}}}
		plan := trim.SuggestTrim(d)
		if len(plan.Suggestions) != 1 {
			t.Fatalf("kind %s: expected 1 suggestion, got %d", c.kind, len(plan.Suggestions))
		}
		s := plan.Suggestions[0]
		if s.ProposedAction != c.want {
			t.Fatalf("kind %s: want action %s, got %s", c.kind, c.want, s.ProposedAction)
		}
		if s.Requires != trim.TheDoor {
			t.Fatalf("kind %s: suggestion must require the door, got %q", c.kind, s.Requires)
		}
		if s.DebtItemRef != "x" {
			t.Fatalf("kind %s: suggestion must reference the debt item id, got %q", c.kind, s.DebtItemRef)
		}
	}
}

func TestSuggestTrim_EmptyDebtEmptyPlan(t *testing.T) {
	if got := trim.SuggestTrim(debt.KernelDebt{}); len(got.Suggestions) != 0 {
		t.Fatalf("empty debt must yield empty plan, got %+v", got.Suggestions)
	}
}

func TestSuggestTrim_UnknownKindSkippedNoPanic(t *testing.T) {
	d := debt.KernelDebt{Items: []debt.DebtItem{{ID: "y", Kind: debt.Kind("invented"), TargetRef: "t"}}}
	if got := trim.SuggestTrim(d); len(got.Suggestions) != 0 {
		t.Fatalf("an unknown-kind item must be skipped (never an invented action), got %+v", got.Suggestions)
	}
}

func TestActions_AreClosedSet(t *testing.T) {
	for _, a := range []trim.Action{trim.ActionRetireMirror, trim.ActionRepinFixture, trim.ActionStrengthenMirror} {
		if !trim.IsAction(a) {
			t.Fatalf("%s should be a declared action", a)
		}
	}
	if trim.IsAction(trim.Action("delete_mirror")) {
		t.Fatalf("a delete action MUST NOT exist — /trim suggests, never deletes")
	}
}
