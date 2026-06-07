// Package projectwall is the S55 PROJECT-AWARE wall — the cross-project scope
// classifier that completes the multi-tenant isolation begun at S53/S54
// (app-builder EPIC 1). It is LEVEL 1 of a two-layer defense-in-depth, the twin of
// the Postgres RLS in back/migrations/project_rls_baseline.sql (level 2).
//
// THE DISTINCTION (CLAUDE.md §2). The S04 waterline wall (back/hooks/pretooluse/wall)
// answers "may the agent write this ZONE at all?" (kernel/mirrors/fitness → never).
// THIS wall answers a different, ORTHOGONAL question for the zones the agent MAY
// write (below the line — kernel-data·mirrors-data·ideas·changesets·dag·brain·
// context rows of a project): "is this write/read inside the CURRENT project's
// scope?". A below-the-line write that targets project B while the active project is
// A is refused with BlockReason AGENT_CROSS_PROJECT_WRITE — the cross-tenant leak the
// roadmap names. (A waterline-forbidden zone is still refused by the S04 wall; this
// wall only governs scope within the writable, project-scoped tables.)
//
// IDENTITY-KEYED (S55 ⇄ S61). The scope is keyed on the PROPAGATED IDENTITY, not on
// a request-supplied project_id alone: the active scope is (identity, project). A
// forged claim at the gateway (an identity asserting project B without holding it)
// is still refused — Classify never trusts a target project that the active scope
// does not name. This Go layer encodes the SAME predicate the RLS enforces in
// Postgres (back/migrations/project_rls_baseline.sql, current_setting('app.project')
// AND current_setting('app.identity')), so the two layers redden INDEPENDENTLY (the
// fault-injection done-criterion): break the hook and the RLS still refuses; break
// the RLS and the hook still refuses.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Classify is a PURE TOTAL function of its
// argument — no clock, no rng, no I/O, no LLM. Same (scope, target) ⇒ same verdict
// (the property mirror pins it). The wall is a MEANS, it writes nothing.
package projectwall

import "strings"

// Verdict is the classifier's decision. Exactly two — there is no third (pinned by
// the property mirror).
type Verdict string

const (
	// VerdictAllow lets the project-scoped op proceed (same project, or an unscoped
	// target this wall does not govern).
	VerdictAllow Verdict = "allow"
	// VerdictDeny refuses a cross-project op.
	VerdictDeny Verdict = "deny"
)

// BlockCode is the stable, machine-readable code of a refusal.
type BlockCode string

// CodeAgentCrossProjectWrite is the one code this wall emits: a below-the-line op
// targeting a project other than the active one (the roadmap's named refusal).
const CodeAgentCrossProjectWrite BlockCode = "AGENT_CROSS_PROJECT_WRITE"

// BlockReason is the actionable refusal shape shared across AIDOS block sites
// (CLAUDE.md §2: code, severity, explanation, how_to_fix[]).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Decision is the classifier's output: a verdict and, on deny, the BlockReason.
type Decision struct {
	Verdict     Verdict
	BlockReason *BlockReason
}

// Scope is the ACTIVE project scope of a request — keyed on BOTH the propagated
// identity (S61) and the active project. The cross-project wall trusts ONLY this
// pair; a target's claimed project is checked against ActiveProject, and an identity
// that does not match is refused regardless of the project claim. A zero Scope
// (empty identity or empty project) means "no active scope": every project-scoped
// target is refused (fail-closed — never an open default).
type Scope struct {
	// Identity is the propagated caller identity (S61). The RLS keys
	// current_setting('app.identity') on the same value.
	Identity string `json:"identity"`
	// ActiveProject is the project_id the current request is pinned to (S57 cookie).
	// The RLS keys current_setting('app.project') on the same value.
	ActiveProject string `json:"active_project"`
}

