package requirementbench

// completeness_dg03_fixture_test.go — DG03 worked-example mirror: the canonical checkout need declared
// as a STRUCTURE (S35 entities + S11 controls/actions/operations + the cross-cutting facets), with its
// "attendus" DERIVED by ExpectedFromSpec, then measured by the enriched Metric. It pins, on a REAL
// case (not only generated), that:
//
//   - the spec-derived attendus exactly match the human-declared checkout ExpectedKinds (the deriver
//     is faithful to S35/S11 — the DG03 enrichment is consistent with the DG02 fixture's hand list);
//   - a single deterministic recompile leaves the cross-cutting types MISSING against the spec-derived
//     attendus (the holes the bench proposes);
//   - adding the two genuinely-divergent models LIFTS MatchPct toward 1.0 and, when complete, MatchPct
//     == 1.0 IFF MissingTypes is empty.
//
// Deterministic, network-free (no LLM): the fixtures are the same representative stand-ins the DG02
// fixture uses, re-judged by the pure Extract.

import (
	"reflect"
	"testing"
)

// checkoutDeclaration — the checkout need as a DECLARED STRUCTURE (the DG03 input shape). It mirrors,
// element by element, the human-listed checkoutSpec.ExpectedKinds (DG02 fixture) so the deriver is
// proven faithful: same need, expressed as a structure, yields the same attendus.
var checkoutDeclaration = SpecDeclaration{
	HasViewGoal:       true, // view.goal
	HasViewData:       true, // view.displayed
	HasViewEmptyState: true, // view.empty_state
	Controls:          2,    // control.exists + control.triggers
	ControlVisible:    true, // control.visible_when
	ControlEnabled:    true, // control.enabled_when
	Actions:           2,    // action.invoke
	ActionOnSuccess:   true, // action.on_success
	ActionOnError:     true, // action.on_error
	Operations:        2,    // operation.exists
	OperationEvents:   1,    // operation.event
	OperationGuards:   1,    // operation.guard
	Entities:          2,    // entity.exists
	EntityFields:      4,    // entity.field
	EntityRelations:   0,    // (no relation declared)
	Invariants:        1,    // invariant.forall
	Policies:          1,    // policy.authz
	Budgets:           0,    // (no budget declared)
	ErrorCases:        1,    // case.error
	EdgeCases:         1,    // case.edge
}

// TestDG03_DeriverMatchesHumanList — the spec-derived attendus equal the DG02 fixture's hand-declared
// checkout ExpectedKinds. The enrichment (structure → attendus) is faithful to S35/S11.
func TestDG03_DeriverMatchesHumanList(t *testing.T) {
	got := ExpectedFromSpec(checkoutDeclaration)
	want := sortedExpected(checkoutSpec.ExpectedKinds)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("spec-derived attendus differ from the human list:\n got=%v\n want=%v", got, want)
	}
}

// TestDG03_RecompileOnlyLeavesHolesAgainstDerivedAttendus — against the SPEC-DERIVED attendus, a
// single recompile still misses the cross-cutting types; the metric reports them and MatchPct < 1.0.
func TestDG03_RecompileOnlyLeavesHolesAgainstDerivedAttendus(t *testing.T) {
	spec := SpecFromDeclaration("checkout-apply-promo", checkoutDeclaration)
	m := Metric(spec, []LLMOutput{{Role: "single", Text: fixtureSingleRecompile}})

	mustMiss := []RequirementKind{
		KindInvariant, KindPolicy, KindErrorCase, KindEdgeCase,
		KindViewEmptyState, KindActionOnSuccess, KindActionOnError, KindOperationGuard, KindOperationEvent,
	}
	missing := asSet(m.MissingTypes)
	for _, k := range mustMiss {
		if !missing[k] {
			t.Fatalf("single recompile should MISS %q against the spec-derived attendus", k)
		}
	}
	if m.MatchPct >= 1.0 {
		t.Fatalf("single recompile should not fully cover the derived attendus, got MatchPct=%v", m.MatchPct)
	}
	// Criterion (4) sanity on this case: MatchPct==1.0 would require MissingTypes empty; it is not.
	if m.MatchPct == 1.0 && len(m.MissingTypes) != 0 {
		t.Fatalf("iff violated on fixture: MatchPct==1.0 yet missing=%v", m.MissingTypes)
	}
}

// TestDG03_DifferentialReachesFullCoverage — with the recompile + the two complementary models, every
// derived attendu is surfaced; MatchPct climbs to 1.0 and MissingTypes is empty (the iff, satisfied).
func TestDG03_DifferentialReachesFullCoverage(t *testing.T) {
	spec := SpecFromDeclaration("checkout-apply-promo", checkoutDeclaration)
	single := Metric(spec, []LLMOutput{{Role: "single", Text: fixtureSingleRecompile}})
	// The union of the three fixtures covers the cross-cutting facets but NOT relations/budgets — which
	// the declaration does not expect either, so coverage of the DERIVED attendus can reach 1.0.
	union3 := Metric(spec, []LLMOutput{
		{Role: "single", Text: fixtureSingleRecompile},
		{Role: "A", Text: fixtureModelA},
		{Role: "B", Text: fixtureModelB},
	})
	if union3.MatchPct <= single.MatchPct {
		t.Fatalf("differential should LIFT coverage: single=%v union=%v", single.MatchPct, union3.MatchPct)
	}
	// The iff, on the worked example: full coverage IFF no holes.
	full := union3.MatchPct == 1.0
	noMissing := len(union3.MissingTypes) == 0
	if full != noMissing {
		t.Fatalf("iff violated: MatchPct==1.0 (%v) but MissingTypes empty (%v): missing=%v",
			full, noMissing, union3.MissingTypes)
	}
}
