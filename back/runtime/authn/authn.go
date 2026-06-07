// Package authn is the S61 AUTHENTICATION core — the deterministic, pure twin of the
// front Auth.js/OIDC session layer (app-builder EPIC 3, ROADMAP S61). It answers ONE
// question, server-side, before any gateway dispatch: "who is the caller, and is this
// call authenticated AT ALL?".
//
// THE TWO-LAYER IDENTITY (CLAUDE.md §2, ROADMAP S55 ⇄ S61). Authentication is NEVER
// gateway-only: a single resolved Identity propagates into (a) the gateway scope check
// (back/runtime/projectwall, layer 1) AND (b) the Postgres RLS GUC app.identity (layer
// 2, back/migrations/project_rls_baseline.sql). The two layers redden INDEPENDENTLY:
//
//   - UNAUTHENTICATED (layer 0, THIS package). A call with no valid session/JWT to a
//     truth-write endpoint is refused with BlockReason UNAUTHENTICATED *before the
//     router runs* — it reaches NO project data (the property done-criterion). A bug in
//     the gateway cannot bypass it because the refusal is upstream of routing.
//   - The RLS still refuses (layer 2) even a VALID gateway identity that holds no
//     membership row: SetIdentityGUC sets app.identity, but a row whose owning scope the
//     identity does not match sees zero rows (the fixture done-criterion — two
//     independent layers).
//
// AUTH LIVES OUTSIDE THE KERNEL (ROADMAP S61). The `accounts` schema (users:
// id, email, identity_provider) is its OWN below-the-line zone — never kernel/mirrors/
// fitness. The wall is unchanged: this package writes no truth.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Resolve and Authorize are PURE TOTAL functions of
// their input (a session principal + a tool disposition). No clock, no rng, no I/O, no
// LLM — "the judge is deterministic". JWT signature VERIFICATION (an irreducible crypto
// primitive) is delegated to a Verifier seam the HTTP server wires (Auth.js/OIDC); given
// the verifier's verdict, the authorization decision here is a pure function. Same input
// ⇒ same decision (the property mirror pins it).
package authn

import "strings"

// IdentityProvider names the OIDC issuer that vouched for a user — stored on the
// accounts.users row (id, email, identity_provider). It is opaque to the authz logic;
// it is recorded for provenance and surfaced in the Workbench. Empty is not a valid
// provider (an unauthenticated principal carries none).
type IdentityProvider string

// Principal is a RESOLVED, VERIFIED caller — the output of a successful session/JWT
// verification (Auth.js front → JWT verified by the gateway). It is the single identity
// that propagates to BOTH walls. A zero Principal (empty Identity) is "no caller" —
// every authenticated-only endpoint refuses it.
type Principal struct {
	// Identity is the stable subject id (the accounts.users.id) the RLS app.identity
	// GUC and the projectwall.Scope.Identity are both keyed on — ONE value, two layers.
	Identity string `json:"identity"`
	// Email is the verified email claim (accounts.users.email).
	Email string `json:"email"`
	// Provider is the OIDC issuer (accounts.users.identity_provider).
	Provider IdentityProvider `json:"identity_provider"`
}

// IsAnonymous reports whether the principal names no resolved caller (an empty subject).
// A request whose session/JWT did not verify yields an anonymous principal — fail-closed.
func (p Principal) IsAnonymous() bool {
	return strings.TrimSpace(p.Identity) == ""
}

// Disposition mirrors the gateway tool disposition this package must guard. Re-declared
// (not imported) to keep authn a LEAF package the gateway depends on, never the reverse
// (no import cycle). The two string values are byte-identical to gateway.Disposition.
type Disposition string

const (
	// DispositionBelowLine — a below-the-line read/op. Still requires authentication
	// (an anonymous caller reaches no project data), but the refusal code is the same
	// UNAUTHENTICATED — there is no "anonymous below-the-line" door.
	DispositionBelowLine Disposition = "below_line"
	// DispositionTruthWrite — a truth-zone write. The property done-criterion names
	// THIS as the endpoint an unauthenticated call must be refused at, upstream of the
	// router, reaching no data.
	DispositionTruthWrite Disposition = "truth_write"
)

