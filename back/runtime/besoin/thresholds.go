package besoin

// thresholds.go — EL06: the declared, above-the-line config of the BESOIN gate, in TWO parts, both
// pure/total/deterministic and writing NO truth (CLAUDE.md §2 — the wall is untouched):
//
//   1. BesoinThresholds — ONE content-addressed record holding EVERY gate threshold (the product's
//      ≤N scenarios, the per-rung required fields). EL07 (CanDescend) and EL11 (the Stop:besoin-gate
//      hook) read the SAME record, so a threshold is declared ONCE and cannot drift between callers
//      (anti magic-number — TestThresholds_RequiredFieldsHaveNoSecondCopy pins the single source).
//      Declared, NEVER learned (CLAUDE.md §8: weights/thresholds are declared above the line).
//
//   2. OptionSpace(L, L+1) — the ENUMERABLE declared metric per adjacent SOURCE-rung pair: the CLOSED,
//      countable set of choices the lower rung admits given the upper. |OptionSpace| is an integer
//      computed by a PURE function over a hand-declared closed set (Size = len(Choices)), NEVER an LLM
//      judgment. A pair whose OptionSpace is NOT enumerable is a DECLARED OpenQuestion
//      (Enumerable=false, OpenQuestion reason set, Size()==-1) — it is NEVER fabricated as 0. EL08's
//      ShrinkOptionSpace counts |OptionSpace| BEFORE vs AFTER anchors over THIS declared set; EL07
//      consumes ShrinkOptionSpace>0 as its anti-vacuity gate condition.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every value here is a pure function of declared data — no
// clock, no rng, no IO, no LLM. The reproducibility mirror (thresholds_property_test.go) pins
// same-input→same-output, including the content-addressed Hash.

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

// --- BesoinThresholds ---------------------------------------------------------------------------

// BesoinThresholds is the SINGLE declared record of every gate threshold (above the line, never
// learned). It is a VALUE: callers read it, never mutate the live defaults. The per-rung required
// fields are NOT re-declared here — they are sourced from spec.go (RequiredFields), so there is no
// second, drifting copy; the record only exposes the read accessor RequiredFieldsFor that EL07/EL11
// share.
type BesoinThresholds struct {
	// MaxScenarios is the product rung's declared upper bound on scenarios (the ROADMAP "≤5
	// scénarios"). A single source; EL07 reads th.MaxScenarios, never an inlined 5.
	MaxScenarios int `json:"max_scenarios"`
}

// DefaultThresholds returns the canonical declared thresholds record. Pure, total, deterministic —
// same call → byte-identical record and identical Hash. This is the ONE source EL07 and EL11 read.
func DefaultThresholds() BesoinThresholds {
	return BesoinThresholds{
		MaxScenarios: 5, // ROADMAP EL06/EL07: a product is right-sized at ≤5 scenarios.
	}
}

// RequiredFieldsFor returns the declared required body fields a level must carry, sourced from
// spec.go (RequiredFields) — NOT a second copy. nil for an out-of-grammar level (never a guessed
// default). The returned slice is a fresh copy; mutating it cannot change the record. Pure, total.
func (t BesoinThresholds) RequiredFieldsFor(l Level) []string {
	fields := RequiredFields(l)
	if fields == nil {
		return nil
	}
	out := make([]string, len(fields))
	copy(out, fields)
	return out
}

// Hash is the content-address of the thresholds record (its declared values + the per-rung required
// fields it points at, in canonical level order). Same record → same hash; a drift in any threshold
// or required-field set changes the hash. Pure, deterministic — no clock/rng/IO.
func (t BesoinThresholds) Hash() string {
	var b strings.Builder
	fmt.Fprintf(&b, "max_scenarios=%d\n", t.MaxScenarios)
	for _, l := range AllLevels() {
		fmt.Fprintf(&b, "required[%s]=%s\n", l, strings.Join(t.RequiredFieldsFor(l), ","))
	}
	sum := sha256.Sum256([]byte(b.String()))
	return hex.EncodeToString(sum[:])
}

// --- OptionSpace --------------------------------------------------------------------------------

// OptionSpace is the declared, enumerable metric for one adjacent SOURCE-rung pair (From → To): the
// CLOSED, countable set of choices the lower rung (To) admits given the upper rung (From). When
// Enumerable is true, Choices holds the closed set and Size()==len(Choices). When Enumerable is
// false, the pair is a DECLARED OpenQuestion (OpenQuestion holds the reason) and Size()==-1 — it is
// NEVER fabricated to 0.
type OptionSpace struct {
	From       Level    `json:"from"`
	To         Level    `json:"to"`
	Enumerable bool     `json:"enumerable"`
	Choices    []string `json:"choices,omitempty"`
	// OpenQuestion is the declared reason a pair is NOT enumerable (empty when Enumerable). The
	// honest "we cannot enumerate this yet" instead of a fabricated count.
	OpenQuestion string `json:"open_question,omitempty"`
}

// Size returns |OptionSpace|: the count of choices for an enumerable pair (len(Choices), a positive
// integer), or the sentinel -1 for a non-enumerable pair (a declared OpenQuestion). NEVER 0 by
// default — a 0 would be a fabricated metric. Pure.
func (o OptionSpace) Size() int {
	if !o.Enumerable {
		return -1
	}
	return len(o.Choices)
}

