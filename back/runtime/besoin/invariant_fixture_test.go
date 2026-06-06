package besoin

// invariant_fixture_test.go — EL14 fixture mirror: the band-completeness gate flags the MISSING
// crossing invariant/policy (the EL14 done-criterion "complétude flagge le manquant"). The need-side
// mirror of check-completeness for the LATERAL band: a `resolved` SOURCE rung that DECLARES it requires
// a crossing invariant but is crossed by NONE is a monster (NEED_LEVEL_MISSING_INVARIANT). Recording a
// band that crosses it makes the detector go GREEN. Fault-injection: removing the band re-reds it.

import (
	"encoding/json"
	"testing"
)

// resolvedNodeRequiringInvariant builds a resolved SOURCE-rung node that DECLARES it requires a
// crossing invariant (`requires_invariant: true`).
func resolvedNodeRequiringInvariant(level Level) LevelNode {
	body, _ := json.Marshal(map[string]any{"requires_invariant": true, "marker": "x"})
	return LevelNode{
		Level:      level,
		Body:       body,
		Status:     NodeResolved,
		Provenance: Provenance{Source: "human", Detail: "verbatim"},
	}
}

// TestBandCompleteness_FlagsMissingInvariant — a resolved operation node that requires a crossing
// invariant, with NO band, is flagged; recording a crossing invariant clears it.
func TestBandCompleteness_FlagsMissingInvariant(t *testing.T) {
	g := NewGraph("p")
	g, err := g.AddNode(resolvedNodeRequiringInvariant(LevelOperation))
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}

	// RED: no band crosses operation → a monster.
	report := BandCompleteness(g)
	if report.Complete {
		t.Fatal("expected the missing crossing invariant to be flagged")
	}
	if len(report.Monsters) != 1 || report.Monsters[0].Code != CodeLevelMissingInvariant || report.Monsters[0].Level != LevelOperation {
		t.Fatalf("expected one NEED_LEVEL_MISSING_INVARIANT at operation, got %+v", report.Monsters)
	}

	// GREEN: record an invariant attached at operation (it crosses operation + every rung above).
	bandBody, _ := json.Marshal(map[string]any{
		"statement":       "pour tout chemin, le solde reste ≥ 0",
		"attached_levels": []string{"operation"},
		"kind":            "path_independent",
	})
	g, err = g.AddNode(LevelNode{
		Level:      LevelInvariant,
		Body:       bandBody,
		Status:     NodeDrafting,
		Provenance: Provenance{Source: "human", Detail: "le solde ne descend jamais sous zéro"},
	})
	if err != nil {
		t.Fatalf("AddNode band: %v", err)
	}
	report = BandCompleteness(g)
	if !report.Complete {
		t.Fatalf("expected the crossing invariant to clear the monster, got %+v", report.Monsters)
	}
}

// TestBandCompleteness_HigherRungCoveredByLowerInvariant — a resolved `view` node requiring an
// invariant is covered by an invariant attached LOWER (at operation), because an invariant on operation
// crosses every rung above it (the lateral constraint upward). This pins CrossedLevels' upward reach.
func TestBandCompleteness_HigherRungCoveredByLowerInvariant(t *testing.T) {
	g := NewGraph("p")
	g, _ = g.AddNode(resolvedNodeRequiringInvariant(LevelView))
	bandBody, _ := json.Marshal(map[string]any{
		"statement":       "toujours, P implique Q sur tout chemin",
		"attached_levels": []string{"operation"}, // attached LOW, crosses up to product.
		"kind":            "path_independent",
	})
	g, _ = g.AddNode(LevelNode{
		Level:      LevelInvariant,
		Body:       bandBody,
		Status:     NodeDrafting,
		Provenance: Provenance{Source: "human", Detail: "verbatim"},
	})
	report := BandCompleteness(g)
	if !report.Complete {
		t.Fatalf("an invariant on operation must cover the higher `view` rung it crosses, got %+v", report.Monsters)
	}
}

// TestBandCompleteness_NodeNotRequiringInvariantNotFlagged — a resolved node that does NOT declare it
// requires an invariant is never flagged (the flag is a declared opt-in, never an inferred LLM "should").
func TestBandCompleteness_NodeNotRequiringInvariantNotFlagged(t *testing.T) {
	g := NewGraph("p")
	body, _ := json.Marshal(map[string]any{"marker": "x"}) // no requires_invariant.
	g, _ = g.AddNode(LevelNode{Level: LevelEntity, Body: body, Status: NodeResolved, Provenance: Provenance{Source: "human", Detail: "v"}})
	report := BandCompleteness(g)
	if !report.Complete {
		t.Fatalf("a node not requiring an invariant must not be flagged, got %+v", report.Monsters)
	}
}

// TestRecordInvariant_OffAltitudeLeavesGraphUnchanged — an ∃ (example) refusal leaves the graph_hash
// unchanged (no record on a refused turn).
func TestRecordInvariant_OffAltitudeLeavesGraphUnchanged(t *testing.T) {
	g := NewGraph("p")
	before, _ := g.Hash()
	res := RecordInvariant(g, map[string]any{
		"statement":       "par exemple, la commande #3 est payée",
		"attached_levels": []any{"operation"},
	}, "verbatim", false, bandMeta())
	if res.Recorded {
		t.Fatal("an ∃ must not record")
	}
	after, _ := res.Graph.Hash()
	if before != after {
		t.Fatal("a refused turn must leave the graph_hash unchanged")
	}
}
