// Package appauth is the S80 behavior-macro «auth & rôles de l'app ÉMISE» (KRD §24.6, app-builder
// EPIC 7, ROADMAP S80). It models the authentication + role-based authorization of the application
// the USER BUILDS — distinct from the AIDOS users' auth (E3/S61-63). The app the user constructs has
// ITS OWN users (login, roles, runtime authz); `app-auth` attaches that whole subsystem to a project
// and EXPANDS it deterministically into entities + operations + policies, mapping the AuthorityGraph
// OF THE EMITTED APP'S RUNTIME (its login/role gate), NEVER the AIDOS approvers.
//
// WHY A DEDICATED MACRO (not a behavior.Kind row). The S76 behavior.Expand attaches a SINGLE piece-set
// to ONE entity (owner_id on Order). `app-auth` is a SUBSYSTEM: three new entities (User/Role/Session),
// two operations (login/logout) and the role-authz policy band — a multi-entity expansion the single-
// entity Expand cannot shape. So S80 ships ExpandAppAuth as its OWN authoritative pure function; it
// does NOT fork behavior.Expand (a different shape, not a duplicate of the same one). The single-
// function law (§24.6) forbids two expansions of the SAME macro, not one expansion per macro.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ExpandAppAuth and CheckAccess are PURE, TOTAL functions — no DB,
// no clock, no RNG, no I/O, never panic, no map-iteration-order leak. Same target ⇒ byte-identical
// Subsystem (the content-addressed ExpansionID pins it). The runtime authz decision is a pure lookup
// over the DECLARED role→operation grant table, NEVER an LLM judgment — "an LLM deciding whether a
// role may act" would be a determinism gap; the rule is code, and the code is authoritative. The
// reproducibility mirror (appauth_property_test.go) pins byte-identity + idempotence; the runtime
// fixture (appauth_fixture_test.go) pins "a protected operation refuses an insufficient role".
//
// THE WALL. This package writes NO truth. Propose runs ExpandAppAuth and wraps its DRY-RUN into a
// DRAFT changeset.ChangeSet (proposed, never APPLIED); freezing the expanded auth subsystem into the
// kernel goes via the wall (idée → miroir → /goal → approbation humaine, CLAUDE.md §2). WroteKernel is
// ALWAYS false.
package appauth

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// MacroName is the single token of this behavior-macro. Closed: attaching anything else is a typed
// error, never a guessed subsystem (the honesty rule).
const MacroName = "app-auth"

// Role is one declared runtime role of the EMITTED app's authority graph. The set is CLOSED and
// canonically ordered (weakest → strongest); a role outside it is refused, never invented.
type Role string

const (
	// Viewer — read-only access to the emitted app (the weakest role).
	Viewer Role = "viewer"
	// Editor — read + mutate the emitted app's data.
	Editor Role = "editor"
	// Admin — full access including the emitted app's privileged operations.
	Admin Role = "admin"
)

// roleOrder is the canonical, stable order of the role band (weakest → strongest). It also encodes the
// authority RANK used by CheckAccess: a role satisfies an operation iff its rank ≥ the operation's
// required rank.
var roleOrder = []Role{Viewer, Editor, Admin}

// roleRank maps a role to its authority rank (its index in roleOrder). Higher = stronger.
var roleRank = map[Role]int{Viewer: 0, Editor: 1, Admin: 2}

// Roles returns the declared runtime roles in canonical order. PURE.
func Roles() []Role { return append([]Role(nil), roleOrder...) }

// ProtectedOperation is one operation of the emitted app guarded by `app-auth`, with the MINIMUM role
// required to invoke it at runtime (the emitted app's AuthorityGraph, declared — not the AIDOS
// approvers). The set is the closed authz band the macro expands.
type ProtectedOperation struct {
	// Name is the emitted operation's name (e.g. "login", "logout", "deleteAccount").
	Name string `json:"name"`
	// MinRole is the weakest role allowed to invoke it at runtime. A caller with a strictly weaker
	// role is DENIED (the fixture's "insufficient role refused").
	MinRole Role `json:"min_role"`
}

