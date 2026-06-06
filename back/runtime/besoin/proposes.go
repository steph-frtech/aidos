package besoin

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// proposes.go — EL05: the declared table LevelToProposes(level) → ProposesKind | NoEmit, the HONEST
// join between the BesoinGraph grammar (EL02) and the EXISTING closed set ideas.ProposesKinds()
// (control|policy|operation|action|entity|product). The table decides ONLY the Proposes TARGET of a
// level; it emits NO Idea (EL16 does that, through the legal idea-intake door). It writes NO truth —
// the wall is untouched (CLAUDE.md §2): a pure total function over a hand-declared closed map.
//
// THE TABLE (every non-mapping is a decision justified by an ADR, docs/adr/0041, never a footnote):
//   - control/action/operation/entity/product → THEMSELVES (the level name IS a member of
//     ideas.ProposesKinds(); self-mapping is the only legal Emit — never an alias of another level).
//   - policy (transversal band) → policy (ProposesPolicy exists in the closed set).
//   - journey, view → NoEmit. They have NO legal Proposes target in ideas.ProposesKinds() (there is
//     no "journey"/"view" kind). They are nodes that emit NO Idea and seed the anchors_above[] +
//     constraints of the rungs that DO map — never a silent cast journey→product or view→view*.
//   - invariant (transversal band) → NoEmit. An invariant's mirror is a PROPERTY (N1), not an idea
//     kind; it constrains laterally (EL14 may produce at most one Idea{Proposes:policy} for the
//     policy band, never one for the ∀ statement itself). NoEmit, not an alias.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the table is a CLOSED pure total function, never an LLM choice.
// Same Level → same Mapping (the reproducibility property). A target outside ideas.ProposesKinds() is
// a hard error, never invented.

// MappingKind tags a level's emission disposition: it either EMITS an Idea of a given ProposesKind,
// or emits NONE (NoEmit — a seed-only node).
type MappingKind string

const (
	// MappingEmit — the level maps to exactly one ideas.Proposes (carried in Mapping.Proposes).
	MappingEmit MappingKind = "emit"
	// MappingNoEmit — the level emits NO Idea (journey/view/invariant); it seeds anchors instead.
	MappingNoEmit MappingKind = "no_emit"
)

// Mapping is the table's verdict for one Level. When Kind == MappingEmit, Proposes names the SINGLE
// ideas.Proposes the level maps to (a member of ideas.ProposesKinds()). When Kind == MappingNoEmit,
// Proposes is empty. The comparable struct makes equality (reproducibility) checkable directly.
type Mapping struct {
	Kind     MappingKind    `json:"kind"`
	Proposes ideas.Proposes `json:"proposes,omitempty"`
}

// emit is a small constructor for an Emit mapping toward an EXISTING closed-set kind.
func emit(p ideas.Proposes) Mapping { return Mapping{Kind: MappingEmit, Proposes: p} }

// noEmit is the single NoEmit verdict (journey/view/invariant).
var noEmit = Mapping{Kind: MappingNoEmit}

// levelProposesTable is the FIRST-CLASS, CLOSED, TOTAL declared map of every valid Level to its
// Mapping. Its domain is EXACTLY AllLevels() (proven by TestLevelToProposes_DomainIsExactlyAllLevels).
// Each Emit target is a member of ideas.ProposesKinds() (the honest join). Declared, never learned.
var levelProposesTable = map[Level]Mapping{
	// The 5 SOURCE rungs whose name IS a ProposesKind → self-mapping (the ONLY legal Emit).
	LevelControl:   emit(ideas.ProposesControl),
	LevelAction:    emit(ideas.ProposesAction),
	LevelOperation: emit(ideas.ProposesOperation),
	LevelEntity:    emit(ideas.ProposesEntity),
	LevelProduct:   emit(ideas.ProposesProduct),

	// The policy transversal band → ProposesPolicy (the closed set has "policy").
	LevelPolicy: emit(ideas.ProposesPolicy),

	// NoEmit — no legal Proposes target (journey/view) or a property-mirror band (invariant).
	LevelJourney:   noEmit, // ADR 0041: no "journey" kind in the closed set; seeds anchors.
	LevelView:      noEmit, // ADR 0041: no "view" kind; seeds anchors (view→view* impossible).
	LevelInvariant: noEmit, // ADR 0041: ∀ statement is a property mirror, not an idea kind.
}

// LevelToProposes returns the declared Mapping for a Level. For any out-of-grammar level it returns
// the safe NoEmit verdict (so callers iterating valid levels never panic); use LevelToProposesChecked
// when an out-of-grammar input must be a HARD error. Pure, total, deterministic — no clock/rng/IO/LLM.
func LevelToProposes(l Level) Mapping {
	if m, ok := levelProposesTable[l]; ok {
		return m
	}
	return noEmit
}

// LevelToProposesChecked is LevelToProposes with a HARD error for an out-of-grammar level (a level
// not in AllLevels()). The error makes a mapping toward an unknown kind impossible — never an LLM
// guess, never a silent alias. Pure, total.
func LevelToProposesChecked(l Level) (Mapping, error) {
	if m, ok := levelProposesTable[l]; ok {
		return m, nil
	}
	return Mapping{}, fmt.Errorf("besoin: no Proposes mapping for out-of-grammar level %q (the table is closed; %w)", l, ErrUnknownLevel)
}

// noEmitLevels is the closed set of NoEmit rungs/bands, in canonical order (journey, view then the
// invariant band) — used by NoEmitLevels and the Workbench projection so the set is never invented.
var noEmitLevels = []Level{LevelJourney, LevelView, LevelInvariant}

// NoEmitLevels returns the closed set of levels that emit NO Idea (they seed anchors / carry a
// property mirror). The returned slice is a copy. Pure, total.
func NoEmitLevels() []Level {
	out := make([]Level, len(noEmitLevels))
	copy(out, noEmitLevels)
	return out
}

// EmitLevels returns the closed set of levels that MAP to a ProposesKind (Emit), in AllLevels()
// order. The returned slice is fresh. Pure, total.
func EmitLevels() []Level {
	out := make([]Level, 0, len(levelProposesTable))
	for _, l := range AllLevels() {
		if LevelToProposes(l).Kind == MappingEmit {
			out = append(out, l)
		}
	}
	return out
}

// IsNoEmit reports whether a level emits no Idea. Pure, total.
func IsNoEmit(l Level) bool { return LevelToProposes(l).Kind == MappingNoEmit }
