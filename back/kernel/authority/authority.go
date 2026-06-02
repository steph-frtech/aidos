// Package authority is the pure AST + admission decision of KRD §13.8 "AuthorityGraph —
// remplacer « l'humain » par une autorité explicite".
//
// An AuthorityGraph is ONE of the four truth QUALIFIERS (KRD §13.6: truth_kind /
// TruthScope / VerifiabilityLevel / AuthorityGraph) — it qualifies a Kernel truth, it is
// NOT a truth itself. It binds a {domain, truth_kind} to named authorities and answers
// WHO approves / vetoes / escalates a truth's admission. KRD §13.8's rule:
//
//	"Toute vérité above-the-line doit avoir un propriétaire d'autorité explicite."
//	→ « l'humain » abstrait est remplacé par produit / juridique / sécurité / design / …
//
// This package lands the typed graph shape (verbatim §13.8: domain, truth_kind,
// approvers, veto, escalation), a pure Validate(graph) guard, and a pure
// Decide(graph, truth, granted) → AdmissionDecision that returns admitted | blocked |
// escalated plus a BlockReason (KRD §44.5) when blocked. The precedence (veto dominates;
// no approver ⇒ blocked/MISSING_AUTHORITY_APPROVAL; all approvers ⇒ admitted; partial ⇒
// escalated) is ADR 0016, pinned by the admission fixture.
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. The granted
// approvals are READ from the set handed in, never fetched. READ-ONLY against truth; it
// writes nothing (the wall, CLAUDE.md §2). The admission RULE is ABOVE the waterline (the
// human's, KRD §13.8); this step only ENFORCES it. The graph is INTERPRETED in Go (the
// frozen slot) — NOT yet wired into the /goal admission gate (a later projection).
package authority

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// Role is a named authority — a well-formed identifier (KRD §13.8: legal, product_owner,
// security, architecture_board, …). The set is OPEN (an org names its own roles); only
// the shape is constrained (a non-empty identifier), never an invented closed enum.
type Role string

// IsWellFormed reports whether a role is a non-empty identifier (no whitespace-only, no
// empty string). The graph invents no role registry; it only refuses the empty/blank one.
func (r Role) IsWellFormed() bool {
	if r == "" {
		return false
	}
	for _, c := range string(r) {
		if c != ' ' && c != '\t' && c != '\n' && c != '\r' {
			return true
		}
	}
	return false
}

// TruthKind is the epistemic kind a graph keys on — exactly the seven KRD §13.4 members.
// It is the SAME enum as truthtyping.TruthKind (no second source of truth); the alias here
// keeps the authority API self-contained while delegating membership to truthtyping.
type TruthKind string

// IsKnownTruthKind reports whether k is one of the seven KRD §13.4 epistemic kinds. It
// delegates to truthtyping (the single owner of the enum) — the authority package invents
// no kind.
func IsKnownTruthKind(k TruthKind) bool {
	return truthtyping.IsKnownKind(truthtyping.TruthKind(k))
}

// AuthorityGraph is the KRD §13.8 graph: a {domain, truth_kind} bound to three role lists.
// It is a value object (content-addressed inside the truth body, S02 substrate), not a
// record of its own. JSON keys match the §13.8 YAML verbatim.
type AuthorityGraph struct {
	// Domain is the area the graph governs (e.g. "checkout"). Non-empty (Validate).
	Domain string `json:"domain"`
	// TruthKind is the epistemic kind the graph keys on (one of the §13.4 seven).
	TruthKind TruthKind `json:"truth_kind"`
	// Approvers are the roles that must ALL grant approval for admission. Non-empty.
	Approvers []Role `json:"approvers"`
	// Veto are the roles that block admission if present, regardless of approvers.
	Veto []Role `json:"veto,omitempty"`
	// Escalation are the roles the decision is routed to on partial/contested approval.
	Escalation []Role `json:"escalation,omitempty"`
}

// Truth is the minimal projection of a kernel Truth this decider keys on — its domain and
// epistemic kind. It is NOT the full records.Record; Decide is pure and only needs these
// two to match a truth to its governing graph.
type Truth struct {
	Domain    string    `json:"domain"`
	TruthKind TruthKind `json:"truth_kind"`
}

// Decision is the admission verdict — exactly one of three (KRD §13.8). Decide is total:
// it always returns one of these.
type Decision string

