package besoin

// validators.go — EL10: the NEW deterministic SCHEMA VALIDATORS for the two above-the-wall rungs that
// have NO backing Go package (verified: back/kernel/{view,journey} are absent). The skills view/action
// ASSIST the elicitation dialogue; they DO NOT provide the deterministic validator. EL10 builds it here.
//
// WHY HERE, NOT derive-mirror (ROADMAP EL10). derive-mirror only knows the five kernel rungs
// entity/policy/operation/control/action. The BesoinGraph also elicits product/journey/view — and
// view/journey have no Go pkg to validate their body shape. So EL10 carries:
//   - ValidateViewSchema    — view body = goal + named zones + named data (the spec-écran shape, S10/view skill);
//   - ValidateJourneySchema — journey body = parseable Gherkin (≥1 Given/When/Then).
//
// SINGLE SOURCE OF TRUTH (determinism-first, no fork). EL07's CanDescend body-parse for journey/view is
// re-expressed in terms of THESE exported validators (candescend.go delegates), so there is exactly ONE
// view-schema rule and ONE journey-schema rule in the codebase — never two drifting copies.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): both validators are PURE TOTAL functions of the body alone — a
// structural check (field present? zones named? Given/When/Then present?), never an LLM judgment of "is
// this a good view". Same body → same verdict (the reproducibility property pins it). THE WALL: a
// validator reads a body and returns a verdict; it writes no truth and no mirror.

import (
	"encoding/json"
	"strings"
)

// SchemaResult is the PURE verdict of a level-schema validator: Valid, plus the missing/malformed field
// path and a human reason when invalid (a wall names the door — empty when Valid).
type SchemaResult struct {
	// Valid is true iff the body satisfies the rung's declared schema.
	Valid bool `json:"valid"`
	// Field is the offending body field path when invalid ("" when Valid).
	Field string `json:"field,omitempty"`
	// Reason is the human-readable explanation when invalid ("" when Valid).
	Reason string `json:"reason,omitempty"`
}

func schemaOK() SchemaResult { return SchemaResult{Valid: true} }

func schemaFail(field, reason string) SchemaResult {
	return SchemaResult{Valid: false, Field: field, Reason: reason}
}

// ValidateViewSchema validates a `view` rung body against the freshly-declared screen schema (EL10):
// a view MUST carry a non-empty goal, a non-empty NAMED set of zones, and a non-empty NAMED set of
// data. "Named" means each zone/datum is a non-empty string (a zone called "" is not a zone). A body
// that parses but lists no zones FAILS — the dedicated validator, not an LLM. Pure, total.
func ValidateViewSchema(body json.RawMessage) SchemaResult {
	m, err := decodeBody(body)
	if err != nil {
		return schemaFail("body", "Le corps du view n'est pas un JSON objet parsable.")
	}
	if isEmptyField(m["goal"]) {
		return schemaFail("body:goal", "Le view doit déclarer un `goal` (le but de l'écran) non vide.")
	}
	if zones := namedList(m["zones"]); len(zones) == 0 {
		return schemaFail("body:zones", "Le view doit déclarer au moins une `zone` nommée (un écran sans zone n'est pas un écran).")
	}
	if data := namedList(m["data"]); len(data) == 0 {
		return schemaFail("body:data", "Le view doit déclarer au moins une donnée affichée nommée (`data`).")
	}
	return schemaOK()
}

// ValidateJourneySchema validates a `journey` rung body against the journey schema (EL10): a journey
// MUST carry a parseable Gherkin scenario — at least one Given AND one When AND one Then. A free-text
// blob with no Given/When/Then FAILS. The same structural rule EL07 uses (isParsableGherkin), exported
// here as the dedicated validator. Pure, total, deterministic.
func ValidateJourneySchema(body json.RawMessage) SchemaResult {
	m, err := decodeBody(body)
	if err != nil {
		return schemaFail("body", "Le corps du journey n'est pas un JSON objet parsable.")
	}
	g := asString(m["gherkin"])
	if strings.TrimSpace(g) == "" {
		return schemaFail("body:gherkin", "Le journey doit déclarer un champ `gherkin` non vide.")
	}
	if !isParsableGherkin(g) {
		return schemaFail("body:gherkin", "Le Gherkin du journey n'est pas parsable (il faut au moins un Given/When/Then).")
	}
	return schemaOK()
}

// ValidateLevelSchema dispatches to the dedicated EL10 validator for the rungs EL10 owns
// (view/journey). For any other rung it returns ok=false (EL10 only owns the two above-the-wall rungs
// that lack a Go backing package; the rest are validated by their own pkgs / EL07 body-parse). Pure.
func ValidateLevelSchema(level Level, body json.RawMessage) (SchemaResult, bool) {
	switch level {
	case LevelView:
		return ValidateViewSchema(body), true
	case LevelJourney:
		return ValidateJourneySchema(body), true
	default:
		return SchemaResult{}, false
	}
}

// namedList decodes a body field that is a JSON list (of strings or of {name:...} objects) into the
// set of non-empty NAMES it carries. A list element that is an empty string, or an object whose `name`
// is empty/absent, contributes no name. Pure — the deterministic "is it named" rule.
func namedList(v any) []string {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []string
	for _, e := range list {
		switch t := e.(type) {
		case string:
			if s := strings.TrimSpace(t); s != "" {
				out = append(out, s)
			}
		case map[string]any:
			if name := strings.TrimSpace(asString(t["name"])); name != "" {
				out = append(out, name)
			}
		}
	}
	return out
}
