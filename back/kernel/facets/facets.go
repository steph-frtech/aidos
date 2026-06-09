// Package facets implements FK02 — the eight canonical KRD facets (FKE-1.3), the
// COLLAPSIBLE facet-set a kernel declares, and the validator that refuses a kernel
// with no functional facet, an empty facet, or a declared facet missing its proof pair.
//
// KRD FKE-1.3: a facet is an INTRINSIC LENS on the same six-pair skeleton (Spec →
// Behaviour → Scenarios → Model → Contract → Evidence ↔ their reflections), read
// through a question about the kernel's internals. Eight canonical lenses, CLOSED set:
//
//	F  Fonctionnel        — correct par l'exemple (the functional behaviour)
//	I  Invariants ∀       — vrai partout (universal invariants, not just an example)
//	S  Sécurité           — sûr (security: scans, policy, injection evals)
//	B  Budgets/Perf       — viable (performance efficiency, perf/cost budgets)
//	R  Fiabilité/Résilience— résilient (chaos, failover, restore, breakers)
//	V  Évolutivité/Migration— durable (expand-contract migration, backfill, restore)
//	M  Maintenabilité&Arch — sain (the 2nd ratchet §47: declared arch ↔ proven structure)
//	X  Expérience/Usability — utilisable (SOFT truth §13.6, ExperienceClaim: informs, never blocks)
//
// COLLAPSIBLE (anti-explosion, KRD FKE-1.3): a kernel instantiates a facet ONLY if it
// carries that nature of truth. The FUNCTIONAL facet (F) is ALWAYS present — the
// INCOMPRESSIBLE minimum is its intent (s1, even one line) + its proof pair (s4↔s5/s6).
// A pure sort function carries F + I + M, not S/B/V/R/X; a PII user-facing endpoint
// carries all eight; a declarative view-kernel may carry only F + X (+ minimal M). One
// never instantiates an EMPTY facet — "the smallest ratchet that clicks".
//
// THE COMPLETENESS LAW, FACET-AWARE (FKE-1.3 conséquence 5): a declared facet missing
// (or diverging on) its required proof pair is a MONSTER — a security hole, a perf
// regression, a data-losing migration, an unproven invariant are monsters, exactly like
// a missing functional test. X is the soft exception: its missing pair is ADVISORY
// (informs, never hard-blocks — §13.6).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Validate and Hash are PURE, TOTAL functions over
// a FacetSet value: no DB, no clock, no rng, no I/O, no LLM. Same FacetSet ⇒ same verdict,
// same hash. READ-ONLY against truth — this package writes nothing (the wall, CLAUDE.md §2):
// the facet-set is set on a record by the privileged transition at the legal door, never
// hand-posed.
package facets

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
)

// Facet is one of the eight canonical KRD lenses (FKE-1.3). It is a CLOSED set: the
// code letter is the stable identifier (F/I/S/B/R/V/M/X), never invented at runtime.
type Facet string

const (
	// FacetFunctional (F) — correct par l'exemple. ALWAYS present (incompressible).
	FacetFunctional Facet = "F"
	// FacetInvariants (I) — vrai partout: universal invariants (∀, not a single example).
	FacetInvariants Facet = "I"
	// FacetSecurity (S) — sûr: security (scans, policy, injection evals).
	FacetSecurity Facet = "S"
	// FacetBudgets (B) — viable: performance/cost budgets (efficiency).
	FacetBudgets Facet = "B"
	// FacetReliability (R) — résilient: reliability/resilience (chaos, failover, restore).
	FacetReliability Facet = "R"
	// FacetEvolvability (V) — durable: evolvability/migration (expand-contract, backfill).
	FacetEvolvability Facet = "V"
	// FacetMaintainability (M) — sain: maintainability & architecture (the 2nd ratchet §47).
	FacetMaintainability Facet = "M"
	// FacetExperience (X) — utilisable: experience/usability (SOFT, §13.6 — informs, never blocks).
	FacetExperience Facet = "X"
)

