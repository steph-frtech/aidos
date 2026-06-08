// Package authoritybinding is the S63 KERNEL/AUTH binding — "remplacer « l'humain »
// abstrait par une autorité explicite, portée par un USER RÉEL" (KRD §13.8 + ROADMAP
// app-builder S63). It is the load-bearing join between three already-built pieces:
//
//   - S16 AuthorityGraph (back/kernel/authority): the pure {domain, truth_kind} →
//     {approvers, veto, escalation} graph that answers WHO admits a truth, and the pure
//     Decide(graph, truth, granted) → admitted | blocked | escalated.
//   - S62 Membership (back/runtime/membership): the deterministic (identity × project ×
//     role owner/editor/viewer) join — who is a REAL member of a project, and at which role.
//   - S27 Ideas / S20 ChangeSet provenance: every candidate-truth and every truth-write
//     envelope records WHO wanted it (provenance), never a placeholder.
//
// THE S63 QUESTION. S16's Decide reads a flat set of "granted" authority roles handed in
// from nowhere — a placeholder. S63 grounds that set in a REAL user: a project member,
// via an explicit, DECLARED AuthorityRoleBinding (member-role × scope-domain → the
// authority roles that member holds), grants exactly the authority roles its binding
// awards. A truth-write proposal then requires APPROVAL FROM A USER HOLDING THE SCOPE'S
// AUTHORITY — and if the acting user holds none of the scope's required authority, the
// proposal is refused INSUFFICIENT_AUTHORITY (the fixture done-criterion).
//
// PROVENANCE IS A REAL ACTOR, NEVER A PLACEHOLDER (ROADMAP S63, KRD §117/§119). Every
// Idea/ChangeSet proposed through this gate records the acting human (identity +
// display) as provenance. RequireRealActor REFUSES the empty / blank / placeholder actor
// ("", "system", "agent", "tbd", "placeholder", "anonymous", "unknown") with
// PLACEHOLDER_ACTOR — a truth-write can never be attributed to nobody.
//
// AN OVERRIDE IS A RECORDED DECISION, NEVER A SILENT BYPASS (CLAUDE.md §8). When a human
// with sufficient standing overrides a block, NewOverride forges a recorded decision that
// REQUIRES a ChangeSet ref + an ADR ref + a real-actor provenance; an override missing any
// of the three is refused OVERRIDE_NOT_RECORDED. The override never edits truth in place —
// it is an append-only recorded decision (the §8 invariant: "an override is not an edit,
// it is a recorded decision").
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8 — "the judge is deterministic"). Every function here
// is PURE and TOTAL: no DB, no clock, no rng, no I/O, no LLM. ResolveGrantedRoles,
// DecideProposal, RequireRealActor, NewOverride are deterministic functions of their
// arguments — same input ⇒ same verdict (the reproducibility property mirror pins it).
// The binding table is DECLARED, never learned (CLAUDE.md §8). READ-ONLY against truth; it
// writes NOTHING (the wall, CLAUDE.md §2) — the downstream kernel write stays the aidos
// CLI role via /goal. The graph + binding live ABOVE the waterline (the human's); this
// step only ENFORCES the binding.
package authoritybinding