// authzBand is the DECLARED runtime authz of the emitted app — the operation→required-role table
// `app-auth` expands. login is public-facing (viewer can attempt it); logout needs an authenticated
// (editor) session; the privileged manageRoles needs admin. This table is the AUTHORITATIVE source of
// the runtime authority graph: code, not an LLM (determinism-first).
var authzBand = []ProtectedOperation{
	{Name: "login", MinRole: Viewer},
	{Name: "logout", MinRole: Editor},
	{Name: "manageRoles", MinRole: Admin},
}

// Entity is one expanded entity of the auth subsystem (User/Role/Session) — name + its scalar
// attributes, mirroring the entities vocabulary (name + type + required). The full Entity AST is
// frozen later via /goal; the dry-run names the shape.
type Entity struct {
	Name       string      `json:"name"`
	Attributes []Attribute `json:"attributes"`
}

// Attribute is one expanded entity field (scalar type + required), the entities vocabulary.
type Attribute struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
}

// Operation is one expanded operation NAME the macro adds to the emitted app (login/logout). The full
// Operation AST is materialised via /goal; the dry-run names the verb.
type Operation struct {
	Name string `json:"name"`
}

// Policy is one expanded runtime authz policy — a named ALLOW/DENY rule scoped to an emitted operation
// and keyed on the minimum role. This is the emitted app's runtime gate (NOT an AIDOS approval gate).
type Policy struct {
	Name      string `json:"name"`
	Scope     string `json:"scope"`
	Operation string `json:"operation"`
	MinRole   Role   `json:"min_role"`
	Effect    string `json:"effect"`
}

// Subsystem is the DRY-RUN result of attaching `app-auth` to a project's app — the whole auth
// subsystem the macro implies (KRD §24.6, the multi-entity shape). VALUES only: WroteKernel is ALWAYS
// false (the wall), and ExpansionID content-addresses the canonical body (determinism, testable).
type Subsystem struct {
	// Macro echoes the macro name for provenance ("who expanded what"). Always MacroName.
	Macro string `json:"macro"`
	// Target is the project/app the subsystem is attached to (provenance + scoping).
	Target string `json:"target"`
	// The expanded subsystem, each slice in canonical order (deterministic).
	Entities   []Entity    `json:"entities"`
	Operations []Operation `json:"operations"`
	Policies   []Policy    `json:"policies"`
	// ExpansionID = records.Hash(records.Canonicalize(body)) over the body — same target ⇒ same id
	// (the reproducibility invariant, content-addressed).
	ExpansionID string `json:"expansion_id"`
	// WroteKernel is ALWAYS false. The expansion is a dry-run; freezing goes via /goal.
	WroteKernel bool `json:"wrote_kernel"`
}

// Errors.
var (
	// ErrNoTarget — an expansion with an empty target app/project name.
	ErrNoTarget = errors.New("appauth: attachment has no target app name")
	// ErrUnknownRole — a CheckAccess role not in the declared closed set (never a guessed grant).
	ErrUnknownRole = errors.New("appauth: role is not in the declared runtime role set")
	// ErrUnknownOperation — a CheckAccess operation not in the declared authz band.
	ErrUnknownOperation = errors.New("appauth: operation is not in the declared authz band")
)

