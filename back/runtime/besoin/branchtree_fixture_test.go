package besoin

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// branchtree_fixture_test.go — the EL12 mirror (the per-level Example-Mapping decision tree + the
// schema-mismatch altitude classification), fixture-table form, written RED FIRST (CLAUDE.md
// Mandat A). The behaviour proven, on three pure total functions the LLM never enters:
//
//   - BranchTree(level, body) → []OpenBranch: an INCOMPLETE body leaves ≥1 branch OPEN; a COMPLETE
//     body closes EVERY branch. The branch set is sourced from the SAME EL06 thresholds + per-rung
//     parse rules EL07 reads — never a second inlined copy.
//   - IsResolved(graph, level, meta) → ResolveVerdict: resolved iff every branch closed AND the
//     anti-vacuity branch satisfied (EL07.e); the verdict annexes the node's EL04 truth_kind +
//     verifiability.
//   - ClassifyAltitude / IsOffAltitude: an OFF-ALTITUDE body (an entity `attributes` body submitted
//     AT `product`) FAILS the product schema — a declared field-set MISMATCH, not an LLM opinion.
//
// These fixtures are the /goal red set for EL12: code only to make them green.

// --- branch-per-level helpers -------------------------------------------------------------------

// completeBodyFor returns a body that closes EVERY branch of `level` (required fields non-empty,
// parse rule satisfied, anti-vacuity narrowed for a source rung). The canonical per-rung "right
// shape" — the same shapes candescend_fixture_test uses.
func completeBodyFor(level Level) map[string]any {
	switch level {
	case LevelProduct:
		return map[string]any{
			"intent":    "Un suivi de tâches simple",
			"scenarios": []any{"créer une tâche", "cocher une tâche"},
			"selects":   []any{"onboarding", "core-task"}, // narrows product→journey OptionSpace
		}
	case LevelJourney:
		return map[string]any{
			"gherkin": "Given une tâche\nWhen je la coche\nThen elle est faite",
			"selects": []any{"list", "detail"}, // narrows journey→view
		}
	case LevelView:
		return map[string]any{
			"goal":    "lister les tâches",
			"zones":   []any{"header", "liste"},
			"data":    []any{"tasks"},
			"selects": []any{"submit", "navigate"}, // narrows view→control
		}
	case LevelControl:
		return map[string]any{
			"visible_when": true,
			"enabled_when": true,
			"triggers":     "action:toggleTask@v1",
			"selects":      []any{"command"}, // narrows control→action
		}
	case LevelAction:
		return map[string]any{
			"invoke":  "operation:toggleTask@v1",
			"selects": []any{"update"}, // narrows action→operation
		}
	case LevelOperation:
		return map[string]any{
			"steps":   []any{"load", "toggle", "save"},
			"fixture": map[string]any{"state": "open", "cmd": "toggle", "events": []any{"toggled"}},
			// operation→entity is the declared non-enumerable pair: anti-vacuity is satisfied-by-
			// OpenQuestion (no `selects` needed — the forward dep is carried, never fabricated).
		}
	case LevelEntity:
		return map[string]any{
			"attributes": []any{"id", "title", "done"},
		}
	case LevelInvariant:
		return map[string]any{
			"statement": "∀ tâche cochée, elle reste cochée jusqu'à décochage",
		}
	case LevelPolicy:
		return map[string]any{
			"rule": "seul le propriétaire peut cocher sa tâche",
		}
	}
	return map[string]any{}
}

// --- (1) per-level: an incomplete body leaves ≥1 branch open ------------------------------------

