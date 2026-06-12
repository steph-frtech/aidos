// Package scope is the pure value object + guard of KRD §13.7 "TruthScope —
// aucune vérité n'est universelle par défaut".
//
// A TruthScope is ONE of the four truth QUALIFIERS (KRD §13.6: truth_kind /
// TruthScope / VerifiabilityLevel / AuthorityGraph) — it qualifies a Kernel truth,
// it is NOT a truth itself. It answers WHERE / WHEN / FOR-WHOM a truth holds:
// region, tenant, target, time_window, user_segment, environment. KRD §13.7's rule:
//
//	"Une vérité sans scope est suspecte. Une décision réutilisée hors scope est une
//	 hallucination structurelle." → aucune vérité n'est universelle par défaut.
//
// This package lands the typed scope shape (verbatim §13.7), a named IsGlobal escape
// hatch (region == "*", a DELIBERATE universal, never the implicit default), and the
// PURE guard Validate(record): an ACTIVE truth (TruthLifecycle §44.2) whose scope is
// absent/empty and not explicitly global is REJECTED ("active truth without a scope");
// any other case passes. The rule binds ACTIVE truths only — an idea/deprecated/
// shadowed/removed truth may be scope-less.
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. The record's
// active-status is READ from the record handed in, never fetched. READ-ONLY against
// truth; it writes nothing (the wall, CLAUDE.md §2). ABOVE the waterline (the scope
// RULE is the human's, KRD §13.7); this step only ENFORCES it. The value object is
// INTERPRETED in Go (the frozen slot) — it is NOT compiled or emitted here, and NOT
// yet wired into Policy/Operation evaluation, the ContextRouter, or DataTruthScope.
package scope

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Region is the geographic scope of a truth — exactly the four members of KRD §13.7
// (FR | EU | US | "*"). RegionGlobal ("*") is the EXPLICIT universal: the only way a
// truth is universal is to say so. The empty string is "absent" (a not-yet-scoped idea).
type Region string

const (
	// RegionFR — France.
	RegionFR Region = "FR"
	// RegionEU — European Union.
	RegionEU Region = "EU"
	// RegionUS — United States.
	RegionUS Region = "US"
	// RegionGlobal — the EXPLICIT global escape hatch (KRD §13.7 "*"). Never implicit.
	RegionGlobal Region = "*"
)

var regionOrder = []Region{RegionFR, RegionEU, RegionUS, RegionGlobal}

// Regions returns the four KRD §13.7 regions (incl. the explicit global "*") in order.
func Regions() []Region {
	out := make([]Region, len(regionOrder))
	copy(out, regionOrder)
	return out
}

// IsKnownRegion reports whether r is one of the four §13.7 regions. The empty region
// is NOT known (it is the absent case).
func IsKnownRegion(r Region) bool { return contains(regionOrder, r) }

// Target is the delivery surface a truth holds on — exactly the five §13.7 members.
type Target string

const (
	TargetWeb    Target = "web"
	TargetMobile Target = "mobile"
	TargetVoice  Target = "voice"
	TargetXR     Target = "xr"
	TargetIoT    Target = "iot"
)

var targetOrder = []Target{TargetWeb, TargetMobile, TargetVoice, TargetXR, TargetIoT}

// Targets returns the five KRD §13.7 targets in canonical order.
func Targets() []Target {
	out := make([]Target, len(targetOrder))
	copy(out, targetOrder)
	return out
}

// IsKnownTarget reports whether t is one of the five §13.7 targets (empty is allowed
// as "unspecified" by ValidateShape, but is not a known member).
func IsKnownTarget(t Target) bool { return contains(targetOrder, t) }

// UserSegment is the audience a truth holds for — exactly the three §13.7 members.
type UserSegment string

const (
	SegmentPremium  UserSegment = "premium"
	SegmentStandard UserSegment = "standard"
	SegmentGuest    UserSegment = "guest"
)

var segmentOrder = []UserSegment{SegmentPremium, SegmentStandard, SegmentGuest}

// UserSegments returns the three KRD §13.7 user segments in canonical order.
func UserSegments() []UserSegment {
	out := make([]UserSegment, len(segmentOrder))
	copy(out, segmentOrder)
	return out
}

// IsKnownSegment reports whether s is one of the three §13.7 segments.
func IsKnownSegment(s UserSegment) bool { return contains(segmentOrder, s) }

// Environment is the deployment environment a truth holds in — the CLOSED
// five-member set: the three §13.7 members (prod, staging, dev) plus the two
// DP06 additions (local, future_cloud) — an ADDITIVE widening graven by
// ADR 0065 (Amendement A6, authority = SPEC-stack-2026 verbatim:
// "stack{environments local/dev/staging/prod/future_cloud, …}"). The S15 trio
// stays the canonical-order PREFIX; the new members are APPENDED — the
// SemanticDiff of the widening classifies refine, never override (proved in
// back/runtime/envbindings/semanticdiff_additivity_test.go).
type Environment string

