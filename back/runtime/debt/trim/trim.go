// Package trim is the AIDOS Runtime /trim suggestion engine (step S41): the pure
// function that turns a KernelDebt report into a TrimPlan a human (or a later goal)
// MAY act on. It SUGGESTS; it DELETES NOTHING, writes no truth, opens no ChangeSet.
//
// THE ONLY DOOR (CLAUDE.md §2). Every TrimSuggestion's proposed_action is the
// OPENING OF AN IDEA — never a removal — and every suggestion REQUIRES the door
// `idea → mirror → /goal → human approval`. Acting on a suggestion is a LATER goal;
// /trim itself never bypasses the wall. There are EXACTLY three actions, declared,
// never invented (the rapid property pins that every action is an open_idea_*).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). SuggestTrim is pure and total — no I/O, no
// clock, no RNG. Same debt ⇒ same plan (ordered). The mapping debt-kind → action is
// a declared table, not a prompt.
package trim

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/debt"
)

// Action is a proposed trim action. EXACTLY three — each is the OPENING OF AN IDEA,
// never a delete (the suggest-only rule; the rapid property pins it).
type Action string

const (
	// ActionRetireMirror — open an idea to retire an orphan mirror (it reflects no
	// live truth — a monster). Retirement still goes through idea → mirror → /goal.
	ActionRetireMirror Action = "open_idea_to_retire_mirror"
	// ActionRepinFixture — open an idea to repin a stale fixture onto the live head.
	ActionRepinFixture Action = "open_idea_to_repin_fixture"
	// ActionStrengthenMirror — open an idea to strengthen a mirror that let a mutant
	// survive (close the test gap).
	ActionStrengthenMirror Action = "open_idea_to_strengthen_mirror"
)

// actions is the closed set, for the every-action-is-an-open_idea invariant.
var actions = map[Action]bool{
	ActionRetireMirror:     true,
	ActionRepinFixture:     true,
	ActionStrengthenMirror: true,
}

// IsAction reports whether a is one of the three declared open_idea_* actions.
func IsAction(a Action) bool { return actions[a] }

// TheDoor is the one path any trim suggestion REQUIRES. /trim never bypasses it.
const TheDoor = "idea → mirror → /goal → human approval"

// TrimSuggestion is one proposal over one DebtItem. DebtItemRef traces back to the
// debt item (its content-addressed id). ProposedAction is an open_idea_*. Rationale
// explains WHY in the ubiquitous language. Requires is ALWAYS TheDoor — acting on
// the suggestion goes through idea → mirror → /goal → human approval.
type TrimSuggestion struct {
	DebtItemRef    string `json:"debt_item_ref"`
	ProposedAction Action `json:"proposed_action"`
	Rationale      string `json:"rationale"`
	Requires       string `json:"requires"`
}

// TrimPlan is the ordered list of suggestions over a KernelDebt report. It is a
// PLAN a human may act on — it deletes nothing, opens no ChangeSet. An empty debt
// yields an empty plan (no false positives).
type TrimPlan struct {
	Suggestions []TrimSuggestion `json:"suggestions"`
}

// actionFor maps a debt kind to its open_idea_* action. Declared, total over the
// three kinds; an unknown kind yields no suggestion (Scan never emits one, but
// SuggestTrim stays total and never panics on a malformed item).
func actionFor(k debt.Kind) (Action, bool) {
	switch k {
	case debt.KindOrphanMirror:
		return ActionRetireMirror, true
	case debt.KindStaleFixture:
		return ActionRepinFixture, true
	case debt.KindSurvivingMutant:
		return ActionStrengthenMirror, true
	default:
		return "", false
	}
}

// SuggestTrim is the pure heart of the /trim gesture: it maps each DebtItem to a
// TrimSuggestion whose proposed_action is an open_idea_* and whose requires is
// TheDoor. It preserves the debt's order (already ranked by Scan). It DELETES
// NOTHING, writes no truth, opens no ChangeSet — it emits a plan a human (or a
// later goal) may act on. Pure and total: a malformed/unknown-kind item is skipped,
// never panicked on; an empty debt yields an empty plan.
func SuggestTrim(d debt.KernelDebt) TrimPlan {
	suggestions := make([]TrimSuggestion, 0, len(d.Items))
	for _, item := range d.Items {
		action, ok := actionFor(item.Kind)
		if !ok {
			continue
		}
		suggestions = append(suggestions, TrimSuggestion{
			DebtItemRef:    item.ID,
			ProposedAction: action,
			Rationale:      rationaleFor(item),
			Requires:       TheDoor,
		})
	}
	return TrimPlan{Suggestions: suggestions}
}

// rationaleFor renders the human-facing why for one suggestion in the ubiquitous
// language, always closing on the door (suggest-only made explicit).
func rationaleFor(item debt.DebtItem) string {
	return fmt.Sprintf(
		"%s — proposition seulement : ouvrir une idée, jamais supprimer (%s)",
		item.Reason, TheDoor)
}