// For EVERY grammar level, an EMPTY body leaves at least one branch OPEN (the level is not
// right-sized). The decision tree is never empty for a grammar level.
func TestBranchTree_EmptyBody_LeavesBranchesOpen(t *testing.T) {
	for _, l := range AllLevels() {
		tree := BranchTree(l, map[string]any{})
		if len(tree) == 0 {
			t.Fatalf("level %s: a grammar level must carry a non-empty decision tree", l)
		}
		open := openOnly(tree)
		if len(open) == 0 {
			t.Fatalf("level %s: an empty body must leave ≥1 branch OPEN, got 0 open of %d", l, len(tree))
		}
		// Every open branch must carry an actionable how_to_fix (BlockReason-grade).
		for _, b := range open {
			if len(b.HowToFix) == 0 {
				t.Fatalf("level %s: open branch %q must carry how_to_fix", l, b.Field)
			}
		}
	}
}

// A product body MISSING the `scenarios` field leaves its required-field branch OPEN (the precise
// branch, not just "some branch").
func TestBranchTree_MissingRequiredField_LeavesThatBranchOpen(t *testing.T) {
	body := map[string]any{"intent": "un truc"} // scenarios missing
	tree := BranchTree(LevelProduct, body)
	found := false
	for _, b := range tree {
		if b.Kind == BranchRequiredField && b.Field == "scenarios" {
			found = true
			if b.Closed {
				t.Fatalf("scenarios branch must be OPEN when scenarios missing")
			}
		}
	}
	if !found {
		t.Fatalf("product tree must carry a required-field branch for `scenarios`")
	}
}

// --- (2) per-level: a complete body closes every branch -----------------------------------------

// For EVERY grammar level, the canonical complete body closes EVERY branch — no branch left open.
func TestBranchTree_CompleteBody_ClosesAllBranches(t *testing.T) {
	for _, l := range AllLevels() {
		tree := BranchTree(l, completeBodyFor(l))
		open := openOnly(tree)
		if len(open) != 0 {
			t.Fatalf("level %s: complete body must close ALL branches, still open: %+v", l, open)
		}
	}
}

// IsResolved over a graph with a complete, fully-metadata'd product node is RESOLVED and carries the
// EL04 truth_kind annex; anti-vacuity is satisfied.
func TestIsResolved_CompleteProduct_Resolved(t *testing.T) {
	n := LevelNode{
		Level:      LevelProduct,
		Body:       mustBody(t, completeBodyFor(LevelProduct)),
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "je veux suivre mes tâches"},
		Status:     NodeResolved,
	}
	g, err := NewGraph("demo").AddNode(n)
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	v := IsResolved(g, LevelProduct, fullMeta())
	if !v.Resolved {
		t.Fatalf("complete product must be resolved; open=%+v", v.OpenBranches)
	}
	if !v.AntiVacuitySatisfied {
		t.Fatalf("complete product must satisfy anti-vacuity")
	}
	if v.TruthKind != truthtyping.KindBehavioral {
		t.Fatalf("verdict must annex the EL04 truth_kind, got %q", v.TruthKind)
	}
}

// IsResolved over a missing node is NOT resolved (an empty rung leaves every branch open) — and it
// still surfaces the OPEN branches so the interview is legible.
func TestIsResolved_NoNode_NotResolved(t *testing.T) {
	g := NewGraph("demo")
	v := IsResolved(g, LevelProduct, Metadata{})
	if v.Resolved {
		t.Fatalf("a level with no node must NOT be resolved")
	}
	if len(v.OpenBranches) == 0 {
		t.Fatalf("an absent node must still surface its open branches")
	}
}

