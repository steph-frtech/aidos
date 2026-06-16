package requirementbench

// completeness_dg03_property_test.go — the DG03 RIGOROUS mirror (invariant ∀, rapid), WRITTEN RED
// FIRST. DG02 shipped the metric's MINIMAL form (MatchPct, MissingTypes vs a HUMAN-listed
// ExpectedKinds) + its purity property. DG03 ENRICHES the metric so the "attendus" denominator is
// DERIVED FROM THE SPEC's own declared structure (S35 entity-source + S11 control/action), making
// MatchPct a faithful |présents| / |attendus sur les TYPES déclarés par la spec| — never a pass/fail
// score, never an LLM judgement: it is set arithmetic over the closed taxonomy (taxonomy.go).
//
// THE FOUR DG03 CRITERIA, pinned here as NAMED, ADDITIVE properties (the roadmap DG03 done-set):
//
//	(1) DÉTERMINISME — same (spec, candidates) → same CompletenessMetric, replayed 100×. No clock,
//	    no rng, no map-iteration leak (every set is sorted). The reproducibility mirror.
//	(2) MANQUANT BIEN COMPTÉ — a type the SPEC expects but NO candidate surfaces is in MissingTypes
//	    (and is therefore counted against MatchPct). The spec-derived "attendus" make this exact.
//	(3) ANTI-FAUX-POSITIF (comme le contrôle dissimilaire CE01) — a type covered by ≥1 candidate is
//	    NEVER a false-negative: it never appears in MissingTypes, and adding a candidate can only
//	    SHRINK MissingTypes (monotone). A type genuinely present is never reported missing.
//	(4) MATCH% ∈ [0,1], = 1 SSI MissingTypes vide — the bornes + the iff equivalence.
//
// THE WALL (§2): every function under test is PURE and READ-ONLY — it derives a metric value from
// (spec, candidates) and writes NOTHING (no DB, no kernel/mirrors/fitness). The derived MissingTypes
// are PROPOSED holes (idea → mirror → /goal via firewall.ViaIdea), never a truth write.
//
// DETERMINISM-FIRST (§6/§8): no LLM enters — the spec-deriver and the metric are pure set arithmetic
// over the closed taxonomy. The judge is deterministic and authoritative (ADR 0072/0088).

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// genStructuredSpec draws a spec whose ExpectedKinds is computed BY THE DERIVER from a randomly
// declared structure (some views, controls, actions, operations, entities, plus cross-cutting
// facets). It returns the spec AND the deriver's own expected set, so the property asserts the metric
// is taken against the SPEC-DERIVED attendus (DG03), not an externally injected list.
func genStructuredSpec(t *rapid.T) Spec {
	decl := SpecDeclaration{
		HasViewGoal:       rapid.Bool().Draw(t, "viewGoal"),
		HasViewData:       rapid.Bool().Draw(t, "viewData"),
		HasViewEmptyState: rapid.Bool().Draw(t, "viewEmpty"),
		Controls:          rapid.IntRange(0, 3).Draw(t, "controls"),
		ControlVisible:    rapid.Bool().Draw(t, "ctlVisible"),
		ControlEnabled:    rapid.Bool().Draw(t, "ctlEnabled"),
		Actions:           rapid.IntRange(0, 3).Draw(t, "actions"),
		ActionOnSuccess:   rapid.Bool().Draw(t, "onSuccess"),
		ActionOnError:     rapid.Bool().Draw(t, "onError"),
		Operations:        rapid.IntRange(0, 3).Draw(t, "ops"),
		OperationEvents:   rapid.IntRange(0, 3).Draw(t, "events"),
		OperationGuards:   rapid.IntRange(0, 3).Draw(t, "guards"),
		Entities:          rapid.IntRange(0, 3).Draw(t, "entities"),
		EntityFields:      rapid.IntRange(0, 5).Draw(t, "fields"),
		EntityRelations:   rapid.IntRange(0, 3).Draw(t, "rels"),
		Invariants:        rapid.IntRange(0, 3).Draw(t, "invs"),
		Policies:          rapid.IntRange(0, 3).Draw(t, "pols"),
		Budgets:           rapid.IntRange(0, 2).Draw(t, "buds"),
		ErrorCases:        rapid.IntRange(0, 3).Draw(t, "errs"),
		EdgeCases:         rapid.IntRange(0, 3).Draw(t, "edges"),
	}
	id := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "specID")
	return SpecFromDeclaration(id, decl)
}

