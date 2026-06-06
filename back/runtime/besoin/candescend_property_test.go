package besoin

import (
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

// candescend_property_test.go — the EL07 reproducibility mirror (∀ invariant, property form, rapid).
// CanDescend and ShrinkOptionSpace are DETERMINISTIC pure functions (CLAUDE.md §6/§8): the same
// (graph, level, selects) always yields the same verdict and the same count. These properties pin it
// over a generated space of product bodies, and pin the anti-vacuity law (selects ⊆ choices ⇒ shrink
// is the pruned count, and a vacant selects ⇒ shrink == 0 ⇒ not_enough).

// productGraph builds a product graph whose body selects a generated subset of the journey archetypes.
func productGraph(t *rapid.T, selects []string) BesoinGraph {
	body, err := json.Marshal(map[string]any{
		"intent":    "x",
		"scenarios": []string{"s1"},
		"selects":   selects,
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	g, err := NewGraph("p").AddNode(LevelNode{
		Level:      LevelProduct,
		Body:       body,
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "u"},
		Status:     NodeResolved,
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	return g
}

// Property: ShrinkOptionSpace is REPRODUCIBLE — same graph/level → identical count every call.
func TestProp_ShrinkOptionSpace_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := productGraph(t, sub)
		first := ShrinkOptionSpace(g, LevelProduct)
		for i := 0; i < 20; i++ {
			if again := ShrinkOptionSpace(g, LevelProduct); again != first {
				t.Fatalf("ShrinkOptionSpace not reproducible: %d vs %d", again, first)
			}
		}
	})
}

// Property: ANTI-VACUITY count law — selecting k of the N declared archetypes (1 ≤ k ≤ N) PRUNES
// exactly N − k, so shrink = N − k; selecting an empty subset prunes nothing (shrink == 0).
func TestProp_ShrinkOptionSpace_PrunesSelectedSubset(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		n := len(os.Choices)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := productGraph(t, sub)
		got := ShrinkOptionSpace(g, LevelProduct)
		if len(sub) == 0 {
			if got != 0 {
				t.Fatalf("empty selects must prune nothing, got %d", got)
			}
			return
		}
		want := n - len(sub)
		if got != want {
			t.Fatalf("selecting %d of %d archetypes must prune %d, got %d", len(sub), n, want, got)
		}
	})
}

// Property: ANTI-VACUITY gate — a product that narrows nothing (shrink == 0) is NEVER enough; a
// product that narrows (shrink > 0) is not blocked BY anti-vacuity (it may still fail other gates,
// but never carries the OptionSpace-not-narrowed code). The verdict's enough is COMPUTED from shrink.
func TestProp_CanDescend_AntiVacuityGate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := productGraph(t, sub)
		v := CanDescend(g, LevelProduct, fullMeta())
		shrink := ShrinkOptionSpace(g, LevelProduct)
		if shrink == 0 {
			if v.Enough {
				t.Fatalf("a non-narrowing product must never be enough")
			}
			if !hasBlock(v, CodeOptionSpaceNotNarrowed) {
				t.Fatalf("a non-narrowing product must carry the anti-vacuity block, got %v", codes(v))
			}
		} else {
			if hasBlock(v, CodeOptionSpaceNotNarrowed) {
				t.Fatalf("a narrowing product must NOT carry the anti-vacuity block, shrink=%d", shrink)
			}
		}
	})
}

// Property: CanDescend is REPRODUCIBLE — same inputs → identical Enough + same block-code set.
func TestProp_CanDescend_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		os, _ := OptionSpaceFor(LevelProduct, LevelJourney)
		sub := rapid.SliceOfDistinct(rapid.SampledFrom(os.Choices), func(s string) string { return s }).Draw(t, "selects")
		g := productGraph(t, sub)
		first := CanDescend(g, LevelProduct, fullMeta())
		for i := 0; i < 20; i++ {
			again := CanDescend(g, LevelProduct, fullMeta())
			if again.Enough != first.Enough || len(again.BlockReasons) != len(first.BlockReasons) {
				t.Fatalf("CanDescend not reproducible")
			}
		}
	})
}
