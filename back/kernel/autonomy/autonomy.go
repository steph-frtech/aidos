// Package autonomy is FK10 (ROADMAP-fke, FKE-11/34) — the AUTONOMY axis of the governed
// agent layer: a CLOSED, DECLARED level autonomy_level ∈ {A0..A8} (the 6th axis of the
// CoucheAgent, additive to the five S52 axes), a FAIL-CLOSED enforcement (an action whose
// required level exceeds the declared level is refused with an actionable BlockReason), and
// a PROMOTION that is a PURE FUNCTION of the AgentRun history (N green E4+ runs without
// incident) — never a level an agent declares for itself.
//
// THE LADDER (FKE-11/34). The eight rungs, ascending. A0 is the most confined (read /
// propose only — the wall's structural default); A8 is fully autonomous. The set is CLOSED:
// a level outside {A0..A8} is invalid (fail-closed). The rungs are DECLARED here, never
// learned, never discovered at runtime (§8: weights/thresholds declared above the line).
//
//	A0 propose-only           A1 single low-risk write       A2 multi-write within scope
//	A3 below-the-line ops      A4 mirror-proposing runs        A5 cross-cell runs
//	A6 merge / integration     A7 release / deploy             A8 fully autonomous
//
// A8-NEVER-ON-CRITICAL (FKE-11/34: "A8 jamais sur action critique"). A critical action (a
// merge, a deploy, an irreversible truth write) NEVER admits A8: the enforcer caps the
// admissible level for a critical action at A7 and ALWAYS requires a human escalation. A8 on
// a critical action is a category error the gate refuses structurally, not a tunable.
//
// FAIL-CLOSED ENFORCEMENT (the wall §2/§8). Enforce compares the action's REQUIRED level to
// the agent's DECLARED level: required ≤ declared admits, required > declared REFUSES with
// the S13 BlockReason AGENT_AUTONOMY_EXCEEDED. The autonomy is never self-widened below the
// line — the only door to a higher level is the PROMOTION computed from history, frozen above
// the line via idea → mirror → /goal. Enforce reads the declared level as a CEILING, never a
// grant the agent can raise.
//
// PROMOTION = PURE FUNCTION OF HISTORY (FKE-34 done-criterion: "la promotion est une fonction
// pure de l'historique ; jamais déclarée"). PromotionFromHistory(current, runs, policy)
// returns the highest level the AgentRun history EARNS: the current level + 1 IFF the last N
// runs are ALL green at evidence ≥ E4 with NO incident (and the +1 never crosses a critical
// ceiling). It is the §8 anti-Goodhart shape: the level is COMPUTED from the record, never
// declared — an agent cannot promote itself by asserting confidence.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Validate, Enforce and PromotionFromHistory are PURE,
// TOTAL functions — no DB, no clock, no rng, no I/O, no LLM. Same input ⇒ same verdict / same
// promoted level (the reproducibility property mirror pins both). The promotion is
// authoritative CODE; an agent never enters this loop. THE WALL: this package writes NOTHING
// above the waterline — it reads a declared level + a run history (below-the-line telemetry)
// and returns a verdict / a proposed level; freezing a promotion is /goal's job.
package autonomy