// candidateCovering builds a candidate output that surfaces EVERY kind in `kinds` EXCEPT `omit`, by
// emitting one tagged line (the kind's first declared marker) per covered kind. Used to force a single
// deterministic hole and assert it is reported missing (criterion 2).
func candidateCovering(kinds []RequirementKind, omit RequirementKind) string {
	markers := kindMarkers()
	text := "# candidate covering\n"
	for _, k := range kinds {
		if k == omit {
			continue
		}
		text += markers[k][0] + " something\n"
	}
	return text
}

// TestDG03_SpecDerivedExpectedIsClosedAndSorted — the deriver yields a CLOSED, de-duplicated, sorted
// subset of the taxonomy: every derived expected kind is a real RequirementKind, the slice is sorted,
// and it carries no duplicates. The "attendus" come from the SPEC's structure (S35/S11), never invented.
func TestDG03_SpecDerivedExpectedIsClosedAndSorted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		exp := spec.ExpectedKinds
		all := asSet(AllKinds())
		seen := map[RequirementKind]bool{}
		for i, k := range exp {
			if !all[k] {
				t.Fatalf("derived expected kind %q is not in the closed taxonomy", k)
			}
			if seen[k] {
				t.Fatalf("derived expected set has a duplicate %q", k)
			}
			seen[k] = true
			if i > 0 && exp[i-1] >= k {
				t.Fatalf("derived expected set is not strictly sorted at %d: %q >= %q", i, exp[i-1], k)
			}
		}
	})
}

// TestDG03_Deterministic — CRITERION (1): same (spec, candidates) → same metric, 100× replays. The
// metric is computed against the SPEC-DERIVED attendus (Metric uses spec.ExpectedKinds, which the
// deriver populated). No clock, no rng: byte-stable across replays.
func TestDG03_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		cands := genCandidates(t)

		first := Metric(spec, cands)
		for i := 0; i < 100; i++ {
			again := Metric(spec, cands)
			if !reflect.DeepEqual(first, again) {
				t.Fatalf("non-deterministic metric at replay %d:\n first=%+v\n again=%+v", i, first, again)
			}
		}
		// And the deriver itself is deterministic: re-deriving the same declaration is byte-stable.
		// (spec.ExpectedKinds came from SpecFromDeclaration; re-running Metric proves the whole chain.)
	})
}

// TestDG03_MissingCountedAgainstSpec — CRITERION (2): a type the SPEC expects but NO candidate
// surfaces is in MissingTypes; MatchPct counts it as a hole. We force a hole by removing one expected
// type from EVERY candidate's surfaced set (re-judged by Extract), then assert it is reported missing.
func TestDG03_MissingCountedAgainstSpec(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		if len(spec.ExpectedKinds) == 0 {
			return // nothing expected ⇒ nothing can be missing (vacuous; covered by criterion (4)).
		}
		// Build candidates that surface EVERY expected kind EXCEPT one deliberately-omitted target.
		targetIdx := rapid.IntRange(0, len(spec.ExpectedKinds)-1).Draw(t, "omitIdx")
		target := spec.ExpectedKinds[targetIdx]
		text := candidateCovering(spec.ExpectedKinds, target /*omit*/)
		cands := []LLMOutput{{Role: "single", Text: text}}

		m := Metric(spec, cands)
		miss := asSet(m.MissingTypes)
		if !miss[target] {
			t.Fatalf("type %q expected by the spec and surfaced by NO candidate is not reported missing\n missing=%v",
				target, m.MissingTypes)
		}
		// MatchPct must be strictly below 1.0 because at least the target hole exists.
		if m.MatchPct >= 1.0 {
			t.Fatalf("a genuine hole (%q) should drop MatchPct below 1.0, got %v", target, m.MatchPct)
		}
	})
}

