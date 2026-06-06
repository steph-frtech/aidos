// Package besoin holds the CLOSED grammar of the BesoinGraph (track EL,
// ROADMAP-compound-requirements.md). It is the substrate above the wall on which the whole
// "compound du besoin" track is built: a deterministic, content-addressed graph whose topology IS
// the KRD §23 verticale (product → journey → view → control → action → operation → entity), plus
// two transversal bands (invariant ∀, policy).
//
// EL02 defines ONLY the grammar — the closed, totally-ordered enumeration of levels, the transversal
// bands, the per-level required fields and the single outgoing reference each level resolves toward.
// It writes NO truth (the wall, CLAUDE.md §2): there is no kernel/mirrors/fitness write path here,
// only pure total functions over a hand-declared closed set. Everything is determinism-first
// (CLAUDE.md §6/§8): the order is a pure total function with no clock/rng/IO; an out-of-grammar level
// is a HARD refusal, never an LLM guess.
//
// SCOPE v1 (declared, not silently omitted). The grammar elicits the 7 SOURCE rungs of §23 plus the
// transversal bands invariant and policy. The kernel layers saga, temporal and globalinvariant
// (present in back/kernel/) are DELIBERATELY out-of-grammar-v1 — a declared OpenQuestion for a later
// EL, NOT a claimed completeness. They are named explicitly (OutOfScopeLevels) and rejected hard
// (IsLevel returns false, ParseLevel errors): never an alias of a real Level.
package besoin

import (
	"errors"
	"fmt"
)

// Level is one rung of the BesoinGraph grammar. The closed set is the 7 SOURCE rungs of the KRD §23
// verticale PLUS the two transversal bands (invariant, policy). A value outside this set is NOT a
// Level (IsLevel == false); there is no open string.
type Level string

const (
	// The 7 SOURCE rungs, in strict top-down order (the order of this block IS the descent order).
	LevelProduct   Level = "product"   // the intention + ≤N scenarios
	LevelJourney   Level = "journey"   // the user journey (Gherkin) — NoEmit, seeds anchors
	LevelView      Level = "view"      // the screen (goal + zones + data) — NoEmit, seeds anchors
	LevelControl   Level = "control"   // the button (visible_when/enabled_when/triggers)
	LevelAction    Level = "action"    // the action (invoke → operation)
	LevelOperation Level = "operation" // the operation (steps + fixture)
	LevelEntity    Level = "entity"    // the entity (attributes on the closed scalar)

	// The 2 transversal bands — NOT vertical rungs (NextLevel never traverses them).
	LevelInvariant Level = "invariant" // ∀ P→Q, attached to crossed levels (N1)
	LevelPolicy    Level = "policy"    // authorization, attached to operation/entity (EL02 decision)
)

// sourceOrder is the TOTAL, CLOSED, top-down order of the 7 SOURCE rungs (KRD §23). Declared, never
// learned (CLAUDE.md §8). A BesoinGraph descends in exactly this order; NextLevel walks it; the
// topological backlog (EL17) promotes Ideas in exactly this order — "the doc follows the
// architecture". The transversal bands are NOT in this slice.
var sourceOrder = []Level{
	LevelProduct,
	LevelJourney,
	LevelView,
	LevelControl,
	LevelAction,
	LevelOperation,
	LevelEntity,
}

// transversalBands is the closed set of bands that cross levels rather than sitting on the descent
// path. They are attached laterally (invariant to any crossed level; policy to operation/entity —
// EL02's explicit decision: policy is a band, not a vertical rung). NextLevel never returns them.
var transversalBands = []Level{
	LevelInvariant,
	LevelPolicy,
}

// outOfScopeLevels names the kernel layers that exist in back/kernel/ but are DELIBERATELY
// out-of-grammar-v1 (declared OpenQuestion, ROADMAP scope paragraph). They are NOT Levels: IsLevel
// returns false and ParseLevel rejects them with a dedicated error so the refusal is legible, never
// a silent omission and never an alias of a real Level.
var outOfScopeLevels = []Level{
	"saga",
	"temporal",
	"globalinvariant",
}

// ErrUnknownLevel is returned by ParseLevel for a string that is neither a SOURCE rung nor a
// transversal band. It carries the offending value so the caller can surface an actionable refusal.
var ErrUnknownLevel = errors.New("besoin: unknown level (out of grammar)")

// ErrOutOfScopeLevel is returned by ParseLevel for a level that is a NAMED out-of-scope-v1 kernel
// layer (saga/temporal/globalinvariant). Distinct from ErrUnknownLevel so the refusal can explain
// "deliberately out of grammar v1, declared OpenQuestion" rather than "never heard of it".
var ErrOutOfScopeLevel = errors.New("besoin: level deliberately out of grammar v1 (declared OpenQuestion)")