// ExpandAppAuth is the §24.6 `app-auth` expansion — PURE, TOTAL, DRY-RUN, IDEMPOTENT, the AUTHORITATIVE
// (single) function for this macro. It returns the auth subsystem (User/Role/Session entities, login/
// logout operations, the role-authz policy band) for a target app, in canonical order. It WRITES
// NOTHING (WroteKernel=false). Same target ⇒ byte-identical Subsystem (ExpansionID pins it). An empty
// target is a typed error, never a guessed app (the honesty rule).
func ExpandAppAuth(target string) (Subsystem, error) {
	if target == "" {
		return Subsystem{}, ErrNoTarget
	}
	out := Subsystem{
		Macro:       MacroName,
		Target:      target,
		Entities:    declaredEntities(),
		Operations:  declaredOperations(),
		Policies:    declaredPolicies(),
		WroteKernel: false,
	}
	id, err := expansionID(out)
	if err != nil {
		return Subsystem{}, fmt.Errorf("appauth: address expansion: %w", err)
	}
	out.ExpansionID = id
	return out, nil
}

// declaredEntities is the closed User/Role/Session shape the macro expands. The emitted app's identity
// model: a User (credentials + role), a Role (the runtime authority token), a Session (the login
// token, expiring). Each in canonical (declaration) order.
func declaredEntities() []Entity {
	return []Entity{
		{Name: "User", Attributes: []Attribute{
			{Name: "id", Type: "string", Required: true},
			{Name: "email", Type: "string", Required: true},
			{Name: "password_hash", Type: "string", Required: true},
			{Name: "role", Type: "string", Required: true},
		}},
		{Name: "Role", Attributes: []Attribute{
			{Name: "name", Type: "string", Required: true},
			{Name: "rank", Type: "int", Required: true},
		}},
		{Name: "Session", Attributes: []Attribute{
			{Name: "id", Type: "string", Required: true},
			{Name: "user_id", Type: "string", Required: true},
			{Name: "expires_at", Type: "timestamptz", Required: true},
		}},
	}
}

// ExpandAppAuthEntities exposes the closed User/Role/Session entity shape the macro expands — a PURE
// read of the declared entities (no target needed). S81 uses it to validate that a template relation
// may target an auth entity (e.g. User) too, without re-implementing the shape (the single-function
// law). Returns a fresh copy in canonical order.
func ExpandAppAuthEntities() []Entity { return declaredEntities() }

// declaredOperations is the closed login/logout verb set the macro adds to the emitted app.
func declaredOperations() []Operation {
	return []Operation{{Name: "login"}, {Name: "logout"}}
}

// declaredPolicies is the runtime authz policy band — one DENY policy per protected operation, keyed
// on its minimum role (the emitted app's runtime AuthorityGraph). A caller with a strictly weaker role
// is denied at runtime (the fixture). Canonical order = authzBand order.
func declaredPolicies() []Policy {
	out := make([]Policy, 0, len(authzBand))
	for _, op := range authzBand {
		out = append(out, Policy{
			Name:      "authz-" + op.Name,
			Scope:     "OPERATION",
			Operation: op.Name,
			MinRole:   op.MinRole,
			Effect:    "DENY", // DENY when the caller role rank < MinRole rank.
		})
	}
	return out
}

// Decision is the runtime authz verdict for a (role, operation) pair on the EMITTED app — Allowed plus
// the required minimum role (for an honest "INSUFFICIENT_ROLE" message). This is the emitted app's
// runtime gate, computed by code.
type Decision struct {
	Allowed  bool `json:"allowed"`
	Role     Role `json:"role"`
	MinRole  Role `json:"min_role"`
	Required Role `json:"required"`
}

// CheckAccess is the EMITTED app's RUNTIME authorization decision — PURE, TOTAL, the authoritative gate.
// It returns whether `role` may invoke `operation` at runtime: allowed iff the role's rank ≥ the
// operation's required minimum-role rank, over the DECLARED authzBand. An unknown role or operation is
// a typed error (never a guessed allow — the honesty rule). This maps the AuthorityGraph of the
// emitted app's runtime; it is NEVER an LLM judgment (determinism-first).
func CheckAccess(role Role, operation string) (Decision, error) {
	rank, ok := roleRank[role]
	if !ok {
		return Decision{}, fmt.Errorf("%w: %q", ErrUnknownRole, role)
	}
	var min Role
	found := false
	for _, op := range authzBand {
		if op.Name == operation {
			min = op.MinRole
			found = true
			break
		}
	}
	if !found {
		return Decision{}, fmt.Errorf("%w: %q", ErrUnknownOperation, operation)
	}
	return Decision{
		Allowed:  rank >= roleRank[min],
		Role:     role,
		MinRole:  min,
		Required: min,
	}, nil
}

