package besoin

// spec.go — the per-level grammar SPEC: for each SOURCE rung and each transversal band, the
// declared REQUIRED fields and the single OUTGOING REFERENCE it resolves toward (control→action,
// action→operation, operation→entity — the constrains edges of the verticale). All declared, closed
// and total over the grammar (CLAUDE.md §8: declared, never learned). Pure data + pure lookups; no
// validation of bodies here (EL07 owns the gate) — EL02 only fixes the SHAPE.

// LevelSpec declares the grammar shape of one Level: the fields a node of that level MUST carry to be
// resolvable, and the single deeper rung its outgoing reference resolves toward (RefTo). A leaf rung
// (entity) and the transversal bands carry no outgoing SOURCE reference (RefTo == "").
type LevelSpec struct {
	// Level this spec describes.
	Level Level
	// RequiredFields are the named body fields the level must carry. Declared per rung — the closed,
	// total field set used by EL12's schema-mismatch altitude classification and EL15's
	// besoin_level_schema. An off-altitude answer fails BECAUSE its fields do not match these.
	RequiredFields []string
	// RefTo is the deeper SOURCE rung this level's single outgoing reference resolves toward, or ""
	// when the level has no outgoing SOURCE ref (entity leaf, NoEmit journey/view at the top, and the
	// transversal bands which attach laterally rather than descend).
	RefTo Level
	// RefField is the name of the field that carries the outgoing reference (e.g. "triggers" for
	// control, "invoke" for action). "" when RefTo == "".
	RefField string
	// Transversal marks a band (invariant/policy) — it crosses levels rather than sitting on the
	// descent path. AttachableTo lists the SOURCE rungs it may attach to.
	Transversal bool
	// AttachableTo, for a transversal band, is the closed set of SOURCE rungs it may attach to. Empty
	// for a SOURCE rung.
	AttachableTo []Level
}

// levelSpecs is the closed, total map from every Level to its grammar spec. The single source of the
// per-level shape; ParseLevel guarantees no key outside the grammar ever reaches it.
var levelSpecs = map[Level]LevelSpec{
	LevelProduct: {
		Level:          LevelProduct,
		RequiredFields: []string{"intent", "scenarios"},
		RefTo:          LevelJourney,
		RefField:       "journeys",
	},
	LevelJourney: {
		Level:          LevelJourney,
		RequiredFields: []string{"gherkin"},
		RefTo:          LevelView,
		RefField:       "views",
	},
	LevelView: {
		Level:          LevelView,
		RequiredFields: []string{"goal", "zones", "data"},
		RefTo:          LevelControl,
		RefField:       "controls",
	},
	LevelControl: {
		Level:          LevelControl,
		RequiredFields: []string{"visible_when", "enabled_when", "triggers"},
		RefTo:          LevelAction,
		RefField:       "triggers",
	},
	LevelAction: {
		Level:          LevelAction,
		RequiredFields: []string{"invoke"},
		RefTo:          LevelOperation,
		RefField:       "invoke",
	},
	LevelOperation: {
		Level:          LevelOperation,
		RequiredFields: []string{"steps", "fixture"},
		RefTo:          LevelEntity,
		RefField:       "mutate",
	},
	LevelEntity: {
		Level:          LevelEntity,
		RequiredFields: []string{"attributes"},
		// entity is the leaf: no outgoing SOURCE reference.
	},
	LevelInvariant: {
		Level:          LevelInvariant,
		RequiredFields: []string{"statement"}, // ∀ P→Q, never exemplified
		Transversal:    true,
		AttachableTo:   []Level{LevelProduct, LevelJourney, LevelView, LevelControl, LevelAction, LevelOperation, LevelEntity},
	},
	LevelPolicy: {
		Level:          LevelPolicy,
		RequiredFields: []string{"rule"},
		Transversal:    true,
		// EL02 decision: policy is a band attached to operation/entity (where authorization is in
		// play), NOT a vertical rung.
		AttachableTo: []Level{LevelOperation, LevelEntity},
	},
}

// SpecOf returns the grammar spec of a valid Level. ok=false for any non-Level (out-of-grammar /
// out-of-scope). Pure, total.
func SpecOf(l Level) (LevelSpec, bool) {
	s, ok := levelSpecs[l]
	if !ok {
		return LevelSpec{}, false
	}
	// Defensive copy of the slices so callers cannot mutate the closed spec.
	cp := s
	cp.RequiredFields = append([]string(nil), s.RequiredFields...)
	cp.AttachableTo = append([]Level(nil), s.AttachableTo...)
	return cp, true
}

// RequiredFields returns the declared required field names of a Level (a copy). nil for a non-Level.
func RequiredFields(l Level) []string {
	s, ok := SpecOf(l)
	if !ok {
		return nil
	}
	return s.RequiredFields
}

// OutgoingRef returns the deeper SOURCE rung a level's outgoing reference resolves toward and the
// field that carries it. ok=false when the level has no outgoing SOURCE ref (entity leaf or a
// transversal band) or is not a Level. Pure, total.
func OutgoingRef(l Level) (refTo Level, refField string, ok bool) {
	s, found := levelSpecs[l]
	if !found || s.RefTo == "" {
		return "", "", false
	}
	return s.RefTo, s.RefField, true
}

// AttachableTo reports whether a transversal band may attach to a given SOURCE rung. ok=false when
// band is not a transversal band. Pure, total.
func AttachableTo(band, rung Level) (attachable bool, ok bool) {
	s, found := levelSpecs[band]
	if !found || !s.Transversal {
		return false, false
	}
	for _, a := range s.AttachableTo {
		if a == rung {
			return true, true
		}
	}
	return false, true
}
