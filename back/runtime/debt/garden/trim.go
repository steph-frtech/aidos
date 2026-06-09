package garden

import "fmt"

// GardenAction is a proposed trim action over a GardenItem. EXACTLY five — one per
// declared debt kind — each is the OPENING OF AN IDEA, never a delete (the suggest-only
// rule; the rapid property pins it). The three S41 actions are reused verbatim; the two
// S112 kinds add their own open_idea_* actions.
type GardenAction string

const (
	// ActionRetireMirror — open an idea to retire an orphan mirror (S41).
	ActionRetireMirror GardenAction = "open_idea_to_retire_mirror"
	// ActionRepinFixture — open an idea to repin a stale fixture (S41).
	ActionRepinFixture GardenAction = "open_idea_to_repin_fixture"
	// ActionStrengthenMirror — open an idea to strengthen a mirror that let a mutant live (S41).
	ActionStrengthenMirror GardenAction = "open_idea_to_strengthen_mirror"
	// ActionReviveOrRetireMirror — S112: open an idea to revive (or retire) a DEAD-liveness
	// mirror — a dead proof must be brought back to life or retired, never silently dropped.
	ActionReviveOrRetireMirror GardenAction = "open_idea_to_revive_or_retire_mirror"
	// ActionJustifyOrTrimConstraint — S112: open an idea to JUSTIFY (open a ValueCase) or
	// TRIM a low-value constraint — a costly constraint must earn its keep or be reconsidered.
	ActionJustifyOrTrimConstraint GardenAction = "open_idea_to_justify_or_trim_constraint"
)

// gardenActions is the closed set, for the every-action-is-an-open_idea invariant.
var gardenActions = map[GardenAction]bool{
	ActionRetireMirror:            true,
	ActionRepinFixture:            true,
	ActionStrengthenMirror:        true,
	ActionReviveOrRetireMirror:    true,
	ActionJustifyOrTrimConstraint: true,
}

// IsGardenAction reports whether a is one of the five declared open_idea_* actions.
func IsGardenAction(a GardenAction) bool { return gardenActions[a] }

// TheDoor is the ONE path any garden trim suggestion REQUIRES. /trim never bypasses it.
const TheDoor = "idea → mirror → /goal → human approval"

// actionFor maps a debt kind to its open_idea_* action. Declared, total over the five
// kinds; an unknown kind yields no suggestion (Tend never emits one, but the mapping
// stays total and never panics).
func actionFor(k Kind) (GardenAction, bool) {
	switch k {
	case KindOrphanMirror:
		return ActionRetireMirror, true
	case KindStaleFixture:
		return ActionRepinFixture, true
	case KindSurvivingMutant:
		return ActionStrengthenMirror, true
	case KindDeadLiveness:
		return ActionReviveOrRetireMirror, true
	case KindLowValueConstraint:
		return ActionJustifyOrTrimConstraint, true
	default:
		return "", false
	}
}

// GardenSuggestion is one proposal over one GardenItem. DebtItemRef traces back to the
// item (its content-addressed id). ProjectRef scopes it (§82.4). ProposedAction is an
// open_idea_*. Rationale explains WHY in the ubiquitous language. Requires is ALWAYS
// TheDoor — acting on the suggestion goes through idea → mirror → /goal → human approval.
type GardenSuggestion struct {
	DebtItemRef    string       `json:"debt_item_ref"`
	ProjectRef     string       `json:"project_ref"`
	ProposedAction GardenAction `json:"proposed_action"`
	Rationale      string       `json:"rationale"`
	Requires       string       `json:"requires"`
}

// GardenTrimPlan is the ordered list of suggestions over a Garden. It is a PLAN a human
// MAY act on — it deletes nothing, opens no ChangeSet. An empty garden yields an empty
// plan (no false positive).
type GardenTrimPlan struct {
	ProjectRef  string             `json:"project_ref"`
	Suggestions []GardenSuggestion `json:"suggestions"`
}

// SuggestGardenTrim is the pure heart of the per-project /trim gesture (§82.4): it maps
// each GardenItem to a GardenSuggestion whose proposed_action is an open_idea_* and
// whose requires is TheDoor. It preserves the garden's order (already ranked by Tend).
// It DELETES NOTHING, writes no truth, opens no ChangeSet — it emits a plan a human (or
// a later /goal) may act on. Pure and total.
func SuggestGardenTrim(g Garden) GardenTrimPlan {
	suggestions := make([]GardenSuggestion, 0, len(g.Items))
	for _, item := range g.Items {
		action, ok := actionFor(item.Kind)
		if !ok {
			continue
		}
		suggestions = append(suggestions, GardenSuggestion{
			DebtItemRef:    item.ID,
			ProjectRef:     item.ProjectRef,
			ProposedAction: action,
			Rationale: fmt.Sprintf(
				"%s — proposition seulement : ouvrir une idée, jamais supprimer (%s)",
				item.Reason, TheDoor),
			Requires: TheDoor,
		})
	}
	return GardenTrimPlan{ProjectRef: g.ProjectRef, Suggestions: suggestions}
}

// OpenIdea is the projection of ACCEPTING a trim proposal: it OPENS an idea (never
// deletes) and routes through the door. This is the S112 done-criterion made concrete —
// « accepter une proposition de trim ouvre une idée → miroir → /goal ». It is a pure
// description of the next gesture; it writes nothing here (the door's first step, the
// idea capture, is the legal write — through idea_capture, never from this package).
type OpenIdea struct {
	OpensIdea    bool         `json:"opens_idea"`
	Deletes      bool         `json:"deletes"`
	Door         string       `json:"door"`
	FromAction   GardenAction `json:"from_action"`
	OnDebtItem   string       `json:"on_debt_item"`
	ProjectRef   string       `json:"project_ref"`
	IntentPrefix string       `json:"intent_prefix"`
}

// AcceptProposal projects a GardenSuggestion onto the OpenIdea that accepting it yields.
// It ALWAYS OpensIdea and NEVER Deletes — /trim suggests only; acting on a proposal opens
// an idea → mirror → /goal → human approval (the only door, CLAUDE.md §2). Pure, total.
func AcceptProposal(s GardenSuggestion) OpenIdea {
	return OpenIdea{
		OpensIdea:    true,
		Deletes:      false,
		Door:         TheDoor,
		FromAction:   s.ProposedAction,
		OnDebtItem:   s.DebtItemRef,
		ProjectRef:   s.ProjectRef,
		IntentPrefix: fmt.Sprintf("trim/%s sur %s", s.ProposedAction, s.DebtItemRef),
	}
}
