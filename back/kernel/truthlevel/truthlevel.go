// Package truthlevel implements FK01 — the seven KRD truth levels (FKE-5/§5,
// Raw→Reconciled) stored on a record and written ONLY by a deterministic, pure,
// total transition function.
//
// KRD FKE-5: a raw description, chat, ticket, log or prototype is NOT the spec — it
// is a raw signal. A truth climbs seven graded levels on its way to (and back from)
// the wall:
//
//	1 Raw          — what was said, pasted, observed or generated experimentally
//	2 Interpreted  — what the left brain thinks it understood (an idea exists)
//	3 Proposed     — what is proposed above the wall (a DRAFT changeset proposes it)
//	4 Accepted     — what a user or Governor validated (the changeset is APPLIED)
//	5 Projected    — what is generated (code, config, prompt, test, doc, MCP, infra)
//	6 Observed     — what tests, logs, metrics, evals, scans and runtime show
//	7 Reconciled   — what the consciousness concludes after comparison
//
// "Décision actée (grill 2026-06-07): le niveau de vérité est STOCKÉ sur le record
// (queryable, historisé) mais ÉCRIT UNIQUEMENT par la fonction de transition
// déterministe — jamais posé à la main — avec un miroir de parité
// `stored_level == computed_level` (toute divergence = rouge). « Done is computed »
// tient: le stockage est un CACHE PROUVÉ DU CALCUL, pas une seconde source."
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Compute is a PURE, TOTAL function over a
// Signals value: no DB, no clock, no rng, no I/O, no LLM. Same Signals ⇒ same Level.
// The stored level is a cache; CheckParity is the parity mirror that proves the cache
// equals the computation (divergence is RED). READ-ONLY against truth — this package
// writes nothing (the wall, CLAUDE.md §2): the level is set on the record by the
// privileged transition at the legal door (idea/changeset/mirror/evidence/conscience),
// never hand-posed.
package truthlevel

import (
	"errors"
	"fmt"
)

// Level is one of the seven KRD truth levels (FKE-5). It is an ORDERED ladder:
// Raw(1) is the lowest, Reconciled(7) the highest. The numeric value is the rung.
type Level int

const (
	// LevelUnknown is the zero value — NOT a real level. Compute never returns it;
	// it exists so an unset field is distinguishable from Raw (rung 1).
	LevelUnknown Level = 0
	// LevelRaw — what was said, pasted, observed or generated experimentally.
	LevelRaw Level = 1
	// LevelInterpreted — what the left brain thinks it understood (an idea exists).
	LevelInterpreted Level = 2
	// LevelProposed — what is proposed above the wall (a DRAFT changeset proposes it).
	LevelProposed Level = 3
	// LevelAccepted — what a user or Governor validated (the changeset is APPLIED).
	LevelAccepted Level = 4
	// LevelProjected — what is generated (code, config, prompt, test, doc, MCP, infra).
	LevelProjected Level = 5
	// LevelObserved — what tests, logs, metrics, evals, scans and runtime show.
	LevelObserved Level = 6
	// LevelReconciled — what the consciousness concludes after comparison.
	LevelReconciled Level = 7
)

// levelName maps each level to its canonical KRD name. Declared, never derived.
var levelName = map[Level]string{
	LevelUnknown:     "unknown",
	LevelRaw:         "raw",
	LevelInterpreted: "interpreted",
	LevelProposed:    "proposed",
	LevelAccepted:    "accepted",
	LevelProjected:   "projected",
	LevelObserved:    "observed",
	LevelReconciled:  "reconciled",
}

// levelOrder is the canonical Raw→Reconciled enumeration order of the seven real
// levels (LevelUnknown excluded). Declared, never derived from map iteration, so
// Levels() and every projection are stable.
var levelOrder = []Level{
	LevelRaw,
	LevelInterpreted,
	LevelProposed,
	LevelAccepted,
	LevelProjected,
	LevelObserved,
	LevelReconciled,
}

// Levels returns the seven KRD truth levels in canonical Raw→Reconciled order.
// Used by the validator and the Workbench filter so the set of rungs is never
// invented.
func Levels() []Level {
	out := make([]Level, len(levelOrder))
	copy(out, levelOrder)
	return out
}

// Name returns the canonical KRD name of a level ("raw"…"reconciled"); an
// out-of-enum level returns "unknown".
func (l Level) Name() string {
	if n, ok := levelName[l]; ok {
		return n
	}
	return "unknown"
}