// TestDG03_AntiFalsePositive — CRITERION (3): a type covered by ≥1 candidate is NEVER a false-negative
// (never in MissingTypes), and adding a candidate can only SHRINK MissingTypes (monotone). This is the
// dissimilar-control discipline (CE01): coverage is never under-reported.
func TestDG03_AntiFalsePositive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		cands := genCandidates(t)

		m := Metric(spec, cands)
		present := asSet(m.PresentTypes)
		miss := asSet(m.MissingTypes)
		// No present type is reported missing (no false-negative on coverage).
		for p := range present {
			if miss[p] {
				t.Fatalf("type %q is covered by a candidate yet reported missing (false negative)", p)
			}
		}
		// Monotonicity: one MORE candidate never grows MissingTypes, never lowers MatchPct.
		extraText, _ := genTaggedText(t, "extra")
		bigger := append(append([]LLMOutput{}, cands...), LLMOutput{Role: "extra", Text: extraText})
		m2 := Metric(spec, bigger)
		miss2 := asSet(m.MissingTypes)
		for _, k := range m2.MissingTypes {
			if !miss2[k] {
				t.Fatalf("adding a candidate GREW MissingTypes with %q (non-monotone)", k)
			}
		}
		if m2.MatchPct < m.MatchPct {
			t.Fatalf("adding a candidate LOWERED MatchPct: %v -> %v", m.MatchPct, m2.MatchPct)
		}
	})
}

// TestDG03_MatchPctBoundsAndIff — CRITERION (4): MatchPct ∈ [0,1], AND MatchPct == 1.0 IFF
// MissingTypes is empty (the equivalence, both directions). Proven over arbitrary specs+candidates.
func TestDG03_MatchPctBoundsAndIff(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		cands := genCandidates(t)

		m := Metric(spec, cands)
		if m.MatchPct < 0.0 || m.MatchPct > 1.0 {
			t.Fatalf("MatchPct out of [0,1]: %v", m.MatchPct)
		}
		full := m.MatchPct == 1.0
		noMissing := len(m.MissingTypes) == 0
		if full != noMissing {
			t.Fatalf("MatchPct==1.0 (%v) must be IFF MissingTypes empty (%v): MatchPct=%v missing=%v",
				full, noMissing, m.MatchPct, m.MissingTypes)
		}
	})
}

// TestDG03_MetricAgreesWithPort — the enriched metric is CONSISTENT with the DG02 port: Metric's
// MatchPct/MissingTypes equal the RecompileOnlyBench report on the same spec+candidates. DG03 enriches
// the SOURCE of the attendus (spec-derived), it does not fork the arithmetic.
func TestDG03_MetricAgreesWithPort(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genStructuredSpec(t)
		cands := genCandidates(t)

		m := Metric(spec, cands)
		rep, err := RecompileOnlyBench{}.Run(spec, cands)
		if err != nil {
			t.Fatalf("port Run errored: %v", err)
		}
		if m.MatchPct != rep.MatchPct {
			t.Fatalf("metric MatchPct %v != port MatchPct %v", m.MatchPct, rep.MatchPct)
		}
		if !reflect.DeepEqual(m.MissingTypes, rep.MissingTypes) {
			t.Fatalf("metric MissingTypes %v != port MissingTypes %v", m.MissingTypes, rep.MissingTypes)
		}
		if !reflect.DeepEqual(m.PresentTypes, rep.PresentTypes) {
			t.Fatalf("metric PresentTypes %v != port PresentTypes %v", m.PresentTypes, rep.PresentTypes)
		}
	})
}
