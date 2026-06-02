// Package globalinvariant is the pure AST + cross-cell decision functions of KRD §49.1
// "GlobalInvariant — un invariant transverse est une exception coûteuse, pas le mode normal".
//
// A GlobalInvariant is a truth that spans MORE THAN ONE cell (bounded context) — distinct
// from the per-truth TruthScope (S15) that scopes a SINGLE truth's reach. Where TruthScope
// answers "how far does this one truth apply", a GlobalInvariant answers "this rule binds
// several cells at once" (KRD §49: "tout agrégat portant du PII doit implémenter
// Forgettable" — the cross-cell red wave passing every spanned cell au rouge). The bounded
// contexts stay the primary walls; the cross-cell invariant is the costly exception.
//
// It declares three FROZEN KRD §49.1 enums:
//   - scope             ∈ { local_cell, contract_pair, federation_policy }  — how many cells it crosses
//   - blast_radius      ∈ { small, bounded, global }                        — how far a violation propagates
//   - approval_required ∈ { cell_owner, both_contract_owners, architecture_owner } — the authority tier admission demands
//
// This package lands the typed AST, a pure Validate(gi) shape guard, and two pure functions:
//
//   - RedWave(gi, violatedCell) → []cellRef — given an invariant and the cell that violated
//     it, returns the set of cells the violation REDDENS. For local_cell it is exactly the
//     one cell; for contract_pair / federation_policy it is EVERY cell the invariant spans
//     (the §49 fan-out — a cross-cell violation never reddens fewer cells than the
//     invariant's reach). The fan-out reuses the S19 weighted-propagation semantics: a
//     load-bearing cross-cell link reddens the partner cell, a cosmetic one does not.
//
//   - Admit(gi, grantedApproval) → AdmissionDecision — returns admitted | blocked |
//     escalated PLUS a BlockReason (KRD §44.5) when the granted approval is NARROWER than
//     the blast_radius demands (e.g. a global invariant approved only by a cell_owner ⇒
//     blocked / INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS, how_to_fix
//     [escalate_to_architecture_owner]). The authority RESOLUTION reuses S16 authority.Decide
//     (the {required, granted} tiers map to an AuthorityGraph admission) — this package does
//     NOT fork the approver/veto/escalation logic.
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O. Validate /
// RedWave / Admit are total and deterministic — same input ⇒ same output — so the cross-cell
// red wave and the admission gate are replayable (the rapid property mirror pins this). The
// content-hash row id reuses the S02 records substrate (records.Hash(Canonicalize(body))) —
// it is NOT forked here. READ-ONLY against truth; it writes nothing (the wall, CLAUDE.md §2).
// It introduces the cross-cell invariant PRIMITIVE only and CLAIMS NO full federation /
// stage-5 stability (deferred S23/S47).
package globalinvariant

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/propagation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Scope is the FROZEN KRD §49.1 scope enum — how many cells the invariant crosses. Closed
// set of three; never extended here.
type Scope string

const (
	// ScopeLocalCell — the invariant lives inside ONE cell (not actually cross-cell).
	ScopeLocalCell Scope = "local_cell"
	// ScopeContractPair — the invariant binds exactly the two cells either side of a contract.
	ScopeContractPair Scope = "contract_pair"
	// ScopeFederationPolicy — the invariant binds a federation of cells (the §49 PII example).
	ScopeFederationPolicy Scope = "federation_policy"
)

// Scopes returns the three frozen §49.1 scopes in canonical order (so the set is never
// invented downstream — the validator, the Workbench legend).
func Scopes() []Scope { return []Scope{ScopeLocalCell, ScopeContractPair, ScopeFederationPolicy} }

// IsKnownScope reports whether s is one of the three frozen §49.1 scopes.
func IsKnownScope(s Scope) bool {
	switch s {
	case ScopeLocalCell, ScopeContractPair, ScopeFederationPolicy:
		return true
	default:
		return false
	}
}

// BlastRadius is the FROZEN KRD §49.1 blast_radius enum — how far a violation propagates.
// Closed set of three, ordered ascending (small < bounded < global); never extended here.
type BlastRadius string

const (
	// BlastRadiusSmall — the violation stays local.
	BlastRadiusSmall BlastRadius = "small"
	// BlastRadiusBounded — the violation crosses to the contract partner(s).
	BlastRadiusBounded BlastRadius = "bounded"
	// BlastRadiusGlobal — the violation fans out across the federation (the strongest tier).
	BlastRadiusGlobal BlastRadius = "global"
)

