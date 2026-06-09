// Package prooftype is FK05 — the EXPAND half of the E0-E7 migration (KRD FKE-16,
// "Décision actée grill 2026-06-07: migration COMPLÈTE vers E0-E7, par expand-contract").
// It declares the N0-N5 → E0-E7 mapping as a PURE, TOTAL function and the additive,
// E-typed proof contract a kernel carries. It is the *expand* step: it is COMPATIBLE
// with the build-in-progress — it adds E-typing ALONGSIDE the existing N-levels, it
// changes no schema, it modifies NO existing N-typed mirror. The *contract* step (the
// dry schema switch of `mirrors`/`cert_language`/panels/docs to E) is FK16, post-S117.
//
// THE N0-N5 LADDER (KRD Livre IV §14 — the V-slices). The six proof levels of the V:
//
//	N0 Intention / journey   (acceptance — Gherkin/Godog/Playwright)
//	N1 Métier / invariant ∀  (property — rapid/fast-check)
//	N2 Fonctionnel / workflow (fixture — Operation DSL state→cmd→events)
//	N3 Contrat / port        (contract — Pact, schema)
//	N4 Code / unit           (go test / Vitest)
//	N5 Infra / adaptateur    (Pact provider verification + Testcontainers)
//
// THE E0-E7 LADDER (KRD FKE-16 — evidence-first). "Remplacer « test » par evidence":
//
//	E0 none                            E1 syntax/typecheck/lint
//	E2 unit tests                      E3 contract/integration
//	E4 security/regression             E5 fuzz/mutation/benchmark/evals
//	E6 runtime proof/monitoring/rollback   E7 formal/quasi-formal proof
//
// THE MAPPING (KRD FKE-16 line: "N0 journey↔E3, N1 invariant↔E5(property), N2 workflow↔E3
// (fixture), N3 contrat↔E3(Pact), N4 unit↔E1/E2, N5 infra↔E3/E4"). MapNToE is a CLOSED,
// DECLARED table — never learned, never an LLM judgment (§8: weights/thresholds declared
// above the line). Each N maps to a NON-EMPTY, ascending set of E levels: the evidence
// the N-slice *inherently* requires. The mapping is TOTAL over the six N-levels and
// DETERMINISTIC (same N ⇒ same E set, byte-identical) — its reproducibility mirror pins it.
//
// THE ADDED E4/E6/E7 (FK05 objective). N0-N5 alone never names security (E4 — gosec/gitleaks/
// evals-injection), runtime+rollback (E6) or formal proof (E7). FKE-16 "ajoute explicitement
// E4 sécurité, E6 runtime et E7 formel au MÊME contrat de preuve." These three are NOT reached
// by the N→E base mapping; they are ADDED to a kernel's evidence contract by its FACETS (FK02):
// a kernel that instantiates S (sécurité) requires E4; one that instantiates R (fiabilité/
// rollback) requires E6; a kernel whose invariant is catastrophic-and-unsampleable (a T2 formal
// cap) requires E7. FacetEvidence is the declared facet → added-E table.
//
// DOUBLE-ÉTIQUETAGE ADDITIF (FK05 done-criterion: "zéro miroir N existant modifié"). EvidenceTag
// carries BOTH the legacy N-label AND the derived E-set on the SAME record, side by side. The N
// is preserved verbatim (the source of truth during the build); the E-set is DERIVED from it by
// MapNToE (a cache proven by the function, like truthlevel's stored_level). Building the tag
// never mutates the N — it only annotates. A kernel "affiche son evidence E-typée" by reading
// the tag; the N-typed mirror it reflects is untouched.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). MapNToE, FacetEvidence, ContractFor and Tag are PURE,
// TOTAL functions: no DB, no clock, no rng, no I/O, no LLM. Same input ⇒ same output (sorted,
// deduplicated, byte-stable). The mapping is authoritative code, never an agent. The
// reproducibility property mirror (prooftype_property_test.go) pins same N → same E.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING above the waterline. It READS an N-label
// (set by S06 at the legal door) and a facet-set (set by FK02) and DERIVES the E contract. It
// never writes `mirrors`/`cert_language`; the schema switch is FK16's job, gated by a changeset.
package prooftype

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// NLevel is one of the six KRD N0-N5 proof levels (the V-slices, Livre IV §14). It is the
// LEGACY label every mirror carries during the build; FK05 maps it to E without erasing it.
type NLevel string