// facetName maps each facet to its canonical KRD name. Declared, never derived.
var facetName = map[Facet]string{
	FacetFunctional:      "fonctionnel",
	FacetInvariants:      "invariants",
	FacetSecurity:        "sécurité",
	FacetBudgets:         "budgets",
	FacetReliability:     "fiabilité",
	FacetEvolvability:    "évolutivité",
	FacetMaintainability: "maintenabilité",
	FacetExperience:      "expérience",
}

// facetOrder is the canonical F→X enumeration order of the eight lenses (the octuor:
// correct par l'exemple · vrai partout · sûr · viable · résilient · durable · sain ·
// utilisable). Declared, never derived from map iteration, so Facets() and every
// projection are stable (content-addressing depends on it).
var facetOrder = []Facet{
	FacetFunctional,
	FacetInvariants,
	FacetSecurity,
	FacetBudgets,
	FacetReliability,
	FacetEvolvability,
	FacetMaintainability,
	FacetExperience,
}

// softFacets are the SOFT-truth facets (§13.6): their missing/diverging proof pair is
// ADVISORY, not a hard monster. X (experience) is the only soft facet — it informs the
// decision, never hard-blocks the ratchet.
var softFacets = map[Facet]bool{
	FacetExperience: true,
}

// Facets returns the eight canonical KRD facets in canonical F→X order. Used by the
// validator and the Workbench filter so the set of lenses is never invented.
func Facets() []Facet {
	out := make([]Facet, len(facetOrder))
	copy(out, facetOrder)
	return out
}

// Name returns the canonical KRD name of a facet ("fonctionnel"…"expérience"); an
// out-of-enum facet returns "unknown".
func (f Facet) Name() string {
	if n, ok := facetName[f]; ok {
		return n
	}
	return "unknown"
}

// IsCanonical reports whether f is one of the eight closed-set facets.
func (f Facet) IsCanonical() bool {
	_, ok := facetName[f]
	return ok
}

// IsSoft reports whether f is a SOFT-truth facet (§13.6) whose missing proof pair is
// advisory, not a hard monster. Only X is soft.
func (f Facet) IsSoft() bool {
	return softFacets[f]
}

// String renders the facet as "<letter>:<name>" for logs and the panel.
func (f Facet) String() string {
	return fmt.Sprintf("%s:%s", string(f), f.Name())
}

// Instance is ONE facet a kernel declares it instantiates: the lens, whether its
// INTENT (s1) is declared, and whether its PROOF PAIR (s4↔s5/s6 — the
// declared↔proven reflection) is present. The INCOMPRESSIBLE minimum of any
// instantiated facet is Intent ∧ HasProofPair (FKE-1.3 decision (b)).
//
// A facet is "empty" when neither its intent nor its proof pair is declared — one
// never instantiates an empty facet (the validator refuses it). A facet whose intent
// is declared but whose proof pair is missing is a MONSTER (advisory for the soft X).
type Instance struct {
	// Facet — which of the eight lenses this instance declares.
	Facet Facet `json:"facet"`
	// HasIntent — the intentional half (s1, even one line) is declared.
	HasIntent bool `json:"has_intent"`
	// HasProofPair — the proof pair (s4↔s5/s6: declared ↔ proven) is present.
	HasProofPair bool `json:"has_proof_pair"`
}

// FacetSet is the COLLAPSIBLE set of facets a kernel declares it instantiates
// (FKE-1.3). A kernel carries ONLY the facets matching its nature of truth; F is
// always present. The set is the kernel's facet COORDINATE (the orthogonal axis of
// FKE-1.4, paired with the truth_level vertical axis).
type FacetSet struct {
	// KernelID — the kernel whose facets these are (for the panel/record; not hashed
	// into the facet signature, which is over the facet declarations only).
	KernelID string `json:"kernel_id,omitempty"`
	// Instances — the declared facet instances, one per instantiated lens.
	Instances []Instance `json:"instances"`
}