// BlastRadii returns the three frozen §49.1 blast radii in ascending order.
func BlastRadii() []BlastRadius {
	return []BlastRadius{BlastRadiusSmall, BlastRadiusBounded, BlastRadiusGlobal}
}

// IsKnownBlastRadius reports whether b is one of the three frozen §49.1 radii.
func IsKnownBlastRadius(b BlastRadius) bool {
	switch b {
	case BlastRadiusSmall, BlastRadiusBounded, BlastRadiusGlobal:
		return true
	default:
		return false
	}
}

// blastOrder maps a blast_radius to its rank (small=0 < bounded=1 < global=2). A wider
// radius demands a wider authority — the comparison Admit performs (monotone in radius).
func blastOrder(b BlastRadius) int {
	switch b {
	case BlastRadiusSmall:
		return 0
	case BlastRadiusBounded:
		return 1
	case BlastRadiusGlobal:
		return 2
	default:
		return -1
	}
}

// Authority is the FROZEN KRD §49.1 approval_required enum — the authority tier admission
// demands. Closed set of three, ordered ascending (cell_owner < both_contract_owners <
// architecture_owner). It is the SAME tier ladder S16 resolves; here it names the three
// federation tiers verbatim (never a fourth).
type Authority string

const (
	// AuthorityCellOwner — the owner of a single cell (the narrowest tier).
	AuthorityCellOwner Authority = "cell_owner"
	// AuthorityBothContractOwners — both owners either side of a contract.
	AuthorityBothContractOwners Authority = "both_contract_owners"
	// AuthorityArchitectureOwner — the architecture owner (the widest tier, required for global).
	AuthorityArchitectureOwner Authority = "architecture_owner"
)

// Authorities returns the three frozen §49.1 authority tiers in ascending order.
func Authorities() []Authority {
	return []Authority{AuthorityCellOwner, AuthorityBothContractOwners, AuthorityArchitectureOwner}
}

// IsKnownAuthority reports whether a is one of the three frozen §49.1 tiers.
func IsKnownAuthority(a Authority) bool {
	switch a {
	case AuthorityCellOwner, AuthorityBothContractOwners, AuthorityArchitectureOwner:
		return true
	default:
		return false
	}
}

// authorityOrder maps an authority tier to its rank (cell_owner=0 < both_contract_owners=1 <
// architecture_owner=2). The wider the rank, the wider the authority.
func authorityOrder(a Authority) int {
	switch a {
	case AuthorityCellOwner:
		return 0
	case AuthorityBothContractOwners:
		return 1
	case AuthorityArchitectureOwner:
		return 2
	default:
		return -1
	}
}

// minAuthorityForRadius is the PRECEDENCE rule (ADR: blast_radius → minimum approval tier),
// DECLARED above the line, never learned:
//   - global  ⇒ architecture_owner  (the §49.1 done case)
//   - bounded ⇒ both_contract_owners (a contract-pair crossing demands both owners)
//   - small   ⇒ cell_owner          (a local change needs only the cell owner)
//
// The mapping is total over the three frozen radii; an unknown radius is rejected at Validate
// before Admit ever runs.
func minAuthorityForRadius(b BlastRadius) Authority {
	switch b {
	case BlastRadiusGlobal:
		return AuthorityArchitectureOwner
	case BlastRadiusBounded:
		return AuthorityBothContractOwners
	default: // small
		return AuthorityCellOwner
	}
}

// CellRef is a reference to a cell (bounded context) the invariant spans — a non-empty
// identifier (e.g. "checkout"). The invariant invents no cell registry; it only refuses the
// empty one and dedups by identity.
type CellRef string

// GlobalInvariant is the KRD §49.1 cross-cell invariant AST. It is a value object,
// content-addressed inside its truth body (the S02 substrate), not a record of its own. JSON
// keys match the §49.1 fields verbatim.
type GlobalInvariant struct {
	// Name is the invariant's stable name (e.g. "pii-forgettable-federation"). Non-empty.
	Name string `json:"name"`
	// Scope is HOW MANY cells the invariant crosses (one of the three §49.1 scopes).
	Scope Scope `json:"scope"`
	// Cells are the bounded contexts the invariant spans. ≥2 distinct when scope != local_cell.
	Cells []CellRef `json:"cells"`
	// Predicate is the cross-cell predicate identifier the invariant asserts. Non-empty.
	Predicate string `json:"predicate"`
	// BlastRadius is HOW FAR a violation propagates (one of the three §49.1 radii).
	BlastRadius BlastRadius `json:"blast_radius"`
	// ApprovalRequired is the authority tier admission demands (one of the three §49.1 tiers).
	ApprovalRequired Authority `json:"approval_required"`
}

