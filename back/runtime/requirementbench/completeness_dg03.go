// completeness_dg03.go — DG03: the COMPLETENESS METRIC as an ENRICHED pure function, with the
// "attendus" (the MatchPct denominator) DERIVED FROM THE SPEC's own declared structure (S35 entity-
// source + S11 control/action), and its reproducibility mirror (completeness_dg03_property_test.go).
//
// WHAT DG02 SHIPPED vs WHAT DG03 ADDS (additive, CLAUDE.md §9). DG02 graved the port + the minimal
// metric: CompletenessReport{ MissingTypes, MatchPct } where MatchPct = présents/attendus and the
// "attendus" were a HUMAN-listed Spec.ExpectedKinds. DG03 keeps that arithmetic AUTHORITATIVE (Metric
// re-uses the very same Derive) and ENRICHES the SOURCE of the attendus: a spec can now DECLARE its
// structure (how many controls/actions/operations/entities/fields/relations it has, which cross-
// cutting facets it carries) and the deriver computes the expected TYPE set from it — so MatchPct is a
// faithful |présents| / |attendus sur les TYPES déclarés par la spec|, never a pass/fail score, never
// an LLM judgement. It is set arithmetic over the closed 22-kind taxonomy (taxonomy.go).
//
// THE WALL (CLAUDE.md §2). Everything here is PURE, READ-ONLY, below the line. SpecFromDeclaration and
// Metric derive values from their inputs and write NOTHING — no DB, no truth-store, no kernel/mirrors/
// fitness. The MissingTypes the metric surfaces are PROPOSED holes (idea → mirror → /goal via
// firewall.ViaIdea), never a kernel write. The deterministic completeness law stays authoritative
// (ADR 0072): the bench proposes, it never governs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). No LLM enters: the deriver is a pure mapping from a declared
// structure to a closed type set, the metric is union/diff arithmetic. Same input → same output (the
// reproducibility mirror replays it 100×). The judge is deterministic; the LLM is the gated exception
// confined to DG04 and its Text is always re-judged by Extract before any use.

package requirementbench

// SpecDeclaration is the STRUCTURE a spec declares, grounded in the AIDOS verticale (S11 view/control/
// action specs + S35 entity-source + the operation/invariant/policy rungs). It is the input from which
// the "attendus" (expected requirement TYPES) are DERIVED. Counts are how many of each declared element
// the spec carries; the booleans mark facets a single element implies. Declared above the line (§8 —
// the human owns the spec's truth), never learned, never expanded by a model. A field left zero/false
// simply means the spec declares none of that type ⇒ that type is not expected ⇒ it is not a hole.
type SpecDeclaration struct {
	// View / screen (S11 view-spec: goal, zones, displayed data, empty state).
	HasViewGoal       bool // the screen declares its reason-to-exist
	HasViewData       bool // the screen declares displayed data fields
	HasViewEmptyState bool // the screen declares an empty/zero state

	// Control (S11 control-spec: label/visible_when/enabled_when/triggers).
	Controls       int  // number of declared controls (>0 ⇒ control.exists + control.triggers expected)
	ControlVisible bool // at least one control declares a visible_when rule
	ControlEnabled bool // at least one control declares an enabled_when rule

	// Action (S11 action-spec: invoke/on_success/on_error).
	Actions         int  // number of declared actions (>0 ⇒ action.invoke expected)
	ActionOnSuccess bool // at least one action declares an on_success effect
	ActionOnError   bool // at least one action declares an on_error effect

	// Operation (the workflow rung: command → events, guards).
	Operations      int // number of declared operations (>0 ⇒ operation.exists expected)
	OperationEvents int // number of declared emitted events (>0 ⇒ operation.event expected)
	OperationGuards int // number of declared guards/preconditions (>0 ⇒ operation.guard expected)

	// Entity / contract (S35 entity-source).
	Entities        int // number of declared entities (>0 ⇒ entity.exists expected)
	EntityFields    int // number of declared typed fields (>0 ⇒ entity.field expected)
	EntityRelations int // number of declared relations (>0 ⇒ entity.relation expected)

	// Cross-cutting truth facets — the ones a happy-path recompile most often misses.
	Invariants int // number of declared ∀ invariants (>0 ⇒ invariant.forall expected)
	Policies   int // number of declared authz policies (>0 ⇒ policy.authz expected)
	Budgets    int // number of declared perf/sec budgets (>0 ⇒ budget.perf_sec expected)
	ErrorCases int // number of declared error cases (>0 ⇒ case.error expected)
	EdgeCases  int // number of declared edge cases (>0 ⇒ case.edge expected)
}

