package kernelgardensrv

import (
	"context"
	"testing"
)

// a project with a dead-liveness mirror (a dead proof on a live truth) and a low-value
// over-budget cell — both S112 adds — plus a clean truth.
func dirtyProject(project string) projectIn {
	return projectIn{
		ProjectRef: project,
		KernelHead: "head-1",
		Truths:     []truthIn{{ID: "truth-1", Version: "v1", Live: true}},
		Mirrors: []mirrorIn{
			{ID: "mir-dead", ReflectsLayerID: "truth-1", ReflectsVersion: "v1", TestKind: "property", Liveness: "dead"},
		},
		Budgets: []cellBudgetIn{
			{
				Budget: budgetIn{CellRef: "cell-costly", MaxLLMTokensPerGoal: 1000, ExpectedRiskReduction: "low"},
				Cost:   costIn{LLMTokens: 5000},
			},
		},
	}
}

func cleanProject(project string) projectIn {
	return projectIn{
		ProjectRef: project,
		KernelHead: "head-1",
		Truths:     []truthIn{{ID: "truth-1", Version: "v1", Live: true}},
		Mirrors:    []mirrorIn{{ID: "mir-ok", ReflectsLayerID: "truth-1", ReflectsVersion: "v1", TestKind: "property", Liveness: "alive"}},
	}
}

func findItem(items []itemOut, target string) *itemOut {
	for i := range items {
		if items[i].TargetRef == target {
			return &items[i]
		}
	}
	return nil
}

// TOOL 1a: garden_tend_project surfaces the dead-liveness rot.
func TestTool_TendSurfacesDeadLiveness(t *testing.T) {
	_, out, err := tendTool(context.Background(), nil, dirtyProject("proj-A"))
	if err != nil {
		t.Fatal(err)
	}
	it := findItem(out.Items, "mir-dead")
	if it == nil || it.Kind != "dead_liveness" {
		t.Fatalf("expected a dead_liveness item for mir-dead, got %+v", out.Items)
	}
	if it.ProjectRef != "proj-A" {
		t.Fatalf("item must carry its project ref, got %q", it.ProjectRef)
	}
}

// TOOL 1b: garden_tend_project surfaces the low-value constraint rot.
func TestTool_TendSurfacesLowValueConstraint(t *testing.T) {
	_, out, err := tendTool(context.Background(), nil, dirtyProject("proj-A"))
	if err != nil {
		t.Fatal(err)
	}
	it := findItem(out.Items, "cell-costly")
	if it == nil || it.Kind != "low_value_constraint" {
		t.Fatalf("expected a low_value_constraint item for cell-costly, got %+v", out.Items)
	}
}

// TOOL 1c: project-scoped — proj-A's tend never surfaces proj-B's debt.
func TestTool_TendProjectScoped(t *testing.T) {
	_, out, err := tendTool(context.Background(), nil, dirtyProject("proj-A"))
	if err != nil {
		t.Fatal(err)
	}
	for _, it := range out.Items {
		if it.ProjectRef != "proj-A" {
			t.Fatalf("proj-A garden leaked a foreign-project item %+v", it)
		}
	}
}

// TOOL 1d: a clean project yields an empty garden (no false positive).
func TestTool_TendCleanProjectEmpty(t *testing.T) {
	_, out, err := tendTool(context.Background(), nil, cleanProject("proj-A"))
	if err != nil {
		t.Fatal(err)
	}
	if out.Count != 0 {
		t.Fatalf("a clean project yields an empty garden, got %+v", out.Items)
	}
}

// TOOL 2: garden_suggest_trim proposes one open_idea_* per item, deletes nothing.
func TestTool_SuggestTrimDeletesNothing(t *testing.T) {
	_, gout, _ := tendTool(context.Background(), nil, dirtyProject("proj-A"))
	_, pout, err := suggestTool(context.Background(), nil, dirtyProject("proj-A"))
	if err != nil {
		t.Fatal(err)
	}
	if pout.DeletesAnything {
		t.Fatalf("/trim must delete nothing")
	}
	if len(pout.Suggestions) != gout.Count {
		t.Fatalf("one suggestion per item, got %d for %d items", len(pout.Suggestions), gout.Count)
	}
	for _, s := range pout.Suggestions {
		if s.Requires != "idea → mirror → /goal → human approval" {
			t.Fatalf("every suggestion requires the door, got %q", s.Requires)
		}
	}
}

// TOOL 3: garden_accept_proposal always opens an idea and never deletes.
func TestTool_AcceptOpensIdeaNeverDeletes(t *testing.T) {
	out, _, err := func() (openIdeaOut, *struct{}, error) {
		_, o, e := acceptTool(context.Background(), nil, acceptInput{
			DebtItemRef:    "deadbeef",
			ProjectRef:     "proj-A",
			ProposedAction: "open_idea_to_revive_or_retire_mirror",
		})
		return o, nil, e
	}()
	if err != nil {
		t.Fatal(err)
	}
	if !out.OpensIdea || out.Deletes {
		t.Fatalf("accepting must open an idea and never delete, got %+v", out)
	}
	if out.Door != "idea → mirror → /goal → human approval" {
		t.Fatalf("accepting routes through the door, got %q", out.Door)
	}
}