// PieceCount totals the source pieces a subsystem emits (entities + operations + policies) — the
// deterministic count the Workbench renders. PURE.
func PieceCount(s Subsystem) int {
	return len(s.Entities) + len(s.Operations) + len(s.Policies)
}

// SortedNames returns every emitted piece name in one stable, sorted list — a convenience for the
// reproducibility mirror's byte-identity assertion. PURE.
func SortedNames(s Subsystem) []string {
	var out []string
	for _, e := range s.Entities {
		out = append(out, "ent:"+e.Name)
	}
	for _, o := range s.Operations {
		out = append(out, "op:"+o.Name)
	}
	for _, p := range s.Policies {
		out = append(out, "pol:"+p.Name)
	}
	sort.Strings(out)
	return out
}

// expansionID content-addresses a subsystem over its semantic body (macro + target + the three
// kinds), EXCLUDING the ExpansionID/WroteKernel fields. Reuses records.Canonicalize/Hash (S02) — same
// body ⇒ same id, key-order-stable.
func expansionID(s Subsystem) (string, error) {
	body := struct {
		Macro      string      `json:"macro"`
		Target     string      `json:"target"`
		Entities   []Entity    `json:"entities"`
		Operations []Operation `json:"operations"`
		Policies   []Policy    `json:"policies"`
	}{
		Macro:      s.Macro,
		Target:     s.Target,
		Entities:   s.Entities,
		Operations: s.Operations,
		Policies:   s.Policies,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Proposal is the result of proposing `app-auth` on a target app: the DRY-RUN Subsystem (echoed for
// the Workbench preview) plus a DRAFT ChangeSet carrying it — never APPLIED. The changeset's
// spec_delta carries the canonical subsystem body, project-scoped; its mirror_delta declares the proof
// obligation (completeness). Approval (apply) is the `aidos` CLI's job, gated by the AuthorityGraph.
type Proposal struct {
	Subsystem Subsystem           `json:"subsystem"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
}

// Propose runs the ONE ExpandAppAuth for a target app and wraps its dry-run into a DRAFT
// changeset.ChangeSet — the single legal way the `app-auth` subsystem reaches truth. It WRITES NOTHING
// (changeset.Open is PURE). The returned changeset is `proposed` (DRAFT); a human approves (applies)
// or rejects it downstream — a reject leaves the kernel intact because Propose never touched it. The
// spec_delta target is "app-auth@<target>" so a reject/approve is project-scoped.
func Propose(target, parentPhase string) (Proposal, error) {
	sub, err := ExpandAppAuth(target)
	if err != nil {
		return Proposal{}, err
	}
	body, err := json.Marshal(sub)
	if err != nil {
		return Proposal{}, fmt.Errorf("appauth: marshal subsystem: %w", err)
	}
	specTarget := fmt.Sprintf("app-auth@%s", target)
	label := fmt.Sprintf("appauth: propose app-auth subsystem on %s (%s)", target, short(sub.ExpansionID))
	spec := &changeset.Delta{Kind: "add", Target: specTarget, Body: json.RawMessage(body)}
	mirror := &changeset.Delta{Kind: "add", Target: specTarget + "#mirror"}
	cs, err := changeset.Open(label, parentPhase, spec, mirror)
	if err != nil {
		return Proposal{}, err
	}
	return Proposal{Subsystem: sub, ChangeSet: cs}, nil
}

// short returns the first 8 chars of a content hash (for human labels). Never used for identity.
func short(h string) string {
	if len(h) <= 8 {
		return h
	}
	return h[:8]
}