// optionSpaceTable is the CLOSED, declared map from an adjacent SOURCE-rung pair (keyed "from→to") to
// its OptionSpace. Each enumerable entry's Choices is a hand-declared closed set the lower rung
// admits given the upper. Pairs whose closed set cannot honestly be enumerated v1 are declared
// OpenQuestions (Enumerable:false) — never fabricated. Declared, never learned (CLAUDE.md §8).
var optionSpaceTable = func() map[string]OptionSpace {
	entries := []OptionSpace{
		// product → journey: the closed set of journey archetypes a product/persona admits. Enumerable.
		{
			From: LevelProduct, To: LevelJourney, Enumerable: true,
			Choices: []string{
				"onboarding", "core-task", "recovery", "settings", "discovery", "checkout", "admin",
			},
		},
		// journey → view: the closed set of view archetypes a journey admits. Enumerable.
		{
			From: LevelJourney, To: LevelView, Enumerable: true,
			Choices: []string{
				"list", "detail", "form", "dashboard", "wizard", "empty-state", "confirmation",
			},
		},
		// view → control: the closed set of control archetypes a view admits. Enumerable.
		{
			From: LevelView, To: LevelControl, Enumerable: true,
			Choices: []string{
				"submit", "cancel", "navigate", "toggle", "select", "delete", "create", "edit",
			},
		},
		// control → action: the closed set of action shapes a control's trigger admits. Enumerable.
		{
			From: LevelControl, To: LevelAction, Enumerable: true,
			Choices: []string{"command", "query", "navigation"},
		},
		// action → operation: the closed set of operation shapes an action invokes. Enumerable.
		{
			From: LevelAction, To: LevelOperation, Enumerable: true,
			Choices: []string{"create", "update", "delete", "read", "saga-step"},
		},
		// operation → entity: NON-enumerable v1 — the set of entity aggregate boundaries an operation
		// may mutate is unbounded for the user's own domain (it is THEIR data model, not a closed
		// archetype list). Declared OpenQuestion, never fabricated as a count.
		{
			From: LevelOperation, To: LevelEntity, Enumerable: false,
			OpenQuestion: "operation→entity OptionSpace is not enumerable v1: the set of entity aggregate boundaries an operation may mutate is the user's own (open) domain model, not a closed archetype set. Declared OpenQuestion for a later EL — never fabricated to 0.",
		},
	}
	m := make(map[string]OptionSpace, len(entries))
	for _, e := range entries {
		m[optionSpaceKey(e.From, e.To)] = e
	}
	return m
}()

// optionSpaceKey builds the canonical lookup key for an ordered rung pair.
func optionSpaceKey(from, to Level) string { return string(from) + "→" + string(to) }

// OptionSpaceFor returns the declared OptionSpace for an adjacent SOURCE-rung pair (From → To).
// ok=false for any pair that is NOT a consecutive descent pair (out of grammar, non-adjacent,
// reversed) — never a fabricated OptionSpace. Pure, total.
func OptionSpaceFor(from, to Level) (OptionSpace, bool) {
	o, ok := optionSpaceTable[optionSpaceKey(from, to)]
	if !ok {
		return OptionSpace{}, false
	}
	// Defensive copy of Choices so callers cannot mutate the declared closed set.
	cp := o
	cp.Choices = append([]string(nil), o.Choices...)
	return cp, true
}

// OptionSpacePair names one adjacent SOURCE-rung pair (the key of an OptionSpace entry).
type OptionSpacePair struct {
	From Level `json:"from"`
	To   Level `json:"to"`
}

// OptionSpacePairs returns every declared OptionSpace pair, in canonical descent order (product→
// journey first, …, operation→entity last). The returned slice is fresh. Pure, total — the set is
// exactly the consecutive SOURCE-rung pairs (TestOptionSpace_PairsAreAdjacentSourceRungs pins it).
func OptionSpacePairs() []OptionSpacePair {
	out := make([]OptionSpacePair, 0, len(optionSpaceTable))
	for _, l := range Levels() {
		next, ok := NextLevel(l)
		if !ok {
			continue
		}
		if _, found := optionSpaceTable[optionSpaceKey(l, next)]; found {
			out = append(out, OptionSpacePair{From: l, To: next})
		}
	}
	// Stable canonical order is the descent order above; the explicit sort guards against any future
	// non-source key being added without an adjacency, keeping the output deterministic.
	sort.SliceStable(out, func(i, j int) bool {
		ii, _ := Less(out[i].From, out[j].From)
		ji, _ := Less(out[j].From, out[i].From)
		if ii == ji {
			return string(out[i].From) < string(out[j].From)
		}
		return ii
	})
	return out
}

// EnumerableOptionSpacePairs returns only the pairs whose OptionSpace is enumerable (Size>0). The
// non-enumerable pairs are the declared OpenQuestions (OpenQuestionOptionSpacePairs). Pure, total.
func EnumerableOptionSpacePairs() []OptionSpacePair {
	out := make([]OptionSpacePair, 0, len(optionSpaceTable))
	for _, p := range OptionSpacePairs() {
		if o, ok := OptionSpaceFor(p.From, p.To); ok && o.Enumerable {
			out = append(out, p)
		}
	}
	return out
}

// OpenQuestionOptionSpacePairs returns the pairs declared NON-enumerable (each carrying its
// OpenQuestion reason) — the honest "not enumerable yet" set, never counted as 0. Pure, total.
func OpenQuestionOptionSpacePairs() []OptionSpacePair {
	out := make([]OptionSpacePair, 0)
	for _, p := range OptionSpacePairs() {
		if o, ok := OptionSpaceFor(p.From, p.To); ok && !o.Enumerable {
			out = append(out, p)
		}
	}
	return out
}
