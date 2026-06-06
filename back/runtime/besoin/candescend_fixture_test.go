package besoin

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// candescend_fixture_test.go — the EL07 mirror (the forcing gate), fixture-table form, written RED
// FIRST (CLAUDE.md Mandat A). The behaviour proven: CanDescend(graph, level) → Verdict is the PURE,
// TOTAL, DETERMINISTIC forcing function that computes `enough` (never declared by the user or the
// LLM — anti-Goodhart §8). A level is descendable iff:
//
//   (a) its body is statable AND NON-VACANT (per the rung's required fields + parse rules);
//   (b) its four metadata are present/certifiable (EL04 CertifyMetadata);
//   (c) its outgoing refs resolve @version (here: the ref field carries a resolved target);
//   (d) it contradicts no frozen anchor above (EL08 owns the cascade; EL07 sees only the graph);
//   (e) ANTI-VACUITY: ShrinkOptionSpace(graph, level) > 0 — a parsable level that does NOT narrow
//       the lower rung's OptionSpace is not_enough (a body that parses but constrains nothing is
//       REJECTED — anti-gaming).
//
// A gap toward a DEEPER level (forward dependency, bootstrap §6) is a CARRIED OpenQuestion with
// enough=true — never a blocking residual.
//
// The fixtures below are RED until candescend.go implements CanDescend / ShrinkOptionSpace.

// --- fixture helpers ----------------------------------------------------------------------------

// fullMeta is the four-metadata set a node needs to pass gate (b). Declared once, reused.
func fullMeta() Metadata {
	return Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal}, // explicitly global → active-truth rule passes.
	}
}

// mustBody marshals a body map to canonical JSON for a LevelNode.
func mustBody(t *testing.T, m map[string]any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	return raw
}

// productNode builds a product LevelNode whose body declares scenarios + intent and SELECTS journey
// archetypes (the constraint it imposes on the journey rung — the anti-vacuity narrowing).
func productNode(t *testing.T, scenarios []string, selects []string) LevelNode {
	t.Helper()
	return LevelNode{
		Level: LevelProduct,
		Body: mustBody(t, map[string]any{
			"intent":    "Un suivi de tâches simple",
			"scenarios": scenarios,
			"selects":   selects, // narrows OptionSpace(product→journey)
		}),
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "je veux suivre mes tâches"},
		Status:     NodeResolved,
	}
}

// --- (a)+(e): product anti-vacuity ---------------------------------------------------------------

// A product with ≤maxScenarios scenarios, an intent, four metadata, a resolved ref, AND that narrows
// the journey OptionSpace (selects a proper non-empty subset) is ENOUGH.
func TestCanDescend_ProductRightSized_Enough(t *testing.T) {
	n := productNode(t, []string{"créer une tâche", "cocher une tâche"}, []string{"onboarding", "core-task"})
	g, err := NewGraph("demo").AddNode(n)
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	v := CanDescend(g, LevelProduct, fullMeta())
	if !v.Enough {
		t.Fatalf("right-sized product must be enough; missing=%v blockReasons=%v", v.Missing, v.BlockReasons)
	}
	if ShrinkOptionSpace(g, LevelProduct) <= 0 {
		t.Fatalf("right-sized product must shrink the journey OptionSpace (>0), got %d", ShrinkOptionSpace(g, LevelProduct))
	}
}

// ANTI-GAMING: a product whose body PARSES (intent + a scenario) but SELECTS no journey archetype
// (OptionSpace unchanged) is not_enough — the anti-vacuity disjunct (e) fails even though (a) parses.
func TestCanDescend_ProductParsableButNonConstraining_NotEnough(t *testing.T) {
	n := productNode(t, []string{"créer une tâche"}, []string{}) // parses, but selects nothing.
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelProduct, fullMeta())
	if v.Enough {
		t.Fatalf("a parsable-but-non-constraining product must be not_enough (anti-vacuity)")
	}
	if ShrinkOptionSpace(g, LevelProduct) != 0 {
		t.Fatalf("a non-constraining product must not shrink the OptionSpace, got %d", ShrinkOptionSpace(g, LevelProduct))
	}
	if !hasBlock(v, CodeOptionSpaceNotNarrowed) {
		t.Fatalf("expected an OptionSpace-not-narrowed block reason, got %v", codes(v))
	}
}

// A product with MORE than maxScenarios scenarios is not_enough — gate (a) bounds the body by the
// SAME declared threshold EL06 owns (th.MaxScenarios, never an inlined 5).
func TestCanDescend_ProductTooManyScenarios_NotEnough(t *testing.T) {
	th := DefaultThresholds()
	scn := make([]string, th.MaxScenarios+1)
	for i := range scn {
		scn[i] = "scénario"
	}
	n := productNode(t, scn, []string{"onboarding"})
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelProduct, fullMeta())
	if v.Enough {
		t.Fatalf("a product over maxScenarios must be not_enough")
	}
	if !hasBlock(v, CodeBodyVacantOrMalformed) {
		t.Fatalf("expected a vacant/malformed-body block reason, got %v", codes(v))
	}
}