import (
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Level is one rung of the closed autonomy ladder A0..A8. It is an int so the ladder is
// directly ordered (required ≤ declared is a numeric compare) — but the closed set is
// re-asserted by IsKnownLevel: a value outside [0,8] is invalid (fail-closed).
type Level int

const (
	// A0 — propose-only (the most confined: read / propose, the wall's structural default).
	A0 Level = 0
	// A1 — a single low-risk below-the-line write.
	A1 Level = 1
	// A2 — multi-write within the declared scope.
	A2 Level = 2
	// A3 — below-the-line ops (archive / projections).
	A3 Level = 3
	// A4 — mirror-proposing runs.
	A4 Level = 4
	// A5 — cross-cell runs.
	A5 Level = 5
	// A6 — merge / integration (a CRITICAL action — never A8).
	A6 Level = 6
	// A7 — release / deploy (a CRITICAL action — the ceiling for critical actions).
	A7 Level = 7
	// A8 — fully autonomous (NEVER admitted on a critical action, FKE-11/34).
	A8 Level = 8
)

// levelOrder is the canonical A0→A8 enumeration order. Declared, never derived from map
// iteration, so Levels() and every projection are stable.
var levelOrder = []Level{A0, A1, A2, A3, A4, A5, A6, A7, A8}

// Levels returns the nine closed autonomy rungs in canonical A0→A8 order, so the Workbench
// ladder and any projection never invent a rung.
func Levels() []Level {
	out := make([]Level, len(levelOrder))
	copy(out, levelOrder)
	return out
}

// IsKnownLevel reports whether l is a member of the closed ladder A0..A8. The set is closed:
// any other value makes Validate / Enforce fail-closed.
func IsKnownLevel(l Level) bool {
	return l >= A0 && l <= A8
}

// String renders a level as its canonical "A<n>" label (A0..A8); an out-of-range level
// renders "A?" (fail-closed, never a fabricated rung).
func (l Level) String() string {
	if !IsKnownLevel(l) {
		return "A?"
	}
	return fmt.Sprintf("A%d", int(l))
}

// CriticalCeiling is the highest autonomy level a CRITICAL action may ever require/admit
// (FKE-11/34 "A8 jamais sur action critique"): A7. A8 on a critical action is refused
// structurally — it is not a tunable. A non-critical action's ceiling is A8.
const CriticalCeiling = A7

// Validation errors.
var (
	// ErrUnknownLevel — a declared level is outside the closed ladder A0..A8.
	ErrUnknownLevel = errors.New("autonomy: unknown level (not A0..A8)")
	// ErrA8OnCritical — a declared level of A8 is paired with a critical capability claim
	// (a structural category error: A8 never governs a critical action, FKE-11/34).
	ErrA8OnCritical = errors.New("autonomy: A8 is never admissible on a critical action")
)

// Validate is the PURE shape guard of a declared autonomy level: it must be a member of the
// closed ladder A0..A8. The set is closed and fail-closed — an out-of-range level is invalid.
// Pure, total, no clock/rng/I/O.
func Validate(declared Level) error {
	if !IsKnownLevel(declared) {
		return fmt.Errorf("%w: %d", ErrUnknownLevel, int(declared))
	}
	return nil
}

// Action is the autonomy demand of one attempted action: the level it REQUIRES and whether
// it is CRITICAL (a merge / deploy / irreversible truth write). Both are DECLARED on the
// action's kind, never inferred from an LLM. Required is the minimum level the action needs.
type Action struct {
	Name     string `json:"name"`     // human label (e.g. "merge", "read", "deploy")
	Required Level  `json:"required"` // the minimum autonomy level the action needs
	Critical bool   `json:"critical"` // a merge / deploy / irreversible truth write?
}

// Decision is Enforce's verdict: admitted or refused, with the S13 BlockReason on a refusal.
// There are exactly two outcomes (the property mirror pins this).
type Decision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// Enforce is the PURE, FAIL-CLOSED autonomy gate (FKE-11/34). It admits an action IFF:
//   - the declared level is a valid member of the closed ladder A0..A8 (else REFUSED); and
//   - the action's required level is itself a valid rung (an out-of-ladder requirement is
//     refused fail-closed); and
//   - for a CRITICAL action, the required level does NOT exceed the CriticalCeiling A7 (A8
//     never governs a critical action — refused structurally); and
//   - the required level is ≤ the declared level (required > declared ⇒ REFUSED).
//
// Every refusal carries the S13 BlockReason AGENT_AUTONOMY_EXCEEDED — the door out names the
// promotion path (earn it from history, freeze it via /goal), never a self-widening toggle.
// The declared level is read as a CEILING, never a grant the agent raises. Pure, total,
// deterministic — same (declared, action) ⇒ same verdict (the property mirror pins it).
func Enforce(declared Level, action Action) Decision {
	if !IsKnownLevel(declared) || !IsKnownLevel(action.Required) {
		return refuse()
	}
	// A8 never governs a critical action: the admissible requirement is capped at A7.
	if action.Critical && action.Required > CriticalCeiling {
		return refuse()
	}
	// A declared A8 cannot satisfy a critical action either — a critical action demands a
	// human escalation, so even a fully-autonomous agent is held to the A7 ceiling.
	effectiveDeclared := declared
	if action.Critical && effectiveDeclared > CriticalCeiling {
		effectiveDeclared = CriticalCeiling
	}
	if action.Required > effectiveDeclared {
		return refuse()
	}
	return Decision{Allowed: true}
}

func refuse() Decision {
	br := blockreason.For(blockreason.CodeAgentAutonomyExceeded)
	return Decision{Allowed: false, BlockReason: &br}
}

// PromotionPolicy declares the bar a promotion must clear — DECLARED above the line, never
// learned (§8). MinGreenRuns is N (the count of consecutive green runs required); MinEvidence
// is the floor evidence level (FKE-34: "E4+"). Both are part of the governed layer.
type PromotionPolicy struct {
	MinGreenRuns int              `json:"min_green_runs"` // N consecutive green runs required (≥ 1)
	MinEvidence  prooftype.ELevel `json:"min_evidence"`   // the evidence floor (E4 by default, FKE-34)
}

// DefaultPolicy is the FKE-34 promotion bar: N=3 consecutive green runs at evidence ≥ E4 with
// no incident. Declared here, above the line; a step may tighten it via /goal, never loosen it
// silently.
var DefaultPolicy = PromotionPolicy{MinGreenRuns: 3, MinEvidence: prooftype.E4}

// RunOutcome is the autonomy-relevant projection of one AgentRun: did it end GREEN, at what
// evidence level, and did it carry an INCIDENT? It is DERIVED from the below-the-line
// AgentRun telemetry (agentrun.AgentRun) by OutcomeOf — autonomy reads runs, it never forks
// the run record.
type RunOutcome struct {
	Green    bool             `json:"green"`    // run.Result == green
	Evidence prooftype.ELevel `json:"evidence"` // the evidence level the run reached
	Incident bool             `json:"incident"` // an incident was recorded against the run
}

// OutcomeOf projects an AgentRun + its reached evidence + its incident flag into a RunOutcome.
// The Green bit is DERIVED from the run's closed Result (only agentrun.ResultGreen counts);
// the evidence and incident are SUPPLIED (they live alongside the run, not inside its hash).
// Pure, total — same inputs ⇒ same outcome.
func OutcomeOf(run agentrun.AgentRun, evidence prooftype.ELevel, incident bool) RunOutcome {
	return RunOutcome{
		Green:    run.Result == agentrun.ResultGreen,
		Evidence: evidence,
		Incident: incident,
	}
}

// PromotionFromHistory is the PURE promotion function (FKE-34 done-criterion: "la promotion
// est une fonction pure de l'historique ; jamais déclarée"). Given the current level, the run
// history (oldest→newest) and the declared policy, it returns the highest level the history
// EARNS:
//   - if current is not a valid rung, or already A8, it returns current UNCHANGED (no
//     promotion past the top, fail-closed on an invalid input);
//   - it inspects the LAST policy.MinGreenRuns runs: promotion is earned IFF there are at
//     least N runs AND every one of those N is green at evidence ≥ policy.MinEvidence with NO
//     incident; a single non-green / below-evidence / incident run in the window withholds it;
//   - an earned promotion is current + 1, and NEVER past A8.
//
// The level is COMPUTED from the record — an agent cannot promote itself by asserting
// confidence (§8 anti-Goodhart). Pure, total, deterministic: same (current, history, policy)
// ⇒ same level (the property mirror pins it). It RETURNS a proposed level; freezing it stays
// /goal's job (the wall §2).
func PromotionFromHistory(current Level, history []RunOutcome, policy PromotionPolicy) Level {
	if !IsKnownLevel(current) || current >= A8 {
		return current
	}
	n := policy.MinGreenRuns
	if n < 1 {
		// A non-positive bar would promote on an empty record — fail-closed: require ≥ 1.
		n = 1
	}
	if len(history) < n {
		return current
	}
	window := history[len(history)-n:]
	for _, o := range window {
		if !o.Green || o.Evidence < policy.MinEvidence || o.Incident {
			return current
		}
	}
	return current + 1
}
