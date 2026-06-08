// Package membership is the S62 PROJECT MEMBERSHIP & OWNERSHIP authority — the
// deterministic, pure twin of the `accounts.project_members` join (user × project × role).
// It answers ONE question, server-side, AFTER authentication (S61) and BEFORE any
// project-scoped op runs: "is this resolved identity a member of this project, and may its
// role perform THIS op?".
//
// THE THIRD LAYER (CLAUDE.md §2, ROADMAP S55 ⇄ S61 ⇄ S62). Authentication (S61, layer 0)
// proves WHO the caller is; the project-scope wall + RLS (S55, layers 1 & 2) prove the op
// targets the ACTIVE project under the propagated identity. S62 adds the MEMBERSHIP
// predicate the S55 RLS deferred ("the identity match to a per-project membership row is
// S62"): a VALID, authenticated identity that holds NO membership row in the project is a
// NON-MEMBER and is refused with NOT_A_MEMBER — independent of authentication. The three
// layers redden INDEPENDENTLY: a bug in any one is backstopped by the others.
//
// ROLE GRADIENT (owner ⊃ editor ⊃ viewer). A project member carries exactly one of three
// roles. A VIEWER may read the project but may NOT mutate it (the fixture done-criterion);
// an EDITOR may read and mutate the project's below-the-line rows; an OWNER additionally
// administers membership (invite / remove / change role) — the admin ops the project.owner_ref
// (S53) now resolves to a REAL owner. The role gradient is a closed, declared lattice
// (CLAUDE.md §8: weights/authorities declared, never learned).
//
// AUTH LIVES OUTSIDE THE KERNEL (ROADMAP S61/S62). The membership row is in the `accounts`
// schema (its own below-the-line zone) — never kernel/mirrors/fitness. invite/remove/role
// are below-the-line server actions; this package writes no truth.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Authorize and CanAdminister are PURE TOTAL functions
// of (membership, op). No clock, no rng, no I/O, no LLM — "the judge is deterministic".
// NewMembership is content-addressed (records.Hash) → same (identity, project, role) lands
// the same id (idempotent). Same input ⇒ same decision (the property mirror pins it).
package membership

