package besoin

// mirrorform.go — the table LevelMirrorForm(level) → MirrorForm: the SHAPE of the level-mirror
// expected per rung. EL09 (BesoinCompleteness) consumes it to know, for every resolved LevelNode,
// what KIND of "miroir-de-niveau" must reflect it; EL10 fully formalizes the new validators
// (view/journey). Built HERE as the minimal table EL09's completeness gate needs (the honest input),
// because the completeness detector cannot ask "does this node have its mirror" without first knowing
// which mirror FORM the rung demands.
//
// WHY A NEW TABLE, NOT derive-mirror (ROADMAP EL09/EL10). The skill derive-mirror only knows the five
// KERNEL rungs entity/policy/operation/control/action (verified in its SKILL.md). The BesoinGraph also
// elicits product/journey/view — rungs derive-mirror does NOT cover. So:
//   - for the 5 rungs derive-mirror covers, this table carries the SAME form (zero fork, the property
//     mirror pins the agreement);
//   - for product/journey/view, it carries the freshly-declared form (Gherkin N0 / screen-fixture).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): LevelMirrorForm is a PURE TOTAL lookup over a hand-declared
// closed map — never an LLM judgment of "what mirror does this need". Same level → same form (the
// reproducibility property pins it). THE WALL: this annexes a FORM, it writes NO mirror (the real
// mirror is written below the line by the app-builder via /goal — CLAUDE.md §2 + ROADMAP).

// MirrorForm is the closed set of mirror shapes a level-mirror can take — the KRD three mirror forms
// (Gherkin N0 / property N1 / fixture N2) plus the two need-side screen forms for the NoEmit rungs.
type MirrorForm string

const (
	// MirrorGherkinN0 — a journey/acceptance mirror (Gherkin .feature, Godog/Playwright). product+journey.
	MirrorGherkinN0 MirrorForm = "gherkin_n0"
	// MirrorScreenFixture — a screen fixture (goal/zones/data) for the view rung (need-side, EL10).
	MirrorScreenFixture MirrorForm = "screen_fixture"
	// MirrorFixtureN2 — a workflow fixture (state→command→events) for control/action/operation.
	MirrorFixtureN2 MirrorForm = "fixture_n2"
	// MirrorPropertyN1 — a property/contract mirror for entity (∀) and the invariant band (N1).
	MirrorPropertyN1 MirrorForm = "property_n1"
)

// MirrorForms returns the closed set of mirror forms in canonical order. Never invented.
func MirrorForms() []MirrorForm {
	return []MirrorForm{MirrorGherkinN0, MirrorScreenFixture, MirrorFixtureN2, MirrorPropertyN1}
}

// IsMirrorForm reports whether f is one of the closed mirror forms. Pure, total.
func IsMirrorForm(f MirrorForm) bool {
	for _, k := range MirrorForms() {
		if k == f {
			return true
		}
	}
	return false
}

// derivedMirrorCovers is the closed set of rungs the skill derive-mirror already covers (its
// SKILL.md: entity/policy/operation/control/action). For these, LevelMirrorForm carries the SAME form
// derive-mirror would — the property mirror pins the agreement (no fork). product/journey/view are
// NOT in this set: their form is freshly declared here (EL10).
var derivedMirrorCovers = map[Level]bool{
	LevelEntity:    true,
	LevelPolicy:    true,
	LevelOperation: true,
	LevelControl:   true,
	LevelAction:    true,
}

// DerivedMirrorCovers reports whether the skill derive-mirror already owns the mirror form of rung l
// (so LevelMirrorForm only DELEGATES for it, zero duplication). Pure, total.
func DerivedMirrorCovers(l Level) bool { return derivedMirrorCovers[l] }

// levelMirrorForms is the closed, total map from every grammar Level to its expected mirror FORM. For
// the 5 derive-mirror-covered rungs the form matches what derive-mirror yields (acceptance→Gherkin,
// invariant→property, workflow→fixture); for the 3 uncovered rungs (product/journey/view) the form is
// the freshly-declared need-side form. Declared, never learned (CLAUDE.md §8).
var levelMirrorForms = map[Level]MirrorForm{
	// SOURCE rungs.
	LevelProduct:   MirrorGherkinN0,     // product journey/acceptance (e2e) — NOT covered by derive-mirror.
	LevelJourney:   MirrorGherkinN0,     // the user journey, Gherkin N0 — NOT covered by derive-mirror.
	LevelView:      MirrorScreenFixture, // a screen fixture (goal+zones+data) — NOT covered by derive-mirror.
	LevelControl:   MirrorFixtureN2,     // control fixture — derive-mirror covered.
	LevelAction:    MirrorFixtureN2,     // action fixture — derive-mirror covered.
	LevelOperation: MirrorFixtureN2,     // operation workflow fixture (N2) — derive-mirror covered.
	LevelEntity:    MirrorPropertyN1,    // entity property/contract — derive-mirror covered.
	// Transversal bands.
	LevelInvariant: MirrorPropertyN1, // ∀ — always a property (never exemplified).
	LevelPolicy:    MirrorFixtureN2,  // policy authorization fixture — derive-mirror covered.
}

// LevelMirrorForm returns the expected mirror FORM of a grammar Level, and ok=false for a non-Level
// (out-of-grammar / out-of-scope — no form is fabricated for it). Totally defined over the 9 grammar
// levels. PURE, TOTAL. THE WALL: it annexes a form; it writes no mirror.
func LevelMirrorForm(l Level) (MirrorForm, bool) {
	f, ok := levelMirrorForms[l]
	if !ok {
		return "", false
	}
	return f, true
}
