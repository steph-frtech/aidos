// Package anatomy implements the ANATOMY of a kernel (FKE — the 1-for-1 reading around the
// wall, CLAUDE.md §2): the SIX mirror-pairs each kernel carries, and the deterministic VOYANT
// (🟢/🔴/🟡) COMPUTED per pair (never declared, §8 "done est computé").
//
// THE SIX PAIRS (the closed, ordered set). Above the wall the human DECLARES (intention); below
// the wall the MACHINE PROVES (the executed, verified side):
//
//  1. spec_doc          — what is specified ↔ what is documented/derived
//  2. behavior_results  — the declared behaviour ↔ the observed results
//  3. scenarios_tests   — the Gherkin scenarios ↔ the tests that run them
//  4. model_projection  — the entity/AST ↔ its emitted projection (Go/DDL/TS)
//  5. contract_code     — the contract/Pact ↔ the code honouring it
//  6. evidence          — the expected evidence ↔ the evidence actually observed
//
// THE VOYANT TRUTH-TABLE (the judge is a calcul, §8). The voyant is a PURE function of the two
// sides (declared × proven):
//
//	declared ∧ proven=pass → 🟢 GREEN (the two reflect)
//	declared ∧ proven=fail → 🔴 RED   (a divergence — a monster)
//	everything else        → 🟡 AMBER ("not yet reflected": pending/absent, vacuity, or a
//	                                    proven-orphan with no declaration above)
//
// RED is carried ONLY by a machine FAILURE under a declared side: the MACHINE alone decides red.
//
// THE OVERALL VOYANT is the WORST of the six (red > amber > green) — computed, never declared.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Build + ComputeVoyant are PURE + TOTAL: no DB, no clock,
// no rng, no I/O, no LLM. Same state → same anatomy (same voyants, same order). The
// reproducibility mirror (rapid) pins the exhaustive truth-table, the six pairs always present
// and ordered, the declared side always ABOVE the wall ∧ the proven side BELOW.
//
// THE WALL (CLAUDE.md §2). This package PROJECTS a reading of a kernel; it writes NOTHING. The
// Anatomy is a below-the-waterline projection, never a truth. The pair states come from the
// kernel store / the mirror runners (handed in — never fetched here), so Build stays a pure
// function of its input.
//
// WHY GO IS THE SOURCE (ADR 0092). The voyant truth-table is a deterministic pure function, so
// per the determinism-first mandate it MUST be code and the Go engine is the SINGLE authoritative
// source — the TS twin (front/web/lib/v2/anatomy.ts) becomes the demo fallback only.
package anatomy

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

// PairKind is the canonical identity of one of the six mirror-pairs (closed, ordered set).
type PairKind string

const (
	PairSpecDoc         PairKind = "spec_doc"
	PairBehaviorResults PairKind = "behavior_results"
	PairScenariosTests  PairKind = "scenarios_tests"
	PairModelProjection PairKind = "model_projection"
	PairContractCode    PairKind = "contract_code"
	PairEvidence        PairKind = "evidence"
)

// pairOrder is the canonical, total order of the six mirror-pairs (declared, never learned).
var pairOrder = []PairKind{
	PairSpecDoc,
	PairBehaviorResults,
	PairScenariosTests,
	PairModelProjection,
	PairContractCode,
	PairEvidence,
}

// PairKinds returns the six mirror-pair kinds in canonical order. The panel renders from this;
// the validator gates membership against it. PURE.
func PairKinds() []PairKind {
	out := make([]PairKind, len(pairOrder))
	copy(out, pairOrder)
	return out
}

// IsPairKind reports whether s is one of the six closed mirror-pair kinds.
func IsPairKind(s PairKind) bool {
	for _, k := range pairOrder {
		if k == s {
			return true
		}
	}
	return false
}

// DeclaredState is the state of the DECLARED side (above the wall): has the human declared it?
type DeclaredState string

const (
	Declared       DeclaredState = "declared"
	DeclaredAbsent DeclaredState = "absent"
)

func (d DeclaredState) valid() bool { return d == Declared || d == DeclaredAbsent }

// ProvenState is the state of the PROVEN side (below the wall — the machine): pass | fail |
// pending | absent.
type ProvenState string

const (
	ProvenPass    ProvenState = "pass"
	ProvenFail    ProvenState = "fail"
	ProvenPending ProvenState = "pending"
	ProvenAbsent  ProvenState = "absent"
)

func (p ProvenState) valid() bool {
	return p == ProvenPass || p == ProvenFail || p == ProvenPending || p == ProvenAbsent
}

// Voyant is the computed indicator of a pair (never declared).
type Voyant string

const (
	VoyantGreen Voyant = "green"
	VoyantRed   Voyant = "red"
	VoyantAmber Voyant = "amber"
)

// WallSide names which side of the wall a face sits on.
type WallSide string

const (
	SideAbove WallSide = "above" // declared (human)
	SideBelow WallSide = "below" // proven (machine, read-only)
)

// PairState is the raw input for one pair: what is declared above, what is proven below.
type PairState struct {
	Kind     PairKind      `json:"kind"`
	Declared DeclaredState `json:"declared"`
	Proven   ProvenState   `json:"proven"`
}

// DeclaredFace / ProvenFace are the two faces of a computed pair as the panel renders them.
type DeclaredFace struct {
	Side  WallSide      `json:"side"`
	State DeclaredState `json:"state"`
}

type ProvenFace struct {
	Side  WallSide    `json:"side"`
	State ProvenState `json:"state"`
}