import (
	"encoding/json"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// RealActor is the acting human a truth-write is attributed to (ROADMAP S63: "jamais un
// placeholder"). Identity is the resolved caller identity (accounts.users.id, S61 — the
// same value membership.Membership.Identity keys on); Display is the human-readable name
// surfaced in provenance and the Workbench. A truth-write can never be attributed to
// nobody, so RequireRealActor refuses the empty/blank/placeholder actor.
type RealActor struct {
	// Identity is the resolved caller identity (accounts.users.id, S61). Non-empty + not a
	// placeholder (RequireRealActor).
	Identity string `json:"identity"`
	// Display is the human-readable actor name surfaced in provenance/UI. Non-empty.
	Display string `json:"display"`
}

// placeholderIdentities is the CLOSED set of non-actors a truth-write may NEVER be
// attributed to (ROADMAP S63). It is a DECLARED denylist, matched case-insensitively after
// trimming. "system"/"agent" are explicit: the agent owns implementation, never truth (the
// wall) — a truth-write attributed to "agent" is exactly the placeholder S63 forbids.
var placeholderIdentities = map[string]struct{}{
	"":            {},
	"system":      {},
	"agent":       {},
	"aidos":       {},
	"aidos_agent": {},
	"tbd":         {},
	"todo":        {},
	"placeholder": {},
	"anonymous":   {},
	"anon":        {},
	"unknown":     {},
	"none":        {},
	"null":        {},
	"nobody":      {},
}

// IsPlaceholder reports whether an identity is the empty/blank string or a member of the
// declared placeholder denylist (case-insensitive, trimmed). PURE.
func IsPlaceholder(identity string) bool {
	key := strings.ToLower(strings.TrimSpace(identity))
	_, bad := placeholderIdentities[key]
	return bad
}

// BlockCode is the stable, machine-readable refusal code carried by this step's blocks
// (the §44.5 shape). These are S63-LOCAL codes (CLAUDE.md §9 forbids inventing members in
// the closed runtime/blockreason.Code enum); they name the three S63 refusal cases and are
// surfaced verbatim by the mirror + the /authority-binding panel.
type BlockCode string

const (
	// CodeInsufficientAuthority — a truth-write proposal whose acting user holds NONE of the
	// authority roles the scope's AuthorityGraph requires (no approver granted). THE fixture
	// done-criterion. Distinct from membership's NOT_A_MEMBER/ROLE_FORBIDDEN: the user IS a
	// member with a project role, but their role grants no SCOPE AUTHORITY here.
	CodeInsufficientAuthority BlockCode = "INSUFFICIENT_AUTHORITY"
	// CodePlaceholderActor — a truth-write attributed to no real human (empty/blank or a
	// declared placeholder). Provenance must name a real actor (ROADMAP S63).
	CodePlaceholderActor BlockCode = "PLACEHOLDER_ACTOR"
	// CodeOverrideNotRecorded — an override missing its ChangeSet ref, ADR ref, or real-actor
	// provenance. An override is a RECORDED decision, never a silent bypass (CLAUDE.md §8).
	CodeOverrideNotRecorded BlockCode = "OVERRIDE_NOT_RECORDED"
)

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation,
// how_to_fix[]). A wall without a fix path is a prison; every block names the door
// (how_to_fix non-empty). Same shape as the kernel's other BlockReasons.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

func (b *BlockReason) Error() string { return string(b.Code) + ": " + b.Explanation }

// AuthorityRoleBinding is the DECLARED mapping (CLAUDE.md §8: declared, never learned) that
// grounds S16's abstract authority roles in a REAL user. It awards the authority roles a
// project member HOLDS for a given scope-domain when its membership carries (at least)
// MinProjectRole. It is a value object — content-addressed inside the binding-set body, not
// a record of its own.
//
//	"a member of project P, holding ≥ MinProjectRole, in domain Domain, holds these
//	 authority Roles."
//
// Example: {Domain: "checkout", MinProjectRole: owner, Roles: [product_owner, security]}
// means an OWNER member of the project holds the product_owner + security authority roles
// for the checkout domain — so an OWNER actor can satisfy a checkout AuthorityGraph that
// requires those approvers, while an editor/viewer (below the floor) holds neither.
type AuthorityRoleBinding struct {
	// Domain is the AuthorityGraph domain this binding awards roles in (matches
	// authority.AuthorityGraph.Domain). Empty Domain is the WILDCARD domain — it awards its
	// roles in every domain (a project-wide authority).
	Domain string `json:"domain,omitempty"`
	// MinProjectRole is the membership role FLOOR a member must hold to be awarded Roles. A
	// member whose role is below the floor (owner ⊃ editor ⊃ viewer) is awarded nothing.
	MinProjectRole membership.Role `json:"min_project_role"`
	// Roles are the authority roles awarded to a qualifying member. Non-empty for a useful
	// binding.
	Roles []authority.Role `json:"roles"`
}

// roleRank is the membership gradient as a total order (owner ⊃ editor ⊃ viewer). A member
// MEETS a floor iff its rank ≥ the floor's rank. An invalid role ranks -1 (meets no floor).
func roleRank(r membership.Role) int {
	switch r {
	case membership.RoleOwner:
		return 3
	case membership.RoleEditor:
		return 2
	case membership.RoleViewer:
		return 1
	default:
		return -1
	}
}

// meetsFloor reports whether a holder role meets a required floor (holder ≥ floor in the
// gradient). PURE.
func meetsFloor(holder, floor membership.Role) bool {
	hr := roleRank(holder)
	return hr >= 0 && hr >= roleRank(floor)
}

// matchesDomain reports whether a binding applies to a domain: an exact domain match, or a
// wildcard binding (empty Domain applies to every domain). PURE.
func (b AuthorityRoleBinding) matchesDomain(domain string) bool {
	return b.Domain == "" || b.Domain == domain
}

// ResolveGrantedRoles is the S63 join: given a member's membership (nil ⇒ NON-MEMBER, who
// grants nothing), the AuthorityGraph's domain, and the declared binding set, it returns
// the SET of authority roles that member HOLDS for that domain — deduplicated and in
// canonical (sorted) order so the result is deterministic. A member grants the roles of
// EVERY binding it meets (its project role ≥ the binding floor, and the binding's domain
// matches). This is the "granted" set S16's Decide consumes — but grounded in a real user,
// no longer a placeholder. PURE and TOTAL.
func ResolveGrantedRoles(m *membership.Membership, domain string, bindings []AuthorityRoleBinding) []authority.Role {
	if m == nil || !m.Role.IsValid() {
		return nil
	}
	seen := map[authority.Role]struct{}{}
	for _, b := range bindings {
		if !b.matchesDomain(domain) {
			continue
		}
		if !meetsFloor(m.Role, b.MinProjectRole) {
			continue
		}
		for _, r := range b.Roles {
			if r.IsWellFormed() {
				seen[r] = struct{}{}
			}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]authority.Role, 0, len(seen))
	for r := range seen {
		out = append(out, r)
	}
	sortRoles(out)
	return out
}

// ProposalDecision is DecideProposal's verdict: the underlying S16 AdmissionDecision PLUS
// the actor whose authority was tested and the roles it was found to hold (the audit
// trail). On an INSUFFICIENT_AUTHORITY refusal the S63-local BlockReason replaces S16's
// generic MISSING_AUTHORITY_APPROVAL so the Workbench surfaces the grounded reason.
type ProposalDecision struct {
	// Admission is the S16 admission verdict (admitted | blocked | escalated) computed over
	// the REAL granted roles.
	Admission authority.AdmissionDecision `json:"admission"`
	// Actor is the real human whose authority was tested.
	Actor RealActor `json:"actor"`
	// GrantedRoles is the set of authority roles the actor was found to hold for the scope.
	GrantedRoles []authority.Role `json:"granted_roles"`
	// BlockReason is the S63-grounded refusal when the proposal is blocked for insufficient
	// authority or a placeholder actor (nil when admitted/escalated).
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// DecideProposal is the S63 GATE on a truth-write proposal. It first REQUIRES a real actor
// (a truth-write can never be attributed to a placeholder — PLACEHOLDER_ACTOR). Then it
// grounds S16's abstract "granted" set in the real user via ResolveGrantedRoles, and runs
// the pure S16 authority.Decide over those grounded roles. When the actor holds NONE of the
// scope's required authority, the verdict is blocked and the BlockReason is re-grounded to
// INSUFFICIENT_AUTHORITY (the fixture done-criterion). PURE and TOTAL — same input ⇒ same
// verdict.
func DecideProposal(g authority.AuthorityGraph, truth authority.Truth, actor RealActor, m *membership.Membership, bindings []AuthorityRoleBinding) ProposalDecision {
	// 1. A truth-write is never attributed to a placeholder (ROADMAP S63).
	if br := RequireRealActor(actor); br != nil {
		return ProposalDecision{
			Admission:    authority.AdmissionDecision{Decision: authority.DecisionBlocked},
			Actor:        actor,
			GrantedRoles: nil,
			BlockReason:  br,
		}
	}
	// 2. Ground the granted authority roles in the real member (no longer a placeholder set).
	granted := ResolveGrantedRoles(m, g.Domain, bindings)
	// 3. Run the pure S16 admission decision over the grounded roles.
	dec := authority.Decide(g, truth, granted)
	out := ProposalDecision{Admission: dec, Actor: actor, GrantedRoles: granted}
	// 4. Re-ground a "no approval at all" block as INSUFFICIENT_AUTHORITY (the S63 code).
	if dec.Decision == authority.DecisionBlocked &&
		dec.BlockReason != nil &&
		dec.BlockReason.Code == authority.CodeMissingAuthorityApproval {
		out.BlockReason = insufficientAuthorityReason(actor, g.Domain)
	} else if dec.BlockReason != nil {
		// A veto (or any other S16 block) is surfaced verbatim under the S63 shape.
		out.BlockReason = &BlockReason{
			Code:        BlockCode(dec.BlockReason.Code),
			Severity:    dec.BlockReason.Severity,
			Explanation: dec.BlockReason.Explanation,
			HowToFix:    dec.BlockReason.HowToFix,
		}
	}
	return out
}

// RequireRealActor refuses the empty/blank/placeholder actor (ROADMAP S63: provenance is
// never a placeholder). Returns nil for a real actor (non-placeholder identity + a
// non-blank display), or PLACEHOLDER_ACTOR otherwise. PURE.
func RequireRealActor(a RealActor) *BlockReason {
	if IsPlaceholder(a.Identity) || strings.TrimSpace(a.Display) == "" {
		return &BlockReason{
			Code:     CodePlaceholderActor,
			Severity: "error",
			Explanation: "L'écriture-vérité est attribuée à un placeholder (« " + a.Identity + " ») et non à un " +
				"humain réel : toute Idea/ChangeSet enregistre l'humain agissant comme provenance — jamais un " +
				"placeholder (ROADMAP S63, KRD §117/§119). L'agent possède l'implémentation, jamais la vérité (le mur).",
			HowToFix: []string{
				"Authentifiez-vous (S61) et agissez sous une identité réelle (accounts.users.id).",
				"La provenance doit nommer l'humain : identité résolue + nom affiché, jamais « system »/« agent »/« tbd ».",
			},
		}
	}
	return nil
}

// ToProvenanceDetail renders the verbatim provenance detail for a real actor: the human
// utterance/intent attributed to the named human (KRD §119: "who wanted what"). The form
// is "<display> <<identity>>: <intent>" so the frozen truth later reconstructs back to the
// real human, never a placeholder. PURE; assumes the actor passed RequireRealActor.
func ToProvenanceDetail(a RealActor, intent string) string {
	intent = strings.TrimSpace(intent)
	head := strings.TrimSpace(a.Display) + " <" + strings.TrimSpace(a.Identity) + ">"
	if intent == "" {
		return head
	}
	return head + ": " + intent
}

// Override is the recorded decision a human forges to override a block (CLAUDE.md §8: "an
// override is not an edit, it is a recorded decision"). It is APPEND-ONLY (it edits no
// truth in place) and content-addressed (id = records.Hash of its canonical body). It
// REQUIRES all three of: the ChangeSet it lands through, the ADR that records the reason,
// and the real-actor provenance — an override missing any is refused OVERRIDE_NOT_RECORDED.
type Override struct {
	// ID is the content address (SHA-256 hex of the canonical body).
	ID string `json:"id"`
	// OverriddenCode is the BlockReason code being overridden (e.g. INSUFFICIENT_AUTHORITY).
	OverriddenCode BlockCode `json:"overridden_code"`
	// ChangeSetRef is the id of the ChangeSet the override lands through (the §8 transaction).
	ChangeSetRef string `json:"changeset_ref"`
	// ADRRef is the ADR that records the WHY of the override (e.g. "ADR 0042").
	ADRRef string `json:"adr_ref"`
	// Actor is the real human who decided the override (provenance — never a placeholder).
	Actor RealActor `json:"actor"`
	// Reason is the verbatim human justification recorded with the override.
	Reason string `json:"reason"`
}

type overrideBody struct {
	Kind           string    `json:"kind"`
	OverriddenCode BlockCode `json:"overridden_code"`
	ChangeSetRef   string    `json:"changeset_ref"`
	ADRRef         string    `json:"adr_ref"`
	ActorIdentity  string    `json:"actor_identity"`
	ActorDisplay   string    `json:"actor_display"`
	Reason         string    `json:"reason"`
}

// OverrideBodyKind namespaces the override content address (an override and an idea never
// collide).
const OverrideBodyKind = "authority_override"

// NewOverride forges a recorded override decision. It REQUIRES (CLAUDE.md §8): a real actor
// (RequireRealActor), a non-blank ChangeSet ref, a non-blank ADR ref, and a non-blank
// reason — an override missing any is refused OVERRIDE_NOT_RECORDED. On success the id is
// the content hash of the canonical body (REUSING records.Hash, never a forked path), so
// re-recording the same override is idempotent. It writes NOTHING (the wall): the caller
// persists it append-only through the ChangeSet. PURE.
func NewOverride(overriddenCode BlockCode, changeSetRef, adrRef string, actor RealActor, reason string) (Override, *BlockReason) {
	if br := RequireRealActor(actor); br != nil {
		return Override{}, br
	}
	changeSetRef = strings.TrimSpace(changeSetRef)
	adrRef = strings.TrimSpace(adrRef)
	reason = strings.TrimSpace(reason)
	missing := []string{}
	if changeSetRef == "" {
		missing = append(missing, "changeset_ref")
	}
	if adrRef == "" {
		missing = append(missing, "adr_ref")
	}
	if reason == "" {
		missing = append(missing, "reason")
	}
	if len(missing) > 0 {
		return Override{}, overrideNotRecordedReason(missing)
	}
	o := Override{
		OverriddenCode: overriddenCode,
		ChangeSetRef:   changeSetRef,
		ADRRef:         adrRef,
		Actor:          actor,
		Reason:         reason,
	}
	id, err := o.contentAddress()
	if err != nil {
		return Override{}, &BlockReason{
			Code:        CodeOverrideNotRecorded,
			Severity:    "error",
			Explanation: "l'override n'a pas pu être adressé par contenu : " + err.Error(),
			HowToFix:    []string{"check_override_fields_are_valid"},
		}
	}
	o.ID = id
	return o, nil
}

// contentAddress returns the content hash of the override's canonical body, reusing the
// S01/S02 records.Hash/Canonicalize scheme (never a forked hashing path).
func (o Override) contentAddress() (string, error) {
	raw, err := json.Marshal(overrideBody{
		Kind:           OverrideBodyKind,
		OverriddenCode: o.OverriddenCode,
		ChangeSetRef:   o.ChangeSetRef,
		ADRRef:         o.ADRRef,
		ActorIdentity:  strings.TrimSpace(o.Actor.Identity),
		ActorDisplay:   strings.TrimSpace(o.Actor.Display),
		Reason:         o.Reason,
	})
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

func insufficientAuthorityReason(actor RealActor, domain string) *BlockReason {
	return &BlockReason{
		Code:     CodeInsufficientAuthority,
		Severity: "blocking",
		Explanation: "La proposition d'écriture-vérité exige l'approbation d'un user détenant l'autorité du " +
			"sous-graphe (domaine « " + domain + " », AuthorityGraph KRD §13.8), mais l'humain agissant (« " +
			actor.Display + " ») ne détient AUCUN des rôles d'autorité requis pour ce scope. Son rôle d'adhésion " +
			"(membership) ne lui octroie pas cette autorité ici. La vérité n'est pas admise.",
		HowToFix: []string{
			"Faites approuver la proposition par un user détenant l'autorité du scope (un binding member-role × domaine → rôle d'autorité).",
			"Ou demandez à un owner un rôle d'adhésion qui octroie l'autorité requise (AuthorityRoleBinding déclaré).",
			"Un override est possible mais reste une décision ENREGISTRÉE (ChangeSet + ADR + provenance), jamais un contournement silencieux.",
		},
	}
}

func overrideNotRecordedReason(missing []string) *BlockReason {
	return &BlockReason{
		Code:     CodeOverrideNotRecorded,
		Severity: "error",
		Explanation: "Un override n'est pas une édition, c'est une décision ENREGISTRÉE (CLAUDE.md §8) : il " +
			"exige un ChangeSet, un ADR et une provenance d'acteur réel. Champs manquants : " +
			strings.Join(missing, ", ") + ".",
		HowToFix: []string{
			"Ouvrez un ChangeSet pour porter l'override (transaction append-only, jamais une écriture en place).",
			"Rédigez l'ADR qui enregistre le POURQUOI de l'override.",
			"Attribuez l'override à un humain réel (provenance), jamais à un placeholder.",
		},
	}
}

// sortRoles sorts authority roles lexicographically (deterministic output order).
func sortRoles(rs []authority.Role) {
	for i := 1; i < len(rs); i++ {
		for j := i; j > 0 && rs[j] < rs[j-1]; j-- {
			rs[j], rs[j-1] = rs[j-1], rs[j]
		}
	}
}
