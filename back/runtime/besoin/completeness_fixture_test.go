package besoin

import (
	"encoding/json"
	"testing"
)

// completeness_fixture_test.go — the EL09 BDD mirror (fixture + FAULT-INJECTION form), written RED
// first. It proves the done-criteria: breaking the node↔level-mirror link in EITHER direction turns
// BesoinCompleteness RED (a monster appears); monster detection is a PURE function (no LLM); no real
// mirror is written; everything is above the wall.

// elMeta is the complete four-metadata set a resolved node certifies with (gate b passes). It reuses
// fullMeta() (the EL07 fixture helper) so EL09 and EL07 share one declared metadata source.
func elMeta() Metadata { return fullMeta() }

// el09ResolvedProduct builds a graph with a single RESOLVED product node carrying a parsable body.
func el09ResolvedProduct(t *testing.T) BesoinGraph {
	t.Helper()
	body, err := json.Marshal(map[string]any{"intent": "x", "scenarios": []string{"s1"}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	g, err := NewGraph("p").AddNode(LevelNode{
		Level: LevelProduct, Body: body, Status: NodeResolved,
		Provenance: Provenance{Source: "human", Detail: "u"},
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	return g
}

// productMirror is the well-formed level-mirror reflecting a resolved product (Gherkin N0).
func productMirror() BesoinLevelMirror {
	return BesoinLevelMirror{Reflects: LevelProduct, Form: MirrorGherkinN0}
}

func meta1(l Level) map[Level]Metadata { return map[Level]Metadata{l: elMeta()} }

// GREEN baseline: a resolved node WITH its right-form level-mirror + live metadata → complete, no monster.
func TestEL09_Complete_WhenLinkIntact(t *testing.T) {
	g := el09ResolvedProduct(t)
	rep := BesoinCompleteness(g, []BesoinLevelMirror{productMirror()}, meta1(LevelProduct))
	if !rep.Complete {
		t.Fatalf("want complete, got monsters %+v", rep.Monsters)
	}
	if len(rep.Monsters) != 0 {
		t.Fatalf("want 0 monsters, got %d", len(rep.Monsters))
	}
}

// FAULT-INJECTION direction 1 — break the link by REMOVING the mirror of a resolved node:
// NEED_LEVEL_WITHOUT_MIRROR appears (the detector goes red).
func TestEL09_FaultInjection_NodeWithoutMirror(t *testing.T) {
	g := el09ResolvedProduct(t)
	rep := BesoinCompleteness(g, nil /* no mirrors */, meta1(LevelProduct))
	if rep.Complete {
		t.Fatal("breaking node→mirror link must turn red, got complete")
	}
	if !hasMonster(rep, CodeNeedLevelWithoutMirror) {
		t.Fatalf("want NEED_LEVEL_WITHOUT_MIRROR, got %+v", rep.Monsters)
	}
}

// FAULT-INJECTION direction 2 — break the link by adding a level-mirror that reflects NO resolved node:
// ORPHAN_NEED_MIRROR appears (the detector goes red the other way).
func TestEL09_FaultInjection_OrphanMirror(t *testing.T) {
	g := el09ResolvedProduct(t)
	mirrors := []BesoinLevelMirror{
		productMirror(),
		{Reflects: LevelEntity, Form: MirrorPropertyN1}, // reflects entity, but no entity node exists.
	}
	rep := BesoinCompleteness(g, mirrors, meta1(LevelProduct))
	if rep.Complete {
		t.Fatal("an orphan mirror must turn red, got complete")
	}
	if !hasMonster(rep, CodeOrphanNeedMirror) {
		t.Fatalf("want ORPHAN_NEED_MIRROR, got %+v", rep.Monsters)
	}
}

// A level-mirror reflecting a node that is DRAFTING (not resolved) is also an orphan (it reflects no
// need-truth yet).
func TestEL09_FaultInjection_MirrorReflectsDraftingNode(t *testing.T) {
	body, _ := json.Marshal(map[string]any{"intent": "x"})
	g, err := NewGraph("p").AddNode(LevelNode{
		Level: LevelProduct, Body: body, Status: NodeDrafting,
		Provenance: Provenance{Source: "human", Detail: "u"},
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	rep := BesoinCompleteness(g, []BesoinLevelMirror{productMirror()}, nil)
	if rep.Complete {
		t.Fatal("a mirror reflecting a drafting node must turn red")
	}
	if !hasMonster(rep, CodeOrphanNeedMirror) {
		t.Fatalf("want ORPHAN_NEED_MIRROR for drafting node, got %+v", rep.Monsters)
	}
}

// FAULT-INJECTION — the link exists but is MIS-SHAPED: the level-mirror carries the wrong MirrorForm.
func TestEL09_FaultInjection_WrongForm(t *testing.T) {
	g := el09ResolvedProduct(t)
	wrong := BesoinLevelMirror{Reflects: LevelProduct, Form: MirrorPropertyN1} // product wants Gherkin N0.
	rep := BesoinCompleteness(g, []BesoinLevelMirror{wrong}, meta1(LevelProduct))
	if rep.Complete {
		t.Fatal("a wrong-form level-mirror must turn red")
	}
	if !hasMonster(rep, CodeNeedMirrorWrongForm) {
		t.Fatalf("want NEED_MIRROR_WRONG_FORM, got %+v", rep.Monsters)
	}
}

// FAULT-INJECTION — a resolved node whose four metadata DISAPPEARED is a monster.
func TestEL09_FaultInjection_MetadataDisappeared(t *testing.T) {
	g := el09ResolvedProduct(t)
	// Pass empty metadata for the resolved product → CertifyMetadata reports incomplete → monster.
	rep := BesoinCompleteness(g, []BesoinLevelMirror{productMirror()}, map[Level]Metadata{})
	if rep.Complete {
		t.Fatal("a resolved node with vanished metadata must turn red")
	}
	if !hasMonster(rep, CodeNeedLevelMetadataDisappeared) {
		t.Fatalf("want NEED_LEVEL_METADATA_DISAPPEARED, got %+v", rep.Monsters)
	}
}

// A resolved node correctly mirrored among MULTIPLE rungs is complete; an empty node carries no
// completeness obligation (only resolved rungs are need-truths).
func TestEL09_EmptyNode_NoObligation(t *testing.T) {
	g := el09ResolvedProduct(t)
	// Add an EMPTY journey node (named but not declared): it must NOT require a mirror.
	g, err := g.AddNode(LevelNode{
		Level: LevelJourney, Status: NodeEmpty,
		Provenance: Provenance{Source: "human", Detail: "u"},
	})
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	rep := BesoinCompleteness(g, []BesoinLevelMirror{productMirror()}, meta1(LevelProduct))
	if !rep.Complete {
		t.Fatalf("an empty node carries no obligation; want complete, got %+v", rep.Monsters)
	}
}

// hasMonster reports whether the report carries a monster of the given code.
func hasMonster(rep CompletenessReport, code MonsterCode) bool {
	for _, m := range rep.Monsters {
		if m.Code == code {
			return true
		}
	}
	return false
}