// MirrorPair is one computed mirror-pair: its two faces around the wall + its computed voyant.
type MirrorPair struct {
	Kind     PairKind     `json:"kind"`
	Declared DeclaredFace `json:"declared"`
	Proven   ProvenFace   `json:"proven"`
	Voyant   Voyant       `json:"voyant"`
}

// Counts is the per-voyant tally (deterministic).
type Counts struct {
	Green int `json:"green"`
	Red   int `json:"red"`
	Amber int `json:"amber"`
}

// Anatomy is the computed reading of a kernel: the six ordered pairs + the overall voyant + the
// per-voyant counts. Content-addressed (Hash) so the same state always has the same address.
type Anatomy struct {
	KernelID string       `json:"kernel_id"`
	Pairs    []MirrorPair `json:"pairs"`
	Overall  Voyant       `json:"overall"`
	Counts   Counts       `json:"counts"`
}

// Hash content-addresses an Anatomy (reproducible: same state ⇒ same hash). PURE.
func (a Anatomy) Hash() string {
	b, _ := json.Marshal(a)
	var v any
	if json.Unmarshal(b, &v) == nil {
		if canon, err := json.Marshal(v); err == nil {
			sum := sha256.Sum256(canon)
			return hex.EncodeToString(sum[:])
		}
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Anatomy errors (a kernel state outside the closed set).
var (
	ErrEmptyKernelID = errors.New("anatomy: empty kernel id (a kernel without identity)")
	ErrUnknownPair   = errors.New("anatomy: a pair kind is not one of the six (closed set)")
	ErrDuplicatePair = errors.New("anatomy: a pair kind appears twice")
	ErrMissingPair   = errors.New("anatomy: a mirror-pair of the closed six is missing")
	ErrInvalidState  = errors.New("anatomy: a pair carries an out-of-set declared/proven state")
)

// ComputeVoyant is the PURE truth-table of a pair (the judge is a calcul, §8). RED is carried
// ONLY by a machine FAILURE under a declared side; everything else that is not a clean
// declared∧pass is AMBER ("not yet reflected"). TOTAL: every (declared, proven) maps to one voyant.
func ComputeVoyant(declared DeclaredState, proven ProvenState) Voyant {
	if declared == Declared && proven == ProvenPass {
		return VoyantGreen
	}
	if declared == Declared && proven == ProvenFail {
		return VoyantRed
	}
	return VoyantAmber
}

// voyantRank gives the gravity order (the worst wins for the overall summary).
func voyantRank(v Voyant) int {
	switch v {
	case VoyantRed:
		return 2
	case VoyantAmber:
		return 1
	default:
		return 0
	}
}

// Validate is the PURE shape guard of a kernel's anatomy state: a non-empty kernel id, exactly
// the six closed pairs (no unknown, no duplicate, none missing), and every declared/proven state
// in its closed set. Returns the (deterministic) list of typed errors. PURE + TOTAL.
func Validate(kernelID string, states []PairState) []error {
	var errs []error
	if kernelID == "" {
		errs = append(errs, ErrEmptyKernelID)
	}
	seen := map[PairKind]bool{}
	hasUnknown, hasDuplicate, hasInvalid := false, false, false
	for _, s := range states {
		if !IsPairKind(s.Kind) {
			hasUnknown = true
			continue
		}
		if seen[s.Kind] {
			hasDuplicate = true
		} else {
			seen[s.Kind] = true
		}
		if !s.Declared.valid() || !s.Proven.valid() {
			hasInvalid = true
		}
	}
	if hasUnknown {
		errs = append(errs, ErrUnknownPair)
	}
	if hasDuplicate {
		errs = append(errs, ErrDuplicatePair)
	}
	if hasInvalid {
		errs = append(errs, ErrInvalidState)
	}
	for _, k := range pairOrder {
		if !seen[k] {
			errs = append(errs, ErrMissingPair)
			break
		}
	}
	return errs
}

// Build composes the anatomy of a kernel from the raw state of the six pairs — the core. PURE +
// TOTAL + DETERMINISTIC:
//
//  1. validate the input (kernel id, the closed six pairs, the closed states); else return the error;
//  2. for each pair IN CANONICAL ORDER, place the declared face ABOVE the wall and the proven face
//     BELOW, and COMPUTE the voyant (ComputeVoyant);
//  3. compute the overall voyant (the worst of six) and the per-voyant counts.
//
// Same state ⇒ same anatomy (same voyants, same order). Writes nothing (the wall).
func Build(kernelID string, states []PairState) (Anatomy, error) {
	if errs := Validate(kernelID, states); len(errs) > 0 {
		return Anatomy{}, fmt.Errorf("%w (and %d more)", errs[0], len(errs)-1)
	}
	byKind := make(map[PairKind]PairState, len(states))
	for _, s := range states {
		byKind[s.Kind] = s
	}
	pairs := make([]MirrorPair, 0, len(pairOrder))
	counts := Counts{}
	overall := VoyantGreen
	for _, kind := range pairOrder {
		s := byKind[kind] // Validate guaranteed presence
		v := ComputeVoyant(s.Declared, s.Proven)
		pairs = append(pairs, MirrorPair{
			Kind:     kind,
			Declared: DeclaredFace{Side: SideAbove, State: s.Declared},
			Proven:   ProvenFace{Side: SideBelow, State: s.Proven},
			Voyant:   v,
		})
		switch v {
		case VoyantGreen:
			counts.Green++
		case VoyantRed:
			counts.Red++
		case VoyantAmber:
			counts.Amber++
		}
		if voyantRank(v) > voyantRank(overall) {
			overall = v
		}
	}
	return Anatomy{KernelID: kernelID, Pairs: pairs, Overall: overall, Counts: counts}, nil
}