// --- (a): journey Gherkin parse ------------------------------------------------------------------

// A journey whose Gherkin is NON-PARSABLE is not_enough — gate (a) rejects an unparsable body.
func TestCanDescend_JourneyUnparsableGherkin_NotEnough(t *testing.T) {
	n := LevelNode{
		Level: LevelJourney,
		Body: mustBody(t, map[string]any{
			"gherkin": "ceci n'est pas du Gherkin", // no Given/When/Then
			"selects": []string{"list"},
		}),
		Refs:       []Ref{{Field: "views", To: LevelView}},
		Provenance: Provenance{Source: "human", Detail: "le parcours"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelJourney, fullMeta())
	if v.Enough {
		t.Fatalf("an unparsable Gherkin journey must be not_enough")
	}
	if !hasBlock(v, CodeBodyVacantOrMalformed) {
		t.Fatalf("expected a vacant/malformed-body block reason, got %v", codes(v))
	}
}

// A journey with parsable Gherkin (Given/When/Then) that narrows the view OptionSpace is ENOUGH.
func TestCanDescend_JourneyParsableGherkin_Enough(t *testing.T) {
	n := LevelNode{
		Level: LevelJourney,
		Body: mustBody(t, map[string]any{
			"gherkin": "Given une tâche\nWhen je la coche\nThen elle est terminée",
			"selects": []string{"list", "detail"},
		}),
		Refs:       []Ref{{Field: "views", To: LevelView}},
		Provenance: Provenance{Source: "human", Detail: "le parcours"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelJourney, fullMeta())
	if !v.Enough {
		t.Fatalf("a parsable, narrowing journey must be enough; missing=%v blocks=%v", v.Missing, codes(v))
	}
}

// --- (a): control triggers must resolve ----------------------------------------------------------

// A control with bool-typed visible_when/enabled_when but whose `triggers` does NOT resolve (no
// outgoing ref to an action) is not_enough — gate (c) the outgoing ref must resolve.
func TestCanDescend_ControlTriggersUnresolved_NotEnough(t *testing.T) {
	n := LevelNode{
		Level: LevelControl,
		Body: mustBody(t, map[string]any{
			"visible_when": true,
			"enabled_when": false,
			"triggers":     "", // does not resolve
			"selects":      []string{"submit"},
		}),
		Refs:       []Ref{}, // no resolved ref toward action
		Provenance: Provenance{Source: "human", Detail: "le bouton"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelControl, fullMeta())
	if v.Enough {
		t.Fatalf("a control whose triggers does not resolve must be not_enough")
	}
	if !hasBlock(v, CodeRefUnresolved) {
		t.Fatalf("expected an unresolved-ref block reason, got %v", codes(v))
	}
}

// A control with bool-typed conditions AND a resolving triggers ref that narrows the action
// OptionSpace is ENOUGH.
func TestCanDescend_ControlResolved_Enough(t *testing.T) {
	n := LevelNode{
		Level: LevelControl,
		Body: mustBody(t, map[string]any{
			"visible_when": true,
			"enabled_when": true,
			"triggers":     "submitTask",
			"selects":      []string{"command"},
		}),
		Refs:       []Ref{{Field: "triggers", To: LevelAction}},
		Provenance: Provenance{Source: "human", Detail: "le bouton"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelControl, fullMeta())
	if !v.Enough {
		t.Fatalf("a resolved control must be enough; missing=%v blocks=%v", v.Missing, codes(v))
	}
}

// A control whose visible_when is NOT bool-typed (a string) is not_enough — gate (a) requires the
// conditions bool-typed.
func TestCanDescend_ControlConditionNotBool_NotEnough(t *testing.T) {
	n := LevelNode{
		Level: LevelControl,
		Body: mustBody(t, map[string]any{
			"visible_when": "peut-être", // not a bool
			"enabled_when": true,
			"triggers":     "submitTask",
			"selects":      []string{"submit"},
		}),
		Refs:       []Ref{{Field: "triggers", To: LevelAction}},
		Provenance: Provenance{Source: "human", Detail: "le bouton"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelControl, fullMeta())
	if v.Enough {
		t.Fatalf("a control with a non-bool condition must be not_enough")
	}
	if !hasBlock(v, CodeBodyVacantOrMalformed) {
		t.Fatalf("expected a vacant/malformed-body block reason, got %v", codes(v))
	}
}

// --- (b): the four metadata ----------------------------------------------------------------------

// A right-sized product whose metadata is INCOMPLETE (missing truth_kind) is not_enough — gate (b).
func TestCanDescend_MissingMetadata_NotEnough(t *testing.T) {
	n := productNode(t, []string{"créer une tâche"}, []string{"onboarding"})
	g, _ := NewGraph("demo").AddNode(n)
	incomplete := Metadata{Verifiability: truthtyping.LevelDeterministic, Scope: scope.TruthScope{Region: scope.RegionGlobal}}
	v := CanDescend(g, LevelProduct, incomplete)
	if v.Enough {
		t.Fatalf("a node with incomplete metadata must be not_enough")
	}
	if !hasBlock(v, CodeMetadataIncomplete) {
		t.Fatalf("expected a metadata-incomplete block reason, got %v", codes(v))
	}
}

// --- forward dependency: deeper gap → carried OpenQuestion + enough=true -------------------------

// An operation declared BEFORE its entity exists (the entity is the user's open domain) is a FORWARD
// dependency: a CARRIED OpenQuestion with enough=true (bootstrap §6) — NEVER a blocking residual.
// operation→entity is the declared non-enumerable OptionSpace pair (EL06), so anti-vacuity (e) is
// satisfied-by-OpenQuestion, not failed.
func TestCanDescend_OperationForwardDepEntity_CarriedOpenQuestion(t *testing.T) {
	n := LevelNode{
		Level: LevelOperation,
		Body: mustBody(t, map[string]any{
			"steps":   []string{"valider", "persister"},
			"fixture": "state→cmd→events",
			"selects": []string{"create"},
		}),
		Refs:       []Ref{}, // entity does not exist yet — forward dependency.
		Provenance: Provenance{Source: "human", Detail: "l'opération"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := CanDescend(g, LevelOperation, fullMeta())
	if !v.Enough {
		t.Fatalf("a forward dep toward entity must be enough (carried OpenQuestion, bootstrap §6); blocks=%v", codes(v))
	}
	if len(v.OpenQuestions) == 0 {
		t.Fatalf("a forward dep toward entity must carry an OpenQuestion, got none")
	}
	if len(v.BlockReasons) != 0 {
		t.Fatalf("a forward dep must NOT produce blocking residuals, got %v", codes(v))
	}
}

// --- ShrinkOptionSpace reproducibility -----------------------------------------------------------

// ShrinkOptionSpace is a PURE COUNT: same graph + level → same integer, every time (determinism-first
// reproducibility). And for a non-enumerable pair (operation→entity) it is the OpenQuestion sentinel
// (>0 by convention so the forward dep does not fail anti-vacuity), never a fabricated narrowing.
func TestShrinkOptionSpace_Reproducible(t *testing.T) {
	n := productNode(t, []string{"créer une tâche"}, []string{"onboarding", "core-task"})
	g, _ := NewGraph("demo").AddNode(n)
	first := ShrinkOptionSpace(g, LevelProduct)
	for i := 0; i < 50; i++ {
		if again := ShrinkOptionSpace(g, LevelProduct); again != first {
			t.Fatalf("ShrinkOptionSpace not reproducible: %d vs %d", again, first)
		}
	}
	// product→journey has 7 declared archetypes; selecting 2 PRUNES the other 5 → shrink = 7 − 2 = 5.
	if first != 5 {
		t.Fatalf("selecting 2 of 7 journey archetypes prunes 5, got %d", first)
	}
}

// --- determinism: CanDescend reproducible --------------------------------------------------------

// CanDescend is reproducible: same (graph, level, metadata) → identical verdict every call.
func TestCanDescend_Reproducible(t *testing.T) {
	n := productNode(t, []string{"créer une tâche"}, []string{"onboarding"})
	g, _ := NewGraph("demo").AddNode(n)
	first := CanDescend(g, LevelProduct, fullMeta())
	for i := 0; i < 50; i++ {
		again := CanDescend(g, LevelProduct, fullMeta())
		if again.Enough != first.Enough || len(again.BlockReasons) != len(first.BlockReasons) || len(again.Missing) != len(first.Missing) {
			t.Fatalf("CanDescend not reproducible at iteration %d", i)
		}
	}
}

// CanDescend on a level ABSENT from the graph is not_enough with a node-absent block reason (total:
// never panics, never invents a body).
func TestCanDescend_AbsentNode_NotEnough(t *testing.T) {
	g := NewGraph("demo")
	v := CanDescend(g, LevelProduct, fullMeta())
	if v.Enough {
		t.Fatalf("an absent node cannot be enough")
	}
	if !hasBlock(v, CodeNodeAbsent) {
		t.Fatalf("expected a node-absent block reason, got %v", codes(v))
	}
}

// --- test-local helpers --------------------------------------------------------------------------

func hasBlock(v Verdict, code BesoinBlockCode) bool {
	for _, br := range v.BlockReasons {
		if BesoinBlockCode(br.Code) == code {
			return true
		}
	}
	return false
}

func codes(v Verdict) []string {
	out := make([]string, 0, len(v.BlockReasons))
	for _, br := range v.BlockReasons {
		out = append(out, string(br.Code))
	}
	return out
}