const (
	// DecisionAdmitted — every required approver granted, no veto: the truth is admitted.
	DecisionAdmitted Decision = "admitted"
	// DecisionBlocked — a veto is present, or no approver at all granted: blocked.
	DecisionBlocked Decision = "blocked"
	// DecisionEscalated — partial approval (≥1 but not all approvers), no veto: escalated.
	DecisionEscalated Decision = "escalated"
)

// decisionOrder is the canonical enumeration order of the three decisions.
var decisionOrder = []Decision{DecisionAdmitted, DecisionBlocked, DecisionEscalated}

// Decisions returns the three KRD §13.8 admission decisions in canonical order.
func Decisions() []Decision {
	out := make([]Decision, len(decisionOrder))
	copy(out, decisionOrder)
	return out
}

// BlockCode is the S16-local refusal code carried by a blocked AdmissionDecision. It is NOT
// a member of the closed runtime/blockreason.Code enum (CLAUDE.md §9 forbids inventing
// members there); these codes name the two §13.8 admission-block cases and are surfaced
// verbatim by the mirror + the /authorities panel. The canonical CodeMissingAuthority
// ("MISSING_AUTHORITY") already covers the wall/completeness sites; admission uses the more
// specific MISSING_AUTHORITY_APPROVAL.
type BlockCode string