// IsZero reports whether the scope names no active (identity, project) pair. A zero
// scope refuses every project-scoped target (fail-closed).
func (s Scope) IsZero() bool {
	return strings.TrimSpace(s.Identity) == "" || strings.TrimSpace(s.ActiveProject) == ""
}

// Target is a below-the-line op's project target: the project_id of the row(s) the
// op reads or writes, PLUS the identity the op asserts it acts as. The wall checks
// (a) the asserted identity matches the active scope's identity (a forged gateway
// claim is refused — the S61 defense-in-depth), and (b) the target project equals
// the active project (no cross-tenant access). ClaimedIdentity empty means the op
// inherits the scope identity (the common case); a NON-empty mismatching identity is
// the forged-claim case the fixture mirror exercises.
type Target struct {
	// ProjectID is the project the op's rows belong to.
	ProjectID string `json:"project_id"`
	// ClaimedIdentity, when non-empty, is the identity the op asserts (e.g. a value
	// forged at the gateway). Empty ⇒ inherit the scope identity. A non-empty value
	// that differs from the scope identity is a forged claim → refused.
	ClaimedIdentity string `json:"claimed_identity"`
}

// Classify maps an active Scope and a below-the-line Target to a Decision. PURE and
// TOTAL. The predicate (the EXACT same one the RLS enforces):
//
//	allow IFF  scope is non-zero
//	      AND  the op's effective identity == scope.Identity   (no forged claim)
//	      AND  target.ProjectID == scope.ActiveProject         (no cross-project)
//
// Any failure denies with AGENT_CROSS_PROJECT_WRITE. A target with an empty
// ProjectID is NOT a project-scoped op (it does not name a project) and is allowed —
// the waterline wall (S04) governs zone, this wall only governs project scope.
func Classify(scope Scope, target Target) Decision {
	// A target that names no project is not project-scoped — this wall passes it
	// through (the S04 waterline wall governs whether the zone is writable at all).
	if strings.TrimSpace(target.ProjectID) == "" {
		return Decision{Verdict: VerdictAllow}
	}
	// Fail-closed: no active scope ⇒ a project-scoped op is refused.
	if scope.IsZero() {
		return Decision{Verdict: VerdictDeny, BlockReason: crossProjectBlockReason(scope, target)}
	}
	// Forged-identity defense (S61): if the op asserts an identity, it must match the
	// scope identity. A forged claim never widens scope.
	claimed := strings.TrimSpace(target.ClaimedIdentity)
	if claimed != "" && claimed != strings.TrimSpace(scope.Identity) {
		return Decision{Verdict: VerdictDeny, BlockReason: crossProjectBlockReason(scope, target)}
	}
	// Cross-project defense: the target project must equal the active project.
	if strings.TrimSpace(target.ProjectID) != strings.TrimSpace(scope.ActiveProject) {
		return Decision{Verdict: VerdictDeny, BlockReason: crossProjectBlockReason(scope, target)}
	}
	return Decision{Verdict: VerdictAllow}
}

// crossProjectBlockReason builds the canonical actionable refusal. The how_to_fix
// names the legal door: switch to the project (S57) under your own identity (S61).
func crossProjectBlockReason(scope Scope, target Target) *BlockReason {
	return &BlockReason{
		Code:     CodeAgentCrossProjectWrite,
		Severity: "error",
		Explanation: "Refus du mur project-aware : l'opération vise le projet « " + target.ProjectID +
			" » alors que le scope actif est (identité « " + scope.Identity + " », projet « " + scope.ActiveProject +
			" »). L'agent ne lit/écrit below-the-line que pour le projet courant, sous sa propre identité propagée (S61).",
		HowToFix: []string{
			"Basculez sur le projet visé via le project switcher (S57) avant d'agir.",
			"N'agissez que sous votre identité propagée — une réclamation forgée à la passerelle est refusée par la RLS (couche 2).",
			"Une opération inter-projets n'existe pas : chaque projet est une frontière de scope isolée.",
		},
	}
}