// Validation errors.
var (
	// ErrEmptyName — the invariant has no name.
	ErrEmptyName = errors.New("globalinvariant: invariant has no name")
	// ErrEmptyPredicate — the invariant asserts no predicate.
	ErrEmptyPredicate = errors.New("globalinvariant: invariant has no predicate")
	// ErrUnknownScope — scope is out of the frozen §49.1 enum.
	ErrUnknownScope = errors.New("globalinvariant: unknown scope (not a KRD §49.1 scope)")
	// ErrUnknownBlastRadius — blast_radius is out of the frozen §49.1 enum.
	ErrUnknownBlastRadius = errors.New("globalinvariant: unknown blast_radius (not a KRD §49.1 radius)")
	// ErrUnknownAuthority — approval_required is out of the frozen §49.1 enum.
	ErrUnknownAuthority = errors.New("globalinvariant: unknown approval_required (not a KRD §49.1 tier)")
	// ErrMalformedCell — a cell ref is empty.
	ErrMalformedCell = errors.New("globalinvariant: malformed (empty) cell ref")
	// ErrNotCrossCell — a contract_pair/federation_policy invariant names < 2 distinct cells.
	ErrNotCrossCell = errors.New("globalinvariant: a contract_pair/federation_policy invariant must span ≥2 distinct cells (it is not actually cross-cell)")
	// ErrApprovalTooNarrowForRadius — approval_required is narrower than blast_radius demands.
	ErrApprovalTooNarrowForRadius = errors.New("globalinvariant: approval_required is narrower than blast_radius demands (global ⇒ architecture_owner)")
)

// Validate is the PURE shape guard of a GlobalInvariant (KRD §49.1):
//   - name and predicate non-empty;
//   - scope / blast_radius / approval_required each in the frozen §49.1 enum;
//   - every cell ref is a non-empty identifier;
//   - a contract_pair / federation_policy invariant spans ≥2 DISTINCT cells (a single-cell
//     name on a cross-cell scope is NOT actually cross-cell — rejected);
//   - approval_required is CONSISTENT with blast_radius (≥ the minimum tier the radius
//     demands — global ⇒ architecture_owner, bounded ⇒ ≥ both_contract_owners).
//
// Pure: no DB, no clock, no I/O.
func Validate(gi GlobalInvariant) error {
	if gi.Name == "" {
		return ErrEmptyName
	}
	if gi.Predicate == "" {
		return ErrEmptyPredicate
	}
	if !IsKnownScope(gi.Scope) {
		return fmt.Errorf("%w: %q", ErrUnknownScope, gi.Scope)
	}
	if !IsKnownBlastRadius(gi.BlastRadius) {
		return fmt.Errorf("%w: %q", ErrUnknownBlastRadius, gi.BlastRadius)
	}
	if !IsKnownAuthority(gi.ApprovalRequired) {
		return fmt.Errorf("%w: %q", ErrUnknownAuthority, gi.ApprovalRequired)
	}
	distinct := map[CellRef]bool{}
	for _, c := range gi.Cells {
		if c == "" {
			return ErrMalformedCell
		}
		distinct[c] = true
	}
	if gi.Scope != ScopeLocalCell && len(distinct) < 2 {
		return fmt.Errorf("%w: scope %q names %d distinct cell(s)", ErrNotCrossCell, gi.Scope, len(distinct))
	}
	if authorityOrder(gi.ApprovalRequired) < authorityOrder(minAuthorityForRadius(gi.BlastRadius)) {
		return fmt.Errorf("%w: blast_radius %q demands ≥ %q, got %q",
			ErrApprovalTooNarrowForRadius, gi.BlastRadius, minAuthorityForRadius(gi.BlastRadius), gi.ApprovalRequired)
	}
	return nil
}