const (
	// N0 — Intention / journey (acceptance: Gherkin run by Godog/Playwright).
	N0 NLevel = "N0"
	// N1 — Métier / invariant ∀ (property: rapid/fast-check).
	N1 NLevel = "N1"
	// N2 — Fonctionnel / workflow (fixture: Operation DSL state→cmd→events).
	N2 NLevel = "N2"
	// N3 — Contrat / port (contract: Pact, schema).
	N3 NLevel = "N3"
	// N4 — Code / unit (go test / Vitest).
	N4 NLevel = "N4"
	// N5 — Infra / adaptateur (Pact provider verification + Testcontainers).
	N5 NLevel = "N5"
)

// nLevelOrder is the canonical N0→N5 enumeration order. Declared, never derived from map
// iteration, so NLevels() and every projection are stable.
var nLevelOrder = []NLevel{N0, N1, N2, N3, N4, N5}

// NLevels returns the six KRD N-levels in canonical N0→N5 order. Used by the validator and the
// Workbench so the set of rungs is never invented.
func NLevels() []NLevel {
	out := make([]NLevel, len(nLevelOrder))
	copy(out, nLevelOrder)
	return out
}

// IsReal reports whether n is one of the six real N-levels (N0…N5). The zero value "" is not.
func (n NLevel) IsReal() bool {
	_, ok := nToE[n]
	return ok
}

// ELevel is one of the eight KRD E0-E7 evidence levels (FKE-16). It is an ORDERED ladder:
// E0 (none) the floor, E7 (formal) the ceiling. The numeric value is the rung.
type ELevel int

const (
	// E0 — none (no evidence).
	E0 ELevel = 0
	// E1 — syntax / typecheck / lint.
	E1 ELevel = 1
	// E2 — unit tests.
	E2 ELevel = 2
	// E3 — contract / integration.
	E3 ELevel = 3
	// E4 — security / regression (gosec/gitleaks/evals-injection — ADDED by FK05).
	E4 ELevel = 4
	// E5 — fuzz / mutation / benchmark / evals.
	E5 ELevel = 5
	// E6 — runtime proof / monitoring / rollback (ADDED by FK05).
	E6 ELevel = 6
	// E7 — formal / quasi-formal proof (ADDED by FK05).
	E7 ELevel = 7
)

// eName maps each E-level to its canonical KRD name. Declared, never derived.
var eName = map[ELevel]string{
	E0: "none",
	E1: "syntax/typecheck/lint",
	E2: "unit",
	E3: "contract/integration",
	E4: "security/regression",
	E5: "fuzz/mutation/benchmark/evals",
	E6: "runtime/monitoring/rollback",
	E7: "formal/quasi-formal",
}

// Name returns the canonical KRD name of an E-level; an out-of-enum level returns "unknown".
func (e ELevel) Name() string {
	if n, ok := eName[e]; ok {
		return n
	}
	return "unknown"
}

// IsReal reports whether e is one of the eight real E-levels (E0…E7).
func (e ELevel) IsReal() bool {
	_, ok := eName[e]
	return ok
}

// nToE is the CLOSED, DECLARED N0-N5 → E0-E7 mapping (KRD FKE-16, the mapping line). Each N
// maps to the evidence levels its slice INHERENTLY requires:
//
//	N0 journey   ↔ E3 (contract/integration — an acceptance journey is an integration proof)
//	N1 invariant ↔ E5 (property — a ∀ is proven by property/fuzz/mutation evidence)
//	N2 workflow  ↔ E3 (fixture — a state→cmd→events fixture is an integration proof)
//	N3 contrat   ↔ E3 (Pact — a port contract is a contract proof)
//	N4 unit      ↔ E1, E2 (unit code is typecheck/lint + unit-test evidence)
//	N5 infra     ↔ E3, E4 (an adapter is a contract proof PLUS security/regression evidence)
//
// Declared, never learned (§8). The E-sets are ascending and non-empty. This is the
// authoritative deterministic function — no LLM ever decides an N's evidence.
var nToE = map[NLevel][]ELevel{
	N0: {E3},
	N1: {E5},
	N2: {E3},
	N3: {E3},
	N4: {E1, E2},
	N5: {E3, E4},
}