// Levels returns the 7 SOURCE rungs in their canonical top-down order. The returned slice is a copy:
// callers cannot mutate the closed order. Pure, total, no IO.
func Levels() []Level {
	out := make([]Level, len(sourceOrder))
	copy(out, sourceOrder)
	return out
}

// TransversalBands returns the closed set of transversal bands (invariant, policy) in canonical
// order. The returned slice is a copy. Pure, total, no IO.
func TransversalBands() []Level {
	out := make([]Level, len(transversalBands))
	copy(out, transversalBands)
	return out
}

// OutOfScopeLevels returns the named, declared out-of-grammar-v1 kernel layers
// (saga/temporal/globalinvariant). They are surfaced (not hidden) so the scope decision is legible.
// They are NOT Levels. Pure, total, no IO.
func OutOfScopeLevels() []Level {
	out := make([]Level, len(outOfScopeLevels))
	copy(out, outOfScopeLevels)
	return out
}

// AllLevels returns every valid Level — the 7 SOURCE rungs followed by the 2 transversal bands.
// It is the complete closed grammar (out-of-scope layers excluded). Pure, total, no IO.
func AllLevels() []Level {
	out := make([]Level, 0, len(sourceOrder)+len(transversalBands))
	out = append(out, sourceOrder...)
	out = append(out, transversalBands...)
	return out
}

// IsSourceRung reports whether l is one of the 7 SOURCE rungs (on the descent path). Pure, total.
func IsSourceRung(l Level) bool {
	for _, s := range sourceOrder {
		if s == l {
			return true
		}
	}
	return false
}

// IsTransversalBand reports whether l is a transversal band (invariant/policy). Pure, total.
func IsTransversalBand(l Level) bool {
	for _, b := range transversalBands {
		if b == l {
			return true
		}
	}
	return false
}

// IsOutOfScope reports whether l is a NAMED out-of-grammar-v1 kernel layer
// (saga/temporal/globalinvariant). Such a value is NOT a Level. Pure, total.
func IsOutOfScope(l Level) bool {
	for _, o := range outOfScopeLevels {
		if o == l {
			return true
		}
	}
	return false
}

// IsLevel reports whether l is a valid Level of the grammar — a SOURCE rung OR a transversal band.
// Out-of-scope layers and any unknown string return false (hard refusal, no alias). Pure, total.
func IsLevel(l Level) bool {
	return IsSourceRung(l) || IsTransversalBand(l)
}

// ParseLevel resolves a raw string to a Level, refusing anything outside the grammar HARD (never an
// LLM guess, never a silent alias). A named out-of-scope-v1 layer returns ErrOutOfScopeLevel so the
// refusal explains itself; any other unknown string returns ErrUnknownLevel. Pure, total.
func ParseLevel(s string) (Level, error) {
	l := Level(s)
	if IsLevel(l) {
		return l, nil
	}
	if IsOutOfScope(l) {
		return "", fmt.Errorf("%w: %q", ErrOutOfScopeLevel, s)
	}
	return "", fmt.Errorf("%w: %q", ErrUnknownLevel, s)
}

// sourceIndex returns the 0-based position of a SOURCE rung in the descent order, or -1 if l is not
// a SOURCE rung (a transversal band has no descent position).
func sourceIndex(l Level) int {
	for i, s := range sourceOrder {
		if s == l {
			return i
		}
	}
	return -1
}

// NextLevel returns the SOURCE rung immediately below current in the descent order, and ok=false at
// the leaf (entity) or when current is NOT a SOURCE rung. Transversal bands are NEVER traversed: a
// band as input yields ok=false (the descent path does not pass through invariant/policy). Pure,
// total — same input → same output, no clock/rng/IO.
func NextLevel(current Level) (Level, bool) {
	i := sourceIndex(current)
	if i < 0 {
		return "", false // not a SOURCE rung (transversal band or out-of-grammar)
	}
	if i+1 >= len(sourceOrder) {
		return "", false // entity is the leaf
	}
	return sourceOrder[i+1], true
}

// PrevLevel returns the SOURCE rung immediately above current, ok=false at the top (product) or when
// current is not a SOURCE rung. The mirror of NextLevel; used to read the constraining anchor above.
// Pure, total.
func PrevLevel(current Level) (Level, bool) {
	i := sourceIndex(current)
	if i <= 0 {
		return "", false
	}
	return sourceOrder[i-1], true
}

// Less reports whether SOURCE rung a sits strictly ABOVE SOURCE rung b in the descent order (a
// constrains b). ok=false if either is not a SOURCE rung. The total order over SOURCE rungs. Pure.
func Less(a, b Level) (less bool, ok bool) {
	ia, ib := sourceIndex(a), sourceIndex(b)
	if ia < 0 || ib < 0 {
		return false, false
	}
	return ia < ib, true
}