// RedWave is the PURE cross-cell fan-out of KRD §49: given an invariant and the cell that
// violated it, it returns the set of cells the violation REDDENS, in canonical (sorted)
// order so the wave is replayable.
//
//   - local_cell                       → exactly the violated cell (the one cell it lives in);
//   - contract_pair / federation_policy → EVERY cell the invariant spans (the §49 fan-out —
//     a cross-cell violation never reddens fewer cells than the invariant's reach).
//
// The fan-out REUSES the S19 weighted-propagation engine (propagation.FireParent): each
// spanned partner cell is modelled as a composite whose emergent invariant re-opens when the
// violated cell (a load-bearing child, activation 1) changes against a threshold of 1 — so a
// cross-cell violation fires every partner cell RED (the §49 wave). A GlobalInvariant, by
// being declared cross-cell, binds its cells load-bearingly; a cosmetic link would not cross
// (propagation's "épingle un défaut, pas un changement"). The violated cell is always red.
//
// PURE, TOTAL (always returns a set — never panics, never nil for a well-formed invariant),
// DETERMINISTIC (same (gi, violatedCell) ⇒ same set). It reads only the declared cells.
func RedWave(gi GlobalInvariant, violatedCell CellRef) []CellRef {
	if gi.Scope == ScopeLocalCell {
		// A local_cell invariant reddens exactly its one cell. Prefer the invariant's own
		// declared cell when it has one; else the violated cell.
		if len(gi.Cells) > 0 {
			return []CellRef{gi.Cells[0]}
		}
		return dedupSorted([]CellRef{violatedCell})
	}
	// contract_pair / federation_policy: fan out via the S19 weighted engine. The violated
	// cell is the load-bearing child; each OTHER spanned cell is a parent that fires RED.
	g := propagation.Graph{
		Parents: map[string]propagation.Parent{},
		Changed: []string{string(violatedCell)},
	}
	spanned := dedupSorted(append(append([]CellRef{}, gi.Cells...), violatedCell))
	for _, cell := range spanned {
		if cell == violatedCell {
			continue
		}
		g.Parents[string(cell)] = propagation.Parent{LayerID: string(cell), ActivationThreshold: 1}
		g.Edges = append(g.Edges, propagation.Link{
			Parent: propagation.Ref{ID: string(cell)},
			Child:  propagation.Ref{ID: string(violatedCell)},
			Weight: propagation.WeightLoadBearing, // a declared cross-cell invariant binds load-bearingly
		})
	}
	reach := []CellRef{}
	if violatedCell != "" {
		reach = append(reach, violatedCell) // the violator is always red
	}
	for _, cell := range spanned {
		if cell == violatedCell {
			continue
		}
		if propagation.FireParent(g, string(cell)) == propagation.VerdictRed {
			reach = append(reach, cell)
		}
	}
	return dedupSorted(reach)
}