// MapNToE is the PURE, TOTAL N→E mapping (FK05 core; FKE-16). It returns the (sorted, fresh)
// set of evidence levels an N-level inherently requires. TOTAL: an unknown/zero N maps to the
// EMPTY set (not a panic) — an unlabelled record demands no derived evidence. DETERMINISTIC:
// same N ⇒ byte-identical E set (the returned slice is a copy, sorted ascending). This is the
// reproducibility-mirror'd function (same input → same output).
func MapNToE(n NLevel) []ELevel {
	src, ok := nToE[n]
	if !ok {
		return []ELevel{}
	}
	out := make([]ELevel, len(src))
	copy(out, src)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// facetToE is the DECLARED facet → ADDED-evidence table (FK05 objective: "ajoute explicitement
// E4 sécurité, E6 runtime et E7 formel au MÊME contrat"). These E-levels are NOT reachable by
// the N→E base mapping for an arbitrary kernel; a kernel earns them by INSTANTIATING the facet
// (FK02 HasIntent):
//
//	S (sécurité)      → E4 (gosec/gitleaks/evals-injection — the security/regression evidence)
//	R (fiabilité)     → E6 (runtime proof/monitoring/rollback — the recovery evidence)
//	I (invariants ∀)  → E5 (a declared invariant is property/mutation-proven), AND E7 when the
//	                    invariant is a formal cap (carried by RequiresFormal, not the facet alone)
//	B (budgets)       → E5 (benchmark/load evidence is fuzz/benchmark-class)
//	V (évolutivité)   → E6 (migration integrity + data-rollback is runtime/recovery evidence)
//	M (maintenabilité)→ E1 (arch-fitness/lint is the syntax/lint-class second ratchet)
//	F (fonctionnel)   → (none added — F's evidence is the N→E base mapping itself)
//	X (expérience)    → (none added — X is SOFT §13.6, advisory, never a hard E obligation)
//
// Declared, never learned (§8). A facet absent from the table adds no E.
var facetToE = map[facets.Facet][]ELevel{
	facets.FacetSecurity:        {E4},
	facets.FacetReliability:     {E6},
	facets.FacetInvariants:      {E5},
	facets.FacetBudgets:         {E5},
	facets.FacetEvolvability:    {E6},
	facets.FacetMaintainability: {E1},
}

// FacetEvidence is the PURE, TOTAL facet → added-E mapping. It returns the (sorted, fresh) set of
// evidence levels a facet ADDS to a kernel's contract when the kernel instantiates it. TOTAL: a
// facet with no added evidence (F, X) maps to the EMPTY set. The soft facet X NEVER adds a hard E
// (§13.6) — it is absent from facetToE by design.
func FacetEvidence(f facets.Facet) []ELevel {
	src, ok := facetToE[f]
	if !ok {
		return []ELevel{}
	}
	out := make([]ELevel, len(src))
	copy(out, src)
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// KernelProof is the FK05 INPUT read-model: a kernel's legacy N-label, the facet-set it
// instantiates (FK02 HasIntent only), and whether it carries a formal cap (a catastrophic,
// unsampleable invariant — the rare T2 that earns E7). All three are READ from records set at
// the legal door; this package never writes them.
type KernelProof struct {
	// NLevel — the LEGACY N-label the kernel's mirror carries. Preserved verbatim.
	NLevel NLevel `json:"n_level"`
	// Facets — the COLLAPSIBLE facet-set the kernel instantiates (FK02). Only HasIntent facets
	// are passed in; a facet present here demands its added evidence.
	Facets []facets.Facet `json:"facets"`
	// RequiresFormal — the kernel's invariant is a formal cap (catastrophic ∧ unsampleable, the
	// rare T2). Only such a kernel earns E7 (CLAUDE.md §3, "Formal caps rare T2"). Declared, never
	// inferred by an LLM.
	RequiresFormal bool `json:"requires_formal"`
}

// EvidenceContract is the FK05 OUTPUT: the additive, E-typed proof contract of a kernel. It
// carries BOTH labels (double-étiquetage): the preserved N AND the derived E-set, plus the
// breakdown (which E came from the N base mapping, which from facets, whether E7 is required).
type EvidenceContract struct {
	// NLevel — the preserved legacy N-label (unchanged; the double-label's first half).
	NLevel NLevel `json:"n_level"`
	// FromN — the E-levels derived from the N base mapping (MapNToE).
	FromN []ELevel `json:"from_n"`
	// FromFacets — the E-levels ADDED by the instantiated facets (E4/E6/E5/E1…), deduplicated.
	FromFacets []ELevel `json:"from_facets"`
	// Required — the UNION of FromN, FromFacets and (E7 iff RequiresFormal), sorted ascending,
	// deduplicated. The full E-typed contract a kernel must satisfy. The double-label's second half.
	Required []ELevel `json:"required"`
}

// ContractFor is the PURE, TOTAL composition (FK05 core). It builds a kernel's E-typed evidence
// contract from its N-label and facets WITHOUT touching either input (additive). The Required set
// is the UNION of:
//
//	(a) MapNToE(NLevel)        — the base evidence the N-slice inherently requires,
//	(b) FacetEvidence(f) ∀f    — the E4/E6/E5/E1 added by each instantiated facet (FK05's added types),
//	(c) E7                     — iff RequiresFormal (the rare formal cap).
//
// DETERMINISTIC: same KernelProof ⇒ byte-identical contract (sorted, deduplicated). TOTAL: an
// empty/unknown N with no facets yields an empty contract, never a panic. This is authoritative
// code; no LLM decides a kernel's evidence obligations.
func ContractFor(k KernelProof) EvidenceContract {
	fromN := MapNToE(k.NLevel)

	// Accumulate facet-added evidence, deduplicated, in a stable order.
	seenFacet := map[ELevel]bool{}
	var fromFacets []ELevel
	// Iterate facets in the canonical FK02 order so the result is stable regardless of input order.
	for _, f := range facets.Facets() {
		if !containsFacet(k.Facets, f) {
			continue
		}
		for _, e := range FacetEvidence(f) {
			if !seenFacet[e] {
				seenFacet[e] = true
				fromFacets = append(fromFacets, e)
			}
		}
	}
	sort.Slice(fromFacets, func(i, j int) bool { return fromFacets[i] < fromFacets[j] })

	// Union into Required (dedup), then add E7 iff a formal cap.
	req := map[ELevel]bool{}
	for _, e := range fromN {
		req[e] = true
	}
	for _, e := range fromFacets {
		req[e] = true
	}
	if k.RequiresFormal {
		req[E7] = true
	}
	required := make([]ELevel, 0, len(req))
	for e := range req {
		required = append(required, e)
	}
	sort.Slice(required, func(i, j int) bool { return required[i] < required[j] })

	if fromN == nil {
		fromN = []ELevel{}
	}
	if fromFacets == nil {
		fromFacets = []ELevel{}
	}
	return EvidenceContract{
		NLevel:     k.NLevel,
		FromN:      fromN,
		FromFacets: fromFacets,
		Required:   required,
	}
}

// EvidenceTag is the DOUBLE-ÉTIQUETAGE ADDITIF record (FK05 done-criterion: "zéro miroir N
// existant modifié"). It carries the legacy N-label and the derived E-contract SIDE BY SIDE on
// the same record. The N is the preserved source; the E is a CACHE proven by ContractFor (like
// truthlevel's stored_level). Tag() builds it without mutating the N.
type EvidenceTag struct {
	// N — the legacy label, preserved verbatim (the existing mirror is untouched).
	N NLevel `json:"n"`
	// E — the derived E-typed contract (the additive annotation).
	E EvidenceContract `json:"e"`
}

// Tag is the PURE additive double-labeller (FK05). Given a kernel's N-label and facets, it returns
// the EvidenceTag pairing the PRESERVED N with the DERIVED E contract. It mutates nothing: the N is
// copied verbatim, the E is computed. This is how a kernel "affiche son evidence E-typée" while
// "zéro miroir N existant [n'est] modifié".
func Tag(k KernelProof) EvidenceTag {
	return EvidenceTag{N: k.NLevel, E: ContractFor(k)}
}

// containsFacet reports whether fs contains f (a small linear scan — the facet-set is ≤ 8).
func containsFacet(fs []facets.Facet, f facets.Facet) bool {
	for _, x := range fs {
		if x == f {
			return true
		}
	}
	return false
}
