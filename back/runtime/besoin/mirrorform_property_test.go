package besoin

// mirrorform_property_test.go — EL10 reproducibility mirror for the LevelMirrorForm table and the new
// view/journey validators (CLAUDE.md §6/§8: same input → same output). All PURE properties:
//
//   1. LevelMirrorForm is TOTAL over the 9 grammar levels (every Level yields a known MirrorForm).
//   2. For the 5 rungs derive-mirror covers, LevelMirrorForm's output ≡ the derive-mirror oracle
//      (no fork: the table agrees with the skill it delegates to).
//   3. A non-Level yields ok=false (no fabricated form).
//   4. LevelMirrorForm is deterministic (same level → same form on re-evaluation).
//   5. The view validator FAILS on a body without named zones; the journey validator FAILS on a
//      non-Gherkin body; both PASS on a well-formed body. Determinism: same body → same verdict.

import (
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

// deriveMirrorOracle is the EXPECTED mirror form the skill derive-mirror yields for the 5 kernel rungs
// it covers (its SKILL.md: acceptance→Gherkin, invariant→property, workflow→fixture, contract/entity→
// property). EL10's LevelMirrorForm MUST agree with this for the covered rungs (no fork). Declared here
// as the test oracle, never read from the table under test.
func deriveMirrorOracle(l Level) (MirrorForm, bool) {
	switch l {
	case LevelEntity:
		return MirrorPropertyN1, true // entity contract → property/contract.
	case LevelPolicy:
		return MirrorFixtureN2, true // policy authorization → fixture.
	case LevelOperation:
		return MirrorFixtureN2, true // operation workflow → fixture (N2).
	case LevelControl:
		return MirrorFixtureN2, true // control → fixture.
	case LevelAction:
		return MirrorFixtureN2, true // action → fixture.
	default:
		return "", false
	}
}

// TestLevelMirrorForm_TotalOverGrammar — property (1): every grammar Level (the 7 source rungs + the 2
// bands = 9) yields a known MirrorForm.
func TestLevelMirrorForm_TotalOverGrammar(t *testing.T) {
	for _, l := range AllLevels() {
		f, ok := LevelMirrorForm(l)
		if !ok {
			t.Fatalf("LevelMirrorForm(%q): expected a form, got ok=false", l)
		}
		if !IsMirrorForm(f) {
			t.Fatalf("LevelMirrorForm(%q) = %q which is not a known MirrorForm", l, f)
		}
	}
}

// TestLevelMirrorForm_AgreesWithDeriveMirror — property (2): for the 5 derive-mirror-covered rungs, the
// table's output is IDENTICAL to the derive-mirror oracle (no fork). And DerivedMirrorCovers names
// exactly those 5 rungs.
func TestLevelMirrorForm_AgreesWithDeriveMirror(t *testing.T) {
	covered := 0
	for _, l := range AllLevels() {
		want, isCovered := deriveMirrorOracle(l)
		if DerivedMirrorCovers(l) != isCovered {
			t.Fatalf("DerivedMirrorCovers(%q)=%v but oracle covers=%v", l, DerivedMirrorCovers(l), isCovered)
		}
		if !isCovered {
			continue
		}
		covered++
		got, ok := LevelMirrorForm(l)
		if !ok || got != want {
			t.Fatalf("LevelMirrorForm(%q)=%q,ok=%v ; derive-mirror oracle wants %q (fork detected)", l, got, ok, want)
		}
	}
	if covered != 5 {
		t.Fatalf("expected derive-mirror to cover exactly 5 rungs, covered %d", covered)
	}
}

// TestLevelMirrorForm_NonLevelHasNoForm — property (3): a value outside the grammar yields no form.
func TestLevelMirrorForm_NonLevelHasNoForm(t *testing.T) {
	for _, bad := range []Level{"saga", "temporal", "globalinvariant", "nope", ""} {
		if _, ok := LevelMirrorForm(bad); ok {
			t.Fatalf("LevelMirrorForm(%q): expected ok=false for a non-Level", bad)
		}
	}
}

// TestLevelMirrorForm_Deterministic — property (4): same level → same form on re-evaluation (rapid).
func TestLevelMirrorForm_Deterministic(t *testing.T) {
	levels := AllLevels()
	rapid.Check(t, func(r *rapid.T) {
		l := levels[rapid.IntRange(0, len(levels)-1).Draw(r, "lvl")]
		f1, ok1 := LevelMirrorForm(l)
		f2, ok2 := LevelMirrorForm(l)
		if f1 != f2 || ok1 != ok2 {
			r.Fatalf("LevelMirrorForm(%q) not deterministic: (%q,%v) vs (%q,%v)", l, f1, ok1, f2, ok2)
		}
	})
}

// TestValidateViewSchema_Determinism — property (5a): same view body → same verdict (rapid over a few
// shapes), and the well-formed body validates while a zone-less body fails.
func TestValidateViewSchema_Determinism(t *testing.T) {
	bodies := [][]byte{
		[]byte(`{"goal":"voir le panier","zones":["entête","liste"],"data":["total"]}`), // valid
		[]byte(`{"goal":"voir le panier","zones":[],"data":["total"]}`),                 // no zones → invalid
		[]byte(`{"goal":"","zones":["x"],"data":["y"]}`),                                // empty goal → invalid
		[]byte(`{"zones":[{"name":"entête"}],"data":[{"name":"total"}],"goal":"g"}`),    // named objects → valid
	}
	rapid.Check(t, func(r *rapid.T) {
		b := bodies[rapid.IntRange(0, len(bodies)-1).Draw(r, "body")]
		r1 := ValidateViewSchema(json.RawMessage(b))
		r2 := ValidateViewSchema(json.RawMessage(b))
		if r1.Valid != r2.Valid {
			r.Fatalf("ValidateViewSchema not deterministic for %s: %v vs %v", b, r1.Valid, r2.Valid)
		}
	})
	if !ValidateViewSchema([]byte(`{"goal":"g","zones":["z"],"data":["d"]}`)).Valid {
		t.Fatal("a well-formed view (goal+named zones+data) must validate")
	}
	if ValidateViewSchema([]byte(`{"goal":"g","zones":[],"data":["d"]}`)).Valid {
		t.Fatal("a view without named zones must FAIL the new validator")
	}
}

// TestValidateJourneySchema_Determinism — property (5b): a parseable-Gherkin body validates; a
// free-text body without Given/When/Then fails; deterministic.
func TestValidateJourneySchema_Determinism(t *testing.T) {
	good := []byte(`{"gherkin":"Given un panier\nWhen je paie\nThen la commande existe"}`)
	bad := []byte(`{"gherkin":"je veux juste payer le panier sans étapes"}`)
	if !ValidateJourneySchema(good).Valid {
		t.Fatal("a parseable Gherkin journey must validate")
	}
	if ValidateJourneySchema(bad).Valid {
		t.Fatal("a non-Gherkin journey body must FAIL the new validator")
	}
	r1 := ValidateJourneySchema(good)
	r2 := ValidateJourneySchema(good)
	if r1.Valid != r2.Valid {
		t.Fatal("ValidateJourneySchema must be deterministic")
	}
}

// TestValidateLevelSchema_OnlyOwnsViewJourney — EL10 owns exactly view+journey (the two rungs with no
// Go backing pkg). Any other rung returns ok=false (validated elsewhere).
func TestValidateLevelSchema_OnlyOwnsViewJourney(t *testing.T) {
	owned := map[Level]bool{LevelView: true, LevelJourney: true}
	for _, l := range AllLevels() {
		_, ok := ValidateLevelSchema(l, []byte(`{}`))
		if ok != owned[l] {
			t.Fatalf("ValidateLevelSchema owns %q=%v, want %v", l, ok, owned[l])
		}
	}
}