// dedupSorted returns the distinct non-empty cell refs of xs in canonical sorted order, so
// RedWave is deterministic regardless of input ordering or duplicates.
func dedupSorted(xs []CellRef) []CellRef {
	seen := map[CellRef]bool{}
	out := make([]CellRef, 0, len(xs))
	for _, c := range xs {
		if c == "" || seen[c] {
			continue
		}
		seen[c] = true
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// Decision is the admission verdict — exactly one of three (KRD §49.1, mirroring S16). Admit
// is total: it always returns one of these.
type Decision string

const (
	// DecisionAdmitted — the granted approval is wide enough for the blast_radius.
	DecisionAdmitted Decision = "admitted"
	// DecisionBlocked — the granted approval is narrower than the blast_radius demands.
	DecisionBlocked Decision = "blocked"
	// DecisionEscalated — the granted approval is one tier below the demand (routed up).
	DecisionEscalated Decision = "escalated"
)

// CodeInsufficientApprovalForBlastRadius is the S48-local refusal code carried by a blocked
// AdmissionDecision when the granted approval is narrower than the blast_radius demands
// (KRD §49.1 + §44.5). It names the cross-cell admission-block case verbatim and is surfaced
// by the mirror + the /global-invariants panel.
const CodeInsufficientApprovalForBlastRadius = "INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS"

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation,
// how_to_fix[]) carried by a blocked AdmissionDecision. A wall without a fix path is a
// prison; every block names the door (how_to_fix non-empty). Same shape as the kernel's
// other BlockReasons (authority, propagation).
type BlockReason struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// AdmissionDecision is Admit's verdict: the Decision, a BlockReason when blocked (nil
// otherwise), and the escalation roles when escalated (nil otherwise).
type AdmissionDecision struct {
	Decision    Decision     `json:"decision"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
	EscalatedTo []string     `json:"escalated_to,omitempty"`
}

// Admit is the PURE cross-cell admission gate of KRD §49.1: a wider blast_radius demands a
// wider approval tier. It compares the granted approval against the minimum tier the
// invariant's blast_radius demands (minAuthorityForRadius), reusing S16 authority.Decide for
// the tier resolution — this package does NOT fork the approver/veto/escalation logic.
//
//   - granted ≥ required             ⇒ admitted;
//   - granted exactly one tier below ⇒ escalated (routed to the architecture owner);
//   - granted ≥2 tiers below         ⇒ blocked / INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS.
//
// The done case: a global invariant (required = architecture_owner) approved only by a
// cell_owner (2 tiers below) ⇒ blocked, how_to_fix [escalate_to_architecture_owner]; approved
// by the architecture_owner ⇒ admitted.
//
// Admit is TOTAL (always one of admitted | blocked | escalated), DETERMINISTIC, and MONOTONE
// IN RADIUS (a wider blast_radius is admitted only with an equal-or-wider approval; global is
// never admitted without architecture_owner). It treats an out-of-enum grantedApproval as the
// narrowest (blocked) — Validate rejects out-of-enum on the invariant itself. PURE: no DB, no
// clock, no rng, no I/O. The rapid property mirror pins totality / determinism / monotonicity.
func Admit(gi GlobalInvariant, grantedApproval Authority) AdmissionDecision {
	required := minAuthorityForRadius(gi.BlastRadius)
	grantedRank := authorityOrder(grantedApproval)
	requiredRank := authorityOrder(required)

	// Resolve via S16 Decide: the required tier is the sole approver; the granted tier
	// "approves" iff it is the same-or-wider tier. This reuses the canonical admission
	// precedence (all approvers present ⇒ admitted; none ⇒ blocked) without forking it.
	resolveAdmits := admitsByDecide(required, grantedApproval)

	switch {
	case grantedRank >= requiredRank && resolveAdmits:
		return AdmissionDecision{Decision: DecisionAdmitted}
	case grantedRank == requiredRank-1:
		// Exactly one tier below the demand ⇒ escalate to the architecture owner.
		return AdmissionDecision{
			Decision:    DecisionEscalated,
			EscalatedTo: []string{string(AuthorityArchitectureOwner)},
		}
	default:
		// ≥2 tiers below (or out-of-enum) ⇒ blocked, actionable.
		return AdmissionDecision{
			Decision:    DecisionBlocked,
			BlockReason: insufficientApprovalReason(gi.BlastRadius, required, grantedApproval),
		}
	}
}

// admitsByDecide reuses S16 authority.Decide to resolve whether the granted tier admits at the
// required tier: it builds a one-approver AuthorityGraph keyed on the required tier and grants
// the role iff the granted tier is the same-or-wider. The verdict is canonical (admitted iff
// the required tier is granted) — the cross-cell precedence is the SAME admission discipline
// as S16, not a fork.
func admitsByDecide(required, granted Authority) bool {
	g := authority.AuthorityGraph{
		Domain:    "federation",
		TruthKind: "regulatory",
		Approvers: []authority.Role{authority.Role(required)},
	}
	var grantedRoles []authority.Role
	if authorityOrder(granted) >= authorityOrder(required) {
		grantedRoles = []authority.Role{authority.Role(required)}
	}
	d := authority.Decide(g, authority.Truth{Domain: "federation", TruthKind: "regulatory"}, grantedRoles)
	return d.Decision == authority.DecisionAdmitted
}

// insufficientApprovalReason is the actionable BlockReason for a cross-cell admission refused
// because the granted approval is too narrow for the blast_radius (KRD §49.1 + §44.5).
// how_to_fix names the door: escalate to the architecture owner (the global done case) or to
// the tier the radius demands.
func insufficientApprovalReason(b BlastRadius, required, granted Authority) *BlockReason {
	fix := []string{}
	if required == AuthorityArchitectureOwner {
		fix = append(fix, "escalate_to_architecture_owner")
	} else {
		fix = append(fix, fmt.Sprintf("escalate_to:%s", string(required)))
	}
	fix = append(fix, "narrow_the_blast_radius")
	return &BlockReason{
		Code:     CodeInsufficientApprovalForBlastRadius,
		Severity: "blocking",
		Explanation: fmt.Sprintf("Un blast_radius %q exige l'autorité %q ; l'approbation accordée (%q) est "+
			"trop étroite. Un invariant transverse est une exception coûteuse (KRD §49.1) : un rayon plus large "+
			"exige une autorité plus large. L'admission est bloquée.", b, required, granted),
		HowToFix: fix,
	}
}

// SerializeBody renders a minimal kernel.truth body carrying the invariant, so it rides INSIDE
// the content-addressed body (the S02 substrate): a body produced here round-trips through
// records.NewRecord as id == version == Hash(Canonicalize(body)), and changing scope / cells /
// blast_radius / approval_required yields a different version (a new row, never an in-place
// mutation — KRD §44.1 rescope / reweight / reauthorize). The "kind":"truth" discriminator
// matches records.Validate.
func SerializeBody(gi GlobalInvariant) ([]byte, error) {
	body := map[string]any{
		"kind":             string(records.KindTruth),
		"global_invariant": gi,
	}
	return json.Marshal(body)
}