// ExpectedFromSpec DERIVES the closed set of requirement TYPES a COMPLETE coverage of the declared
// spec must carry — the "attendus" denominator of MatchPct. PURE and DETERMINISTIC: a fixed mapping
// from the declared structure to a sorted, de-duplicated subset of the 22-kind taxonomy. No LLM, no
// clock, no rng. A model never gets to expand this set (the wall): it is the human-declared structure
// projected onto the closed taxonomy. This is the DG03 enrichment — the source of "attendus" becomes
// the SPEC's own S35/S11 declarations rather than a hand-listed ExpectedKinds.
func ExpectedFromSpec(d SpecDeclaration) []RequirementKind {
	expected := map[RequirementKind]bool{}
	add := func(k RequirementKind, when bool) {
		if when {
			expected[k] = true
		}
	}

	// View facets.
	add(KindViewGoal, d.HasViewGoal)
	add(KindViewData, d.HasViewData)
	add(KindViewEmptyState, d.HasViewEmptyState)

	// Control facets — a declared control implies it exists AND binds to an action (S11: triggers).
	add(KindControl, d.Controls > 0)
	add(KindControlTrigger, d.Controls > 0)
	add(KindControlVisible, d.ControlVisible)
	add(KindControlEnabled, d.ControlEnabled)

	// Action facets.
	add(KindActionInvoke, d.Actions > 0)
	add(KindActionOnSuccess, d.ActionOnSuccess)
	add(KindActionOnError, d.ActionOnError)

	// Operation facets.
	add(KindOperation, d.Operations > 0)
	add(KindOperationEvent, d.OperationEvents > 0)
	add(KindOperationGuard, d.OperationGuards > 0)

	// Entity / contract facets.
	add(KindEntity, d.Entities > 0)
	add(KindEntityField, d.EntityFields > 0)
	add(KindEntityRel, d.EntityRelations > 0)

	// Cross-cutting truth facets.
	add(KindInvariant, d.Invariants > 0)
	add(KindPolicy, d.Policies > 0)
	add(KindBudget, d.Budgets > 0)
	add(KindErrorCase, d.ErrorCases > 0)
	add(KindEdgeCase, d.EdgeCases > 0)

	out := make([]RequirementKind, 0, len(expected))
	for k := range expected {
		out = append(out, k)
	}
	// sortedExpected canonicalises (sort + de-dup) so the derived set is byte-stable across runs.
	return sortedExpected(out)
}

// SpecFromDeclaration builds a Spec whose ExpectedKinds is DERIVED FROM the declared structure
// (ExpectedFromSpec). The SpecText is a terse rendering of the intent; ExpectedKinds is the
// spec-derived "attendus". PURE: same (id, declaration) → same Spec. This is the canonical way DG03
// constructs a spec whose attendus are spec-faithful (S35/S11), feeding the DG02 port unchanged.
func SpecFromDeclaration(id string, d SpecDeclaration) Spec {
	return Spec{
		ID:            id,
		SpecText:      "# besoin " + id,
		ExpectedKinds: ExpectedFromSpec(d),
	}
}

// CompletenessMetric is the DG03 ENRICHED metric value over a spec + its candidate outputs. It is the
// DG02 CompletenessReport's measurement projected as the headline metric the Workbench (DG06) renders:
// the present types, the missing (proposed-hole) types, the counts, and MatchPct ∈ [0,1]. PURELY
// DERIVED from (spec, candidates) via the SAME authoritative Derive — DG03 does not fork the
// arithmetic, it only enriches the SOURCE of the attendus. Writes nothing (the wall).
type CompletenessMetric struct {
	SpecID string

	// PresentTypes is the union of requirement types ALL candidates surfaced (deterministic order).
	PresentTypes []RequirementKind
	// PresentCount is len(PresentTypes).
	PresentCount int

	// MissingTypes is the spec's (spec-derived) ExpectedKinds that NO candidate surfaced — the holes
	// the bench PROPOSES (idea → mirror → /goal), never a kernel write. Sorted, de-duplicated.
	MissingTypes []RequirementKind
	// ExpectedCount is len(spec.ExpectedKinds) (the spec-derived attendus).
	ExpectedCount int

	// MatchPct = |attendus couverts| / |attendus|, in [0,1]; == 1.0 IFF MissingTypes is empty;
	// vacuously 1.0 when the spec expects nothing (a spec that declares no structure is fully covered).
	MatchPct float64
}

// Metric computes the DG03 enriched CompletenessMetric over a spec (whose ExpectedKinds are the
// spec-derived attendus) and its candidate outputs. PURE and TOTAL: it re-uses the authoritative DG02
// Derive (the same union/diff arithmetic, the same Extract re-judging each candidate's Text), then
// projects it as the metric value. Determinism: every set is sorted; same (spec, candidates) → same
// metric. The LLM never enters (DG04 produces Text behind the port; here we only count types).
func Metric(spec Spec, candidates []LLMOutput) CompletenessMetric {
	rep := Derive(spec, candidates)
	return CompletenessMetric{
		SpecID:        rep.SpecID,
		PresentTypes:  rep.PresentTypes,
		PresentCount:  rep.PresentCount,
		MissingTypes:  rep.MissingTypes,
		ExpectedCount: rep.ExpectedCount,
		MatchPct:      rep.MatchPct,
	}
}