const (
	EnvProd    Environment = "prod"
	EnvStaging Environment = "staging"
	EnvDev     Environment = "dev"
	// EnvLocal — the developer's machine (DP06, ADR 0065). ADDED additively.
	EnvLocal Environment = "local"
	// EnvFutureCloud — the managed-cloud portability target (DP06/EPIC G,
	// ADR 0065). Declared NOW for portability; its bindings are managed-only.
	EnvFutureCloud Environment = "future_cloud"
)

var environmentOrder = []Environment{EnvProd, EnvStaging, EnvDev, EnvLocal, EnvFutureCloud}

// Environments returns the five environments (3× KRD §13.7 + 2× DP06/ADR 0065)
// in canonical order — the S15 prefix preserved, the DP06 members appended.
func Environments() []Environment {
	out := make([]Environment, len(environmentOrder))
	copy(out, environmentOrder)
	return out
}

// IsKnownEnvironment reports whether e is one of the five closed environments.
func IsKnownEnvironment(e Environment) bool { return contains(environmentOrder, e) }

// TimeWindow is the §13.7 validity window of a truth (from/to). Both bounds are
// OPAQUE strings here: §13.7 leaves the temporal type as "..." and this step does not
// pin a calendar/clock semantics (that is a later tooth — the temporal/§44.x work).
// An empty window means "no temporal bound" (always-on within its other dimensions),
// NOT "no scope" — the active-truth rule is about the scope as a whole, via IsEmpty.
type TimeWindow struct {
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
}

// IsZero reports whether the window has neither bound set.
func (w TimeWindow) IsZero() bool { return w.From == "" && w.To == "" }

// TruthScope is the §13.7 "where/when/for-whom" qualifier on a Kernel truth — the six
// dimensions verbatim. It is a value object (content-addressed inside the truth body),
// not a record of its own. The zero value is the ABSENT scope (a not-yet-scoped idea).
type TruthScope struct {
	Region      Region      `json:"region,omitempty"`
	Tenant      string      `json:"tenant,omitempty"`
	Target      Target      `json:"target,omitempty"`
	TimeWindow  TimeWindow  `json:"time_window,omitempty"`
	UserSegment UserSegment `json:"user_segment,omitempty"`
	Environment Environment `json:"environment,omitempty"`
}

// IsEmpty reports whether the scope carries NO dimension at all — the absent scope.
// A scope with any dimension set (even just a tenant or an environment) is non-empty.
// This is the predicate the active-truth rule tests: "scope absent/empty".
func (s TruthScope) IsEmpty() bool {
	return s.Region == "" &&
		s.Tenant == "" &&
		s.Target == "" &&
		s.TimeWindow.IsZero() &&
		s.UserSegment == "" &&
		s.Environment == ""
}

// IsEmpty is the package-level form (mirrors the front projection's isEmpty).
func IsEmpty(s TruthScope) bool { return s.IsEmpty() }

// IsGlobal reports whether the scope is the EXPLICIT global "*" (KRD §13.7). This is a
// NAMED, deliberate predicate — global is NEVER implicit: a nil/empty scope is NOT
// global (IsGlobal(TruthScope{}) == false). IsGlobal(scope) ⇔ scope.Region == "*".
func IsGlobal(s TruthScope) bool { return s.Region == RegionGlobal }

// LifecycleStatus is the TruthLifecycle status (KRD §44.2) — exactly the four members.
// The active-truth scope rule binds StatusActive only.
type LifecycleStatus string

const (
	// StatusActive — the truth is live for the product; the scope rule binds it.
	StatusActive LifecycleStatus = "active"
	// StatusDeprecated — kept for audit/compat; not subject to the scope rule.
	StatusDeprecated LifecycleStatus = "deprecated"
	// StatusShadowed — superseded but still observed; not subject to the rule.
	StatusShadowed LifecycleStatus = "shadowed"
	// StatusRemoved — retired; not subject to the rule.
	StatusRemoved LifecycleStatus = "removed"
)

var statusOrder = []LifecycleStatus{StatusActive, StatusDeprecated, StatusShadowed, StatusRemoved}

// Statuses returns the four KRD §44.2 lifecycle statuses in canonical order.
func Statuses() []LifecycleStatus {
	out := make([]LifecycleStatus, len(statusOrder))
	copy(out, statusOrder)
	return out
}

// IsKnownStatus reports whether s is one of the four §44.2 statuses.
func IsKnownStatus(s LifecycleStatus) bool { return contains(statusOrder, s) }