// Validation errors of the facet validator. Each is a MONSTER class (FKE-1.3
// conséquence 5) except where the soft regime (X) downgrades it to advisory.
var (
	// ErrNoFunctionalFacet — the kernel declares no functional facet (F). F is the
	// incompressible facet; a kernel without it is refused (done-criterion: "un kernel
	// sans facette fonctionnelle refusé").
	ErrNoFunctionalFacet = errors.New("facets: kernel declares no functional facet (F is incompressible — always present)")
	// ErrEmptyFacet — a declared facet carries neither intent nor proof pair. One never
	// instantiates an empty facet ("le plus petit cliquet qui clique").
	ErrEmptyFacet = errors.New("facets: a declared facet is empty (no intent, no proof pair) — never instantiate an empty facet")
	// ErrMissingProofPair — a declared facet has its intent but is MISSING its proof pair.
	// This is the facet-aware MONSTER (a security hole / perf regression / lossy migration /
	// unproven invariant, like a missing functional test). Soft (X) is downgraded to advisory.
	ErrMissingProofPair = errors.New("facets: a declared facet is missing its proof pair (intent without proof = monster)")
	// ErrUnknownFacet — a declared facet is outside the closed eight-lens set.
	ErrUnknownFacet = errors.New("facets: declared facet is not one of the eight canonical lenses (F/I/S/B/R/V/M/X)")
	// ErrDuplicateFacet — the same facet is declared twice in one set.
	ErrDuplicateFacet = errors.New("facets: a facet is declared more than once in the set")
)

// Issue is one validator finding against a FacetSet: which facet, the error class, and
// whether it is a hard monster (blocking) or advisory (the soft X regime).
type Issue struct {
	// Facet — the lens the issue concerns (empty for set-level issues like "no F").
	Facet Facet `json:"facet,omitempty"`
	// Code — the error class (one of the package errors, by Error() text).
	Code string `json:"code"`
	// Advisory — true iff this is a SOFT-truth issue (X) that informs but does not block.
	Advisory bool `json:"advisory"`
}

// Result is the verdict of the facet validator for one FacetSet: whether it is valid
// (no hard monster), the ordered issues, and whether the functional facet is present.
type Result struct {
	// Valid — true iff there is no HARD (non-advisory) issue. Advisory issues (soft X)
	// do not flip Valid (they inform, never block — §13.6).
	Valid bool `json:"valid"`
	// HasFunctional — whether the incompressible F facet is present.
	HasFunctional bool `json:"has_functional"`
	// Issues — the findings, in canonical facet order (set-level issues first).
	Issues []Issue `json:"issues"`
}