// ANTI-VACUITY (EL07.e): a product that parses (intent + scenario) but SELECTS no journey archetype
// leaves the anti-vacuity branch OPEN → not resolved (a body that constrains nothing is rejected).
func TestIsResolved_ParsableButNonConstraining_NotResolved(t *testing.T) {
	n := LevelNode{
		Level: LevelProduct,
		Body: mustBody(t, map[string]any{
			"intent":    "un truc",
			"scenarios": []any{"créer"},
			"selects":   []any{}, // narrows nothing
		}),
		Refs:       []Ref{{Field: "journeys", To: LevelJourney}},
		Provenance: Provenance{Source: "human", Detail: "x"},
		Status:     NodeDrafting,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := IsResolved(g, LevelProduct, fullMeta())
	if v.Resolved {
		t.Fatalf("a parsable-but-non-constraining product must NOT be resolved (anti-vacuity)")
	}
	if v.AntiVacuitySatisfied {
		t.Fatalf("anti-vacuity must be UNsatisfied when nothing is narrowed")
	}
}

// The operation→entity declared NON-enumerable pair: a complete operation body has its anti-vacuity
// branch satisfied-by-OpenQuestion (the forward dependency is carried, never fabricated to 0).
func TestIsResolved_OperationForwardDep_AntiVacuityCarried(t *testing.T) {
	n := LevelNode{
		Level:      LevelOperation,
		Body:       mustBody(t, completeBodyFor(LevelOperation)),
		Refs:       []Ref{{Field: "mutate", To: LevelEntity}},
		Provenance: Provenance{Source: "human", Detail: "x"},
		Status:     NodeResolved,
	}
	g, _ := NewGraph("demo").AddNode(n)
	v := IsResolved(g, LevelOperation, fullMeta())
	if !v.AntiVacuitySatisfied {
		t.Fatalf("operation→entity (non-enumerable) anti-vacuity must be carried as satisfied")
	}
	if !v.Resolved {
		t.Fatalf("complete operation must be resolved; open=%+v", v.OpenBranches)
	}
}

// --- (3) altitude classification by schema-mismatch ---------------------------------------------

// THE canonical EL12 example: an entity `attributes` body submitted AT `product` FAILS the product
// schema (off-altitude) and is classified at `entity` — a declared field-set mismatch, not an LLM
// opinion of altitude.
func TestClassifyAltitude_EntityBodyAtProduct_OffAltitude(t *testing.T) {
	entityBody := map[string]any{"attributes": []any{"id", "title"}}

	if !IsOffAltitude(LevelProduct, entityBody) {
		t.Fatalf("an entity body submitted at `product` must be OFF-ALTITUDE (fails product schema)")
	}
	if MatchesSchema(LevelProduct, entityBody) {
		t.Fatalf("entity body must NOT match the product schema (intent+scenarios required)")
	}
	a := ClassifyAltitude(entityBody)
	if !a.Matched {
		t.Fatalf("an entity body must match SOME level's schema")
	}
	if a.Best != LevelEntity {
		t.Fatalf("an entity `attributes` body must classify at `entity`, got %q", a.Best)
	}
}

// A correctly-shaped product body is ON-altitude at product and classifies at product.
func TestClassifyAltitude_ProductBody_OnAltitude(t *testing.T) {
	body := completeBodyFor(LevelProduct)
	if IsOffAltitude(LevelProduct, body) {
		t.Fatalf("a well-shaped product body must be ON-altitude at product")
	}
	if !MatchesSchema(LevelProduct, body) {
		t.Fatalf("product body must match product schema")
	}
	// It also matches `entity`? No — it carries no `attributes`. So Best is product.
	a := ClassifyAltitude(body)
	if a.Best != LevelProduct {
		t.Fatalf("a product body must classify at `product`, got %q (scores=%v)", a.Best, a.Scores)
	}
}

// A body matching NO level's full schema is Matched=false (it belongs to no rung) — never guessed.
func TestClassifyAltitude_NoSchema_Unmatched(t *testing.T) {
	a := ClassifyAltitude(map[string]any{"garbage": "noise"})
	if a.Matched {
		t.Fatalf("a body matching no schema must be Matched=false, got Best=%q", a.Best)
	}
}

// MatchesSchema fail-closes on a non-grammar level (no schema to match).
func TestMatchesSchema_NonGrammarLevel_FailClosed(t *testing.T) {
	if MatchesSchema(Level("nonsense"), map[string]any{"x": 1}) {
		t.Fatalf("a non-grammar level has no schema → must fail-close to false")
	}
}