// Record is the minimal projection of a kernel Truth this guard reads: its lifecycle
// status and its TruthScope qualifier. It is NOT the full records.Record (which is
// content-addressed JSONB); the guard is pure and only needs these two, which the
// migration adds (scope jsonb) / which TruthLifecycle owns (status). The active-status
// is READ from this value, never fetched.
type Record struct {
	Status LifecycleStatus `json:"status"`
	Scope  TruthScope      `json:"scope"`
}

// RejectedError is the typed refusal of the active-truth rule: an ACTIVE truth without
// a scope (and not explicitly global). It names the door (a BlockReason-style code),
// never a prison. Code is the S15-local kebab-case code, surfaced verbatim by the UI.
type RejectedError struct {
	// Code is the refusal code (the only S15 case: "active-truth-without-scope").
	Code string
	// Message is the human-readable explanation.
	Message string
}

func (e *RejectedError) Error() string { return e.Message }

// CodeActiveTruthWithoutScope is the S15-local refusal code (KRD §13.7). It is NOT a
// member of the frozen runtime/blockreason.Code enum (CLAUDE.md §9 forbids inventing
// members there); it is the kebab-case code the /scopes panel surfaces.
const CodeActiveTruthWithoutScope = "active-truth-without-scope"

// ErrActiveTruthWithoutScope is the sentinel a RejectedError wraps for errors.Is.
var ErrActiveTruthWithoutScope = errors.New("scope: active truth without a scope")

// AsRejected reports whether err is (or wraps) a *RejectedError and, if target is
// non-nil, stores it. A thin wrapper over errors.As so callers (and the mirror) need
// not import errors.
func AsRejected(err error, target **RejectedError) bool {
	return errors.As(err, target)
}

// Validate is the PURE guard of KRD §13.7's rule over a truth Record:
//
//	status == active  ∧  scope absent/empty  ∧  ¬IsGlobal   ⇒  REJECTED
//	("active truth without a scope" — a truth must declare where/when/for-whom it holds,
//	 the only universal being the explicit global "*").
//	otherwise (non-active, OR explicitly global, OR a present non-empty scope) ⇒ nil.
//
// It also rejects a malformed scope shape (an out-of-enum field) on an active truth via
// ValidateShape, so the guard never silently admits an unknown region/target/segment/env.
// Pure: no DB, no clock, no I/O. Same record ⇒ same verdict (the property mirror pins it).
func Validate(r Record) error {
	// The rule binds ACTIVE truths only (KRD §44.2). A non-active record passes.
	if r.Status != StatusActive {
		return nil
	}
	// An explicit global scope is the deliberate universal: it passes.
	if IsGlobal(r.Scope) {
		return nil
	}
	// An active truth with no scope at all is the structural-hallucination risk: reject.
	if r.Scope.IsEmpty() {
		return &RejectedError{
			Code:    CodeActiveTruthWithoutScope,
			Message: fmt.Sprintf("%v: an active truth must carry a TruthScope (region/target/segment/env/time_window) or be explicitly global (region \"*\")", ErrActiveTruthWithoutScope),
		}
	}
	// A present scope must still be well-formed (no out-of-enum field).
	return ValidateShape(r.Scope)
}

// ValidateShape checks a scope's field validity against the §13.7 enums, ignoring
// empty (unspecified) dimensions. An empty scope passes the shape check (it is the
// active-truth rule, not this, that rejects an empty scope on an active truth).
func ValidateShape(s TruthScope) error {
	if s.Region != "" && !IsKnownRegion(s.Region) {
		return fmt.Errorf("scope: unknown region %q (want FR|EU|US|*)", s.Region)
	}
	if s.Target != "" && !IsKnownTarget(s.Target) {
		return fmt.Errorf("scope: unknown target %q (want web|mobile|voice|xr|iot)", s.Target)
	}
	if s.UserSegment != "" && !IsKnownSegment(s.UserSegment) {
		return fmt.Errorf("scope: unknown user_segment %q (want premium|standard|guest)", s.UserSegment)
	}
	if s.Environment != "" && !IsKnownEnvironment(s.Environment) {
		return fmt.Errorf("scope: unknown environment %q (want prod|staging|dev|local|future_cloud)", s.Environment)
	}
	return nil
}

// SerializeTruthBody renders a minimal kernel.truth body carrying the scope, so the
// scope rides INSIDE the content-addressed body (S02 substrate): a body produced here
// round-trips through records.NewRecord as id == version == Hash(Canonicalize(body)),
// and changing the scope yields a different version (a new row, never an in-place
// mutation — KRD §44.1 rescope). The "kind":"truth" discriminator matches records.Validate.
func SerializeTruthBody(s TruthScope) ([]byte, error) {
	body := map[string]any{
		"kind":  string(records.KindTruth),
		"scope": s,
	}
	return json.Marshal(body)
}

func contains[T comparable](xs []T, x T) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