// String renders the level as "<rung>:<name>" for logs and the panel.
func (l Level) String() string {
	if l == LevelUnknown {
		return "0:unknown"
	}
	return fmt.Sprintf("%d:%s", int(l), l.Name())
}

// IsReal reports whether l is one of the seven real levels (Raw…Reconciled), i.e.
// not LevelUnknown and not out of enum.
func (l Level) IsReal() bool {
	_, ok := levelName[l]
	return ok && l != LevelUnknown
}

// Signals is the deterministic INPUT to the transition — the legal provenance doors
// of FKE-5, one boolean per door. They are MONOTONE by construction of the ladder:
// a higher door implies every lower one (an APPLIED changeset implies a proposed one;
// observed evidence implies a projection). Compute does NOT assume the caller honoured
// that — it reads the HIGHEST satisfied door, so a partially-filled Signals still maps
// to a single, total Level (never a panic, never an ambiguous rung).
//
// Each field corresponds to a door the spec names (idea / changeset / mirror / evidence
// / conscience):
type Signals struct {
	// HasRawSignal — a raw signal was captured (chat, ticket, log, prototype, paste).
	// The floor: every record that exists at all sits at least at Raw.
	HasRawSignal bool `json:"has_raw_signal"`
	// HasIdea — the left brain produced an idea (an ideas.idea record). → Interpreted.
	HasIdea bool `json:"has_idea"`
	// HasProposal — a DRAFT changeset proposes the truth above the wall. → Proposed.
	HasProposal bool `json:"has_proposal"`
	// IsAccepted — a user or Governor validated it (the changeset is APPLIED). → Accepted.
	IsAccepted bool `json:"is_accepted"`
	// HasProjection — a projection was generated (code/config/test/doc/MCP/infra). → Projected.
	HasProjection bool `json:"has_projection"`
	// HasObservation — tests/logs/metrics/evals/scans/runtime show evidence. → Observed.
	HasObservation bool `json:"has_observation"`
	// IsReconciled — the consciousness concluded after comparison. → Reconciled.
	IsReconciled bool `json:"is_reconciled"`
}

// Compute is the deterministic, pure, TOTAL transition function (FKE-5). It returns
// the HIGHEST truth level whose door is satisfied in s. It is total over every
// Signals value — including the all-false zero value, which maps to LevelUnknown
// (nothing has happened yet: not even a raw signal). It never panics, never reads a
// clock/DB/rng, and is the SOLE writer of a record's truth_level (the level is never
// hand-posed — CLAUDE.md §6/§8, the determinism-first mandate).
//
// The ladder is read top-down so a partially/over-filled Signals still resolves to a
// single rung: the topmost satisfied door wins.
func Compute(s Signals) Level {
	switch {
	case s.IsReconciled:
		return LevelReconciled
	case s.HasObservation:
		return LevelObserved
	case s.HasProjection:
		return LevelProjected
	case s.IsAccepted:
		return LevelAccepted
	case s.HasProposal:
		return LevelProposed
	case s.HasIdea:
		return LevelInterpreted
	case s.HasRawSignal:
		return LevelRaw
	default:
		return LevelUnknown
	}
}

// Errors of the parity mirror surface.
var (
	// ErrParityDivergence — the stored level differs from the computed level. This is
	// the RED of the parity mirror (the stored level is a cache, never a second source).
	ErrParityDivergence = errors.New("truthlevel: stored truth_level diverges from computed level (parity mirror RED)")
)

// ParityResult is the verdict of the parity mirror for one record: the stored level,
// the level recomputed from the record's signals, and whether they agree.
type ParityResult struct {
	Stored   Level `json:"stored"`
	Computed Level `json:"computed"`
	Aligned  bool  `json:"aligned"`
}

// CheckParity is the parity mirror (FKE-5: `stored_level == computed_level`). It
// recomputes the level from the signals and compares it to the stored level. ALIGNED
// (a green pair) iff they are equal; any divergence is RED (ErrParityDivergence). PURE
// and TOTAL: it reads two values and returns a verdict, touching no DB/clock/rng. The
// stored level is a CACHE PROVEN BY THE COMPUTATION — this is the proof.
func CheckParity(stored Level, s Signals) (ParityResult, error) {
	computed := Compute(s)
	res := ParityResult{Stored: stored, Computed: computed, Aligned: stored == computed}
	if !res.Aligned {
		return res, fmt.Errorf("%w: stored=%s computed=%s", ErrParityDivergence, stored, computed)
	}
	return res, nil
}