// Validate is the deterministic, pure, TOTAL facet validator (FKE-1.3). It checks the
// three rules of the collapsible facet-set:
//
//  1. The FUNCTIONAL facet (F) is present (incompressible) — else ErrNoFunctionalFacet.
//  2. No declared facet is EMPTY (no intent, no proof pair) — else ErrEmptyFacet.
//  3. Every declared (non-empty) facet has its PROOF PAIR — else ErrMissingProofPair
//     (a MONSTER; advisory only for the soft X facet, §13.6).
//
// It also rejects an unknown (out-of-closed-set) facet and a duplicate facet. It is
// total over every FacetSet (including the empty set, which fails rule 1) — never panics,
// never reads a clock/DB/rng. Issues are returned in canonical facet order so the verdict
// is stable. Valid is true iff there is no HARD issue (the soft X never flips it).
func Validate(fs FacetSet) Result {
	res := Result{Valid: true}

	seen := map[Facet]bool{}
	hasF := false

	// Walk instances in their declared order but collect issues keyed by facet so the
	// output can be sorted into canonical order (determinism).
	byFacet := map[Facet][]Issue{}
	var setIssues []Issue

	for _, inst := range fs.Instances {
		f := inst.Facet
		if !f.IsCanonical() {
			byFacet[f] = append(byFacet[f], Issue{Facet: f, Code: ErrUnknownFacet.Error()})
			continue
		}
		if seen[f] {
			byFacet[f] = append(byFacet[f], Issue{Facet: f, Code: ErrDuplicateFacet.Error()})
			continue
		}
		seen[f] = true
		if f == FacetFunctional {
			hasF = true
		}

		empty := !inst.HasIntent && !inst.HasProofPair
		switch {
		case empty:
			byFacet[f] = append(byFacet[f], Issue{Facet: f, Code: ErrEmptyFacet.Error()})
		case !inst.HasProofPair:
			// intent without proof pair = monster (advisory for soft X).
			byFacet[f] = append(byFacet[f], Issue{
				Facet:    f,
				Code:     ErrMissingProofPair.Error(),
				Advisory: f.IsSoft(),
			})
		}
	}

	res.HasFunctional = hasF
	if !hasF {
		setIssues = append(setIssues, Issue{Code: ErrNoFunctionalFacet.Error()})
	}

	// Emit set-level issues first, then per-facet issues in canonical order.
	res.Issues = append(res.Issues, setIssues...)
	for _, f := range facetOrder {
		res.Issues = append(res.Issues, byFacet[f]...)
		delete(byFacet, f)
	}
	// Any remaining (unknown facets, not in canonical order) — sort by letter for stability.
	var rest []Facet
	for f := range byFacet {
		rest = append(rest, f)
	}
	sort.Slice(rest, func(i, j int) bool { return rest[i] < rest[j] })
	for _, f := range rest {
		res.Issues = append(res.Issues, byFacet[f]...)
	}

	for _, is := range res.Issues {
		if !is.Advisory {
			res.Valid = false
			break
		}
	}
	return res
}

// Canonicalize returns the deterministic, order-independent form of a FacetSet's facet
// declarations: the instances sorted into canonical facet order (F→X), with set-level
// fields (KernelID) excluded — the facet SIGNATURE is over the declarations only. Two
// FacetSets that declare the same facets with the same intent/proof flags canonicalise
// identically regardless of declaration order. PURE.
func Canonicalize(fs FacetSet) []Instance {
	rank := map[Facet]int{}
	for i, f := range facetOrder {
		rank[f] = i
	}
	out := make([]Instance, len(fs.Instances))
	copy(out, fs.Instances)
	// Total order over the WHOLE Instance (facet rank, then letter, then the flags) so
	// canonicalisation is fully order-independent EVEN WITH duplicate facets — the
	// content address must not depend on declaration order (the round-trip done-criterion).
	sort.Slice(out, func(i, j int) bool {
		ri, oki := rank[out[i].Facet]
		rj, okj := rank[out[j].Facet]
		switch {
		case oki != okj:
			return oki // canonical facets before unknown ones
		case oki && okj && ri != rj:
			return ri < rj
		case out[i].Facet != out[j].Facet:
			return out[i].Facet < out[j].Facet // unknown facets, by letter
		case out[i].HasIntent != out[j].HasIntent:
			return !out[i].HasIntent && out[j].HasIntent
		default:
			return !out[i].HasProofPair && out[j].HasProofPair
		}
	})
	return out
}

// Hash returns the canonical SHA-256 hex digest of a FacetSet's facet declarations
// (the content address of the facet coordinate). It hashes the CANONICALIZED instances
// only (order-independent, KernelID-independent), so the round-trip is content-addressed
// (the done-criterion "round-trip content-adressé"): the same declared facets always
// produce the same address regardless of declaration order. Matches records.Hash so the
// facet signature lands under the same address scheme as the kernel records. PURE.
func Hash(fs FacetSet) string {
	canon := Canonicalize(fs)
	b, _ := json.Marshal(canon)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