// AuthOutcome is the authentication gate's verdict — exactly two terminal states.
type AuthOutcome string

const (
	// OutcomeAuthenticated means the caller is resolved and the call may proceed to the
	// downstream scope/zone walls (gateway router + RLS). It is NOT "authorized" — the
	// project-scope and truth-zone walls still run after it.
	OutcomeAuthenticated AuthOutcome = "authenticated"
	// OutcomeUnauthenticated means no valid session/JWT — refused with UNAUTHENTICATED,
	// reaching no project data.
	OutcomeUnauthenticated AuthOutcome = "unauthenticated"
)

// BlockCode is the stable, machine-readable code of an auth refusal (the §2 BlockReason
// shape, shared across AIDOS block sites).
type BlockCode string

// CodeUnauthenticated is the one code this gate emits: a call with no valid
// session/JWT. NOT coined ad-hoc — it is the property done-criterion's named refusal.
const CodeUnauthenticated BlockCode = "UNAUTHENTICATED"

// BlockReason is the actionable refusal shape (CLAUDE.md §2: code, severity,
// explanation, how_to_fix[]).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Decision is the authentication gate's output: an outcome, the resolved principal on
// success, and the BlockReason on refusal.
type Decision struct {
	Outcome     AuthOutcome  `json:"outcome"`
	Principal   *Principal   `json:"principal,omitempty"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Authenticate is the deterministic, total authentication gate. It runs UPSTREAM of the
// gateway router and the RLS: an anonymous principal is refused with UNAUTHENTICATED for
// EVERY disposition (truth-write OR below-the-line) — there is no anonymous door, and the
// refusal happens before any data is touched (the property done-criterion). A resolved
// principal is returned for the scope/zone walls to continue.
//
// PURE: no clock, no rng, no I/O, no LLM. Same (principal, disposition) ⇒ same decision.
func Authenticate(p Principal, _ Disposition) Decision {
	if p.IsAnonymous() {
		return Decision{
			Outcome:     OutcomeUnauthenticated,
			BlockReason: unauthenticatedReason(),
		}
	}
	resolved := p
	return Decision{Outcome: OutcomeAuthenticated, Principal: &resolved}
}

func unauthenticatedReason() *BlockReason {
	return &BlockReason{
		Code:     CodeUnauthenticated,
		Severity: "error",
		Explanation: "Refus de l'authentification : l'appel ne porte aucune session valide (OAuth/OIDC) " +
			"ni JWT vérifié. AIDOS n'a pas de porte anonyme : l'identité est résolue AVANT le routage et " +
			"propagée aux DEUX murs (passerelle + RLS Postgres) — un appel non authentifié n'atteint AUCUNE " +
			"donnée projet (CLAUDE.md §2, ROADMAP S61).",
		HowToFix: []string{
			"Connectez-vous via le fournisseur OAuth/OIDC (Auth.js côté Workbench) pour ouvrir une session.",
			"La passerelle vérifie le JWT à chaque appel ; un jeton absent ou invalide est refusé UNAUTHENTICATED.",
			"L'authentification n'est jamais gateway-only : la même identité descend jusqu'à la RLS Postgres (S55).",
		},
	}
}

// SessionGUCs is the pair of Postgres session GUCs a resolved principal sets on its
// transaction so the RLS (layer 2) keys on the SAME identity the gateway used (layer 1).
// The HTTP server runs `SET LOCAL app.identity = $1` (and S57 sets app.project) inside
// the request transaction. An anonymous principal yields an EMPTY identity GUC → the RLS
// predicate current_setting('app.identity', true) is NULL → zero rows (fail-closed).
type SessionGUCs struct {
	// Identity is the value for SET LOCAL app.identity — the RLS keys on it.
	Identity string `json:"app.identity"`
}

// GUCs projects a principal to the RLS session GUC value. PURE. An anonymous principal
// yields an empty identity (the RLS then sees nothing — the second layer, independent of
// the gateway). The active project GUC (app.project) is owned by S57, not this package.
func (p Principal) GUCs() SessionGUCs {
	if p.IsAnonymous() {
		return SessionGUCs{Identity: ""}
	}
	return SessionGUCs{Identity: strings.TrimSpace(p.Identity)}
}
