// model.go — THROWAWAY (CE01 spike). The deterministic model of "a goal as a sequence of
// work-units". A goal (KRD §56: idea→mirror→red→green) is decomposed into the ordered units of
// effort an agent must spend to drive its red set green: load context, derive the mirror form,
// scaffold the package, write the code, wire the projection, run the sensors. Each unit costs a
// fixed number of tokens (an estimate, see EstimateTokens). Two SIMILAR goals share a subset of
// these units (the "motif"/pattern); CE01 measures whether CAPTURING goal-1's pattern lets
// goal-2 REUSE those shared units instead of re-deriving them — the compound-engineering claim.
//
// ALL pure functions (determinism-first, CLAUDE.md §6/§8): same goals + same capture -> same
// numbers, so the go/no-go verdict is reproducible (TestReproducible replays it). No LLM, no
// clock, no rng — the EXPANSION of a captured pattern is a pure function (roadmap CE: "PAS
// d'apprentissage de la fitness"), not a learned model.
package compound

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
)

// Origin records WHY a unit's cost is what it is for goal-2 — the provenance of any saving, so a
// "reduction" is never an unexplained number (CLAUDE.md §8: an override is a recorded decision).
type Origin string

const (
	// Derived: goal-2 paid the unit in full (no capture, or capture did not cover it).
	Derived Origin = "derived"
	// ReusedProcedural: a KindProcedural memory entry captured from goal-1 (S31) replayed the
	// unit's GESTURE — the agent recalls the procedure instead of re-deriving it.
	ReusedProcedural Origin = "reused_procedural"
	// ReusedBehavior: a captured candidate behavior-macro (§24.6) EXPANDED (pure function,
	// dry-run) into the unit's attributes/relations/fixtures instead of hand-authoring them.
	ReusedBehavior Origin = "reused_behavior"
)

// Unit is one work-unit of a goal: a named gesture with a token cost and a "shareable" flag
// marking whether two similar goals can share it (the pattern surface). A unit that is NOT
// shareable is intrinsic to the specific goal and must always be derived afresh.
type Unit struct {
	Name      string
	Tokens    int  // estimated tokens to DERIVE this unit from scratch
	Shareable bool // true => part of the reusable motif across similar goals
	// ReusedVia, when a captured pattern covers this unit, is the capture mode that replays it.
	ReusedVia Origin // Derived unless covered by capture
}

// Goal is an ordered list of work-units driving one red set to green.
type Goal struct {
	ID    string
	Units []Unit
}

// Cost is the total estimated token effort of a goal: the sum of its units' costs. When a unit is
// reused from capture, its cost is REPLACED by the (much smaller) replay cost — recalling a
// procedure or expanding a behavior is cheap relative to deriving it from scratch.
type Cost struct {
	GoalID      string
	TotalTokens int
	PerUnit     []UnitCost
}

// UnitCost is the realized cost of one unit on a goal run, with its origin.
type UnitCost struct {
	Name   string
	Tokens int
	Origin Origin
}

// replayCost is the DECLARED (above-the-line, not learned) cost of replaying a captured unit
// instead of deriving it: recalling a procedural memory entry (S31 similarity-recall) or
// expanding a behavior-macro (a pure dry-run) costs a small fixed overhead — the recall query +
// reading the captured artifact — far below the from-scratch derivation. Conservative on purpose
// so the spike understates the gain rather than inflating it.
const replayCost = 20

// CostOf computes a goal's cost. captured is the set of unit-names whose PATTERN was captured
// from a prior similar goal (empty => the baseline "no capture" run). via maps each captured unit
// to HOW it is replayed (procedural recall or behavior expansion). A unit is reused iff it is
// shareable AND present in captured; then it costs replayCost with the recorded origin, otherwise
// it costs its full derivation tokens with Origin=Derived. Pure: deterministic over its inputs.
func CostOf(g Goal, captured map[string]bool, via map[string]Origin) Cost {
	c := Cost{GoalID: g.ID}
	for _, u := range g.Units {
		uc := UnitCost{Name: u.Name, Tokens: u.Tokens, Origin: Derived}
		if u.Shareable && captured[u.Name] {
			uc.Tokens = replayCost
			if o, ok := via[u.Name]; ok {
				uc.Origin = o
			} else {
				uc.Origin = ReusedProcedural
			}
		}
		c.TotalTokens += uc.Tokens
		c.PerUnit = append(c.PerUnit, uc)
	}
	return c
}

// Pattern is what CAPTURING goal-1 produces: the set of shareable unit-names and, for each, the
// capture mode (procedural recall vs behavior-macro expansion). This is the artifact CE03 would
// persist as a KindProcedural memory entry + a candidate behavior via firewall.ViaIdea — here it
// is just measured, never persisted (the spike writes no truth, the wall is intact).
type Pattern struct {
	GoalID string
	Units  map[string]Origin // shareable unit-name -> how goal-2 would replay it
	Hash   string            // content hash of the captured pattern (determinism: stable id)
}

// Capture extracts the reusable pattern from a COMPLETED goal: every shareable unit, tagged with
// the capture mode. A unit is captured as a behavior-macro expansion when its name marks it as a
// SPEC unit (mirror/fixture/contract — expandable by a pure function, §24.6); otherwise as a
// procedural recall (a replayable gesture). Pure function of the goal (determinism-first: the
// "expansion d'une behavior est une fonction pure").
func Capture(g Goal) Pattern {
	p := Pattern{GoalID: g.ID, Units: map[string]Origin{}}
	for _, u := range g.Units {
		if !u.Shareable {
			continue
		}
		p.Units[u.Name] = captureMode(u.Name)
	}
	p.Hash = hashPattern(g.ID, p.Units)
	return p
}

// captureMode decides, deterministically, whether a shareable unit is replayed by EXPANDING a
// behavior-macro (spec-bearing units: mirror, fixture, contract, behavior) or by RECALLING a
// procedural memory entry (everything else). Spec units are the ones §24.6 can expand as a pure
// function; the rest are gestures captured into KindProcedural memory (S31).
func captureMode(unit string) Origin {
	switch unit {
	case "derive_mirror", "write_fixture", "cross_contract", "expand_behavior":
		return ReusedBehavior
	default:
		return ReusedProcedural
	}
}

// CapturedSet flattens a Pattern to the (set, via) pair CostOf consumes.
func (p Pattern) CapturedSet() (map[string]bool, map[string]Origin) {
	set := map[string]bool{}
	via := map[string]Origin{}
	for name, origin := range p.Units {
		set[name] = true
		via[name] = origin
	}
	return set, via
}

// hashPattern content-addresses a captured pattern (stable across runs — the names are sorted so
// map iteration order never leaks into the hash). Mirrors S01's content-addressing discipline.
func hashPattern(goalID string, units map[string]Origin) string {
	names := make([]string, 0, len(units))
	for n := range units {
		names = append(names, n)
	}
	sort.Strings(names)
	h := sha256.New()
	h.Write([]byte(goalID))
	for _, n := range names {
		h.Write([]byte{0})
		h.Write([]byte(n))
		h.Write([]byte{0})
		h.Write([]byte(units[n]))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}