const (
	// CodeMissingAuthorityApproval — a truth lacks a required approval (no approver granted).
	// The done case for a regulatory truth without legal approval (KRD §44.5 actionable).
	CodeMissingAuthorityApproval BlockCode = "MISSING_AUTHORITY_APPROVAL"
	// CodeVetoed — a veto role is present in the granted set; admission is blocked
	// regardless of approvers (ADR 0016: veto dominates).
	CodeVetoed BlockCode = "VETOED"
)

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation,
// how_to_fix[]) carried by a blocked AdmissionDecision. A wall without a fix path is a
// prison; every block names the door (how_to_fix non-empty).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// AdmissionDecision is Decide's verdict: the Decision, a BlockReason when blocked (nil
// otherwise), and the escalation roles when escalated (nil otherwise).
type AdmissionDecision struct {
	Decision    Decision     `json:"decision"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
	EscalatedTo []Role       `json:"escalated_to,omitempty"`
}

// Validation errors.
var (
	// ErrEmptyDomain — the graph has no domain.
	ErrEmptyDomain = errors.New("authority: graph has no domain")
	// ErrUnknownTruthKind — the graph's truth_kind is out of the §13.4 enum.
	ErrUnknownTruthKind = errors.New("authority: unknown truth_kind (not a KRD §13.4 epistemic kind)")
	// ErrNoApprovers — the graph has no approver: it could never admit (a monster).
	ErrNoApprovers = errors.New("authority: graph has no approvers (could never admit)")
	// ErrMalformedRole — a role identifier is empty/blank.
	ErrMalformedRole = errors.New("authority: malformed role identifier")
	// ErrApproverVetoOverlap — a role appears in both approvers and veto (self-contradicting).
	ErrApproverVetoOverlap = errors.New("authority: a role appears in both approvers and veto")
)

// Validate is the PURE shape guard of a graph (KRD §13.8 + ADR 0016):
//   - domain non-empty;
//   - truth_kind is one of the seven §13.4 epistemic kinds;
//   - approvers non-empty (a graph with no approver could never admit — a monster);
//   - every role (in any list) is a well-formed identifier;
//   - no role appears in both approvers and veto (a self-contradicting graph).
//
// It does NOT require veto/escalation to be non-empty. Pure: no DB, no clock, no I/O.
func Validate(g AuthorityGraph) error {
	if g.Domain == "" {
		return ErrEmptyDomain
	}
	if !IsKnownTruthKind(g.TruthKind) {
		return fmt.Errorf("%w: %q", ErrUnknownTruthKind, g.TruthKind)
	}
	if len(g.Approvers) == 0 {
		return ErrNoApprovers
	}
	for _, lst := range [][]Role{g.Approvers, g.Veto, g.Escalation} {
		for _, r := range lst {
			if !r.IsWellFormed() {
				return fmt.Errorf("%w: %q", ErrMalformedRole, r)
			}
		}
	}
	for _, a := range g.Approvers {
		if containsRole(g.Veto, a) {
			return fmt.Errorf("%w: %q", ErrApproverVetoOverlap, a)
		}
	}
	return nil
}

// Decide is the PURE admission verdict of KRD §13.8 over a truth keyed by {domain,
// truth_kind}, given the set of roles that have granted their approval/veto. The precedence
// (ADR 0016, first match wins):
//
//  1. VETO DOMINATES. Any veto role present in granted ⇒ blocked / VETOED.
//  2. NO APPROVER granted ⇒ blocked / MISSING_AUTHORITY_APPROVAL (the done case).
//  3. ALL required approvers present ⇒ admitted.
//  4. PARTIAL approval (≥1 but not all approvers), no veto ⇒ escalated (to graph.escalation).
//
// Decide is TOTAL (always one of the three decisions) and DETERMINISTIC (same input ⇒ same
// verdict). Pure: no DB, no clock, no rng, no I/O. The rapid property mirror pins this.
func Decide(g AuthorityGraph, truth Truth, granted []Role) AdmissionDecision {
	// 1. Veto dominates — any granted veto role blocks regardless of approvers.
	for _, v := range g.Veto {
		if containsRole(granted, v) {
			return AdmissionDecision{
				Decision:    DecisionBlocked,
				BlockReason: vetoedReason(v),
			}
		}
	}

	// Count how many required approvers are granted.
	grantedApprovers := 0
	for _, a := range g.Approvers {
		if containsRole(granted, a) {
			grantedApprovers++
		}
	}

	// 2. No approver at all granted ⇒ blocked / MISSING_AUTHORITY_APPROVAL (done case).
	if grantedApprovers == 0 {
		return AdmissionDecision{
			Decision:    DecisionBlocked,
			BlockReason: missingApprovalReason(),
		}
	}

	// 3. All required approvers present, no veto ⇒ admitted.
	if grantedApprovers == len(g.Approvers) {
		return AdmissionDecision{Decision: DecisionAdmitted}
	}

	// 4. Partial approval (≥1 but not all), no veto ⇒ escalated to the escalation roles.
	return AdmissionDecision{
		Decision:    DecisionEscalated,
		EscalatedTo: append([]Role{}, g.Escalation...),
	}
}

// missingApprovalReason is the actionable BlockReason for a truth lacking its required
// approval (KRD §44.5). how_to_fix names the door: assign the authority, then obtain the
// legal approval — the regulatory done case.
func missingApprovalReason() *BlockReason {
	return &BlockReason{
		Code:     CodeMissingAuthorityApproval,
		Severity: "blocking",
		Explanation: "La vérité n'a obtenu aucune approbation requise : nul ne peut l'admettre sans " +
			"le détenteur d'autorité du sous-graphe (AuthorityGraph, KRD §13.8). Une vérité réglementaire " +
			"sans approbation juridique est bloquée.",
		HowToFix: []string{
			"assign_authority",
			"obtain_legal_approval",
		},
	}
}

// vetoedReason is the actionable BlockReason for a vetoed admission (ADR 0016: veto
// dominates). how_to_fix names the door: resolve the veto with the vetoing role, or escalate.
func vetoedReason(by Role) *BlockReason {
	return &BlockReason{
		Code:     CodeVetoed,
		Severity: "blocking",
		Explanation: fmt.Sprintf("L'admission est opposée par un veto (%q) : un veto bloque quel que soit le "+
			"nombre d'approbateurs (KRD §13.8 — veto domine). Le veto n'est jamais contourné.", string(by)),
		HowToFix: []string{
			"resolve_veto",
			fmt.Sprintf("obtain_clearance_from:%s", string(by)),
			"escalate",
		},
	}
}

// SerializeGraphBody renders a minimal kernel.truth body carrying the graph, so the graph
// rides INSIDE the content-addressed body (S02 substrate): a body produced here round-trips
// through records.NewRecord as id == version == Hash(Canonicalize(body)), and changing a
// role list yields a different version (a new row, never an in-place mutation — KRD §44.1
// reauthorize). The "kind":"truth" discriminator matches records.Validate.
func SerializeGraphBody(g AuthorityGraph) ([]byte, error) {
	body := map[string]any{
		"kind":            string(records.KindTruth),
		"authority_graph": g,
	}
	return json.Marshal(body)
}

func containsRole(xs []Role, x Role) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