import (
	"encoding/json"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Role is a member's one role in a project — the closed three of the gradient. No fourth
// role exists (pinned by the property mirror). The zero Role ("") is "not a role" — a
// membership must carry a valid role, and a non-member carries none.
type Role string

const (
	// RoleOwner administers the project (invite/remove/role) AND reads + mutates it. The
	// project.owner_ref (S53) resolves to the identity holding an owner membership.
	RoleOwner Role = "owner"
	// RoleEditor reads + mutates the project's below-the-line rows, but may NOT administer
	// membership.
	RoleEditor Role = "editor"
	// RoleViewer reads the project but may NOT mutate it (the fixture done-criterion).
	RoleViewer Role = "viewer"
)

// IsValid reports whether r is one of the closed three roles. An invalid/empty role never
// authorizes anything (fail-closed).
func (r Role) IsValid() bool {
	switch r {
	case RoleOwner, RoleEditor, RoleViewer:
		return true
	default:
		return false
	}
}

// canMutate reports whether the role may MUTATE the project's rows (editor & owner; not
// viewer). The single source of the viewer-cannot-mutate rule.
func (r Role) canMutate() bool { return r == RoleOwner || r == RoleEditor }

// canAdminister reports whether the role may administer MEMBERSHIP (invite/remove/role) —
// owner only. The project.owner_ref resolves to such a member.
func (r Role) canAdminister() bool { return r == RoleOwner }

// OpKind is the kind of op a member attempts against a project. Closed set; the authority
// gradient maps each to a role floor.
type OpKind string

const (
	// OpRead — a below-the-line read of the project's rows. Any member may read.
	OpRead OpKind = "read"
	// OpMutate — a below-the-line write/update/delete of the project's rows. Editor & owner.
	OpMutate OpKind = "mutate"
	// OpAdminister — invite/remove/change-role of a member. Owner only.
	OpAdminister OpKind = "administer"
)

// Membership is a row of accounts.project_members: a resolved identity (S61) bound to a
// project (S53) with exactly one role. It is BELOW the wall. The content address (id) is the
// SHA-256 of {kind,identity,project_id,role} so the SAME (identity, project, role) is
// idempotent and a role CHANGE writes a NEW row (append-only, like every AIDOS record).
type Membership struct {
	// ID is the content address (SHA-256 hex of the canonical body).
	ID string `json:"id"`
	// Identity is the propagated caller identity (accounts.users.id, S61) — the same value
	// the gateway scope check and the RLS app.identity GUC key on.
	Identity string `json:"identity"`
	// ProjectID is the project (projects.project.id, S53) this membership scopes.
	ProjectID string `json:"project_id"`
	// Role is the member's one role.
	Role Role `json:"role"`
}

// MembershipBodyKind namespaces the content address (a membership and a user never collide).
const MembershipBodyKind = "project_member"

type membershipBody struct {
	Kind      string `json:"kind"`
	Identity  string `json:"identity"`
	ProjectID string `json:"project_id"`
	Role      string `json:"role"`
}

// ErrInvalidMembership is returned by NewMembership for an empty identity/project or an
// invalid role — a membership is never half-formed.
type validationError string

func (e validationError) Error() string { return string(e) }

// NewMembership builds a content-addressed Membership. PURE and total over valid input:
// the id is records.Hash(canonical body), so re-issuing the same (identity, project, role)
// lands the same id (idempotent). It writes NOTHING; persistence into accounts.project_members
// is the below-the-line server-action store path.
func NewMembership(identity, projectID string, role Role) (Membership, error) {
	identity = strings.TrimSpace(identity)
	projectID = strings.TrimSpace(projectID)
	if identity == "" {
		return Membership{}, validationError("membership identity must not be empty")
	}
	if projectID == "" {
		return Membership{}, validationError("membership project_id must not be empty")
	}
	if !role.IsValid() {
		return Membership{}, validationError("membership role must be one of owner|editor|viewer")
	}
	body := membershipBody{Kind: MembershipBodyKind, Identity: identity, ProjectID: projectID, Role: string(role)}
	raw, err := json.Marshal(body)
	if err != nil {
		return Membership{}, err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return Membership{}, err
	}
	return Membership{ID: records.Hash(canon), Identity: identity, ProjectID: projectID, Role: role}, nil
}

// BlockCode is the stable, machine-readable code of a membership refusal (the §2 shape).
type BlockCode string

const (
	// CodeNotAMember — a VALID, authenticated identity that holds no membership row in the
	// project (the roadmap's named refusal). Distinct from UNAUTHENTICATED (S61): the caller
	// IS known, just not a member here.
	CodeNotAMember BlockCode = "NOT_A_MEMBER"
	// CodeRoleForbidden — a member whose role is too low for the op (e.g. a viewer trying to
	// mutate, an editor trying to administer membership).
	CodeRoleForbidden BlockCode = "ROLE_FORBIDDEN"
)

// BlockReason is the actionable refusal shape (CLAUDE.md §2: code, severity, explanation,
// how_to_fix[]).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Verdict is the authority's decision — exactly two.
type Verdict string

const (
	// VerdictAllow lets the op proceed (to the scope wall + RLS).
	VerdictAllow Verdict = "allow"
	// VerdictDeny refuses (NOT_A_MEMBER or ROLE_FORBIDDEN).
	VerdictDeny Verdict = "deny"
)

// Decision is Authorize's output: a verdict and, on deny, the BlockReason.
type Decision struct {
	Verdict     Verdict      `json:"verdict"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Authorize maps a member's membership (nil ⇒ NON-MEMBER) and the attempted op to a
// Decision. PURE and TOTAL. The predicate (the role gradient, declared not learned):
//
//	NOT_A_MEMBER   IF membership is nil OR its role is invalid  (non-member / malformed)
//	ROLE_FORBIDDEN IF the role is too low for the op
//	               (viewer→mutate, viewer/editor→administer)
//	allow          otherwise
//
// projectID is the project the op targets; a membership for a DIFFERENT project is treated
// as no membership for THIS project (NOT_A_MEMBER) — a member of project A is a non-member
// of project B. This is the membership predicate the S55 RLS deferred to S62.
func Authorize(m *Membership, projectID string, op OpKind) Decision {
	projectID = strings.TrimSpace(projectID)
	// A non-member (no row) OR a membership for another project OR a malformed role is a
	// NON-MEMBER for this project (fail-closed).
	if m == nil || !m.Role.IsValid() || strings.TrimSpace(m.ProjectID) != projectID || projectID == "" {
		return Decision{Verdict: VerdictDeny, BlockReason: notAMemberReason(projectID)}
	}
	switch op {
	case OpRead:
		// Any member may read.
		return Decision{Verdict: VerdictAllow}
	case OpMutate:
		if !m.Role.canMutate() {
			return Decision{Verdict: VerdictDeny, BlockReason: roleForbiddenReason(m.Role, op)}
		}
		return Decision{Verdict: VerdictAllow}
	case OpAdminister:
		if !m.Role.canAdminister() {
			return Decision{Verdict: VerdictDeny, BlockReason: roleForbiddenReason(m.Role, op)}
		}
		return Decision{Verdict: VerdictAllow}
	default:
		// An unknown op is refused (fail-closed — never an open default).
		return Decision{Verdict: VerdictDeny, BlockReason: roleForbiddenReason(m.Role, op)}
	}
}

// CanAdminister is the convenience predicate the invite/remove/role server actions gate on:
// only an OWNER membership for the target project may administer membership. PURE.
func CanAdminister(m *Membership, projectID string) bool {
	return Authorize(m, projectID, OpAdminister).Verdict == VerdictAllow
}

func notAMemberReason(projectID string) *BlockReason {
	return &BlockReason{
		Code:     CodeNotAMember,
		Severity: "error",
		Explanation: "Refus d'adhésion : l'identité est authentifiée (S61) mais ne détient AUCUNE ligne " +
			"d'adhésion (accounts.project_members) dans le projet « " + projectID + " ». L'authentification " +
			"prouve QUI vous êtes, pas que vous êtes membre de CE projet — un non-membre n'atteint aucune " +
			"donnée projet (CLAUDE.md §2, ROADMAP S62). C'est la troisième couche, indépendante de la " +
			"passerelle et de la RLS.",
		HowToFix: []string{
			"Demandez à un propriétaire (owner) du projet de vous inviter (server action invite, below-the-line).",
			"Une adhésion lie (identité × projet × rôle owner/editor/viewer) ; sans elle l'accès est refusé NOT_A_MEMBER.",
			"L'adhésion est propre à un projet : être membre du projet A ne vous rend pas membre du projet B.",
		},
	}
}

func roleForbiddenReason(role Role, op OpKind) *BlockReason {
	return &BlockReason{
		Code:     CodeRoleForbidden,
		Severity: "error",
		Explanation: "Refus de rôle : le rôle « " + string(role) + " » ne permet pas l'opération « " +
			string(op) + " ». Le gradient est déclaré (owner ⊃ editor ⊃ viewer) : un viewer lit mais ne " +
			"mute pas ; administrer l'adhésion (inviter/retirer/changer un rôle) est réservé au owner " +
			"(ROADMAP S62).",
		HowToFix: []string{
			"Pour muter le projet, demandez le rôle editor ou owner à un propriétaire (server action role).",
			"Pour administrer l'adhésion, seul un owner le peut — le project.owner_ref (S53) résout vers lui.",
			"Le gradient de rôle est déclaré, jamais appris (CLAUDE.md §8).",
		},
	}
}
