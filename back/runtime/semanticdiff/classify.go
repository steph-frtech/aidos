package semanticdiff

import (
	"encoding/json"
	"reflect"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// classify.go holds the per-nature predicates Classify dispatches on. Each is a PURE
// function over the two decoded bodies (no I/O, no clock, no rng, never panics). They
// read the EXISTING kernel field shapes (S02 records / S15 scope / KRD §96 composes
// weight / S08 Expr enabled_when / S—lifecycle status) — they invent no field.
//
// The bodies are generic maps (decoded JSON) so Classify is total over any kernel
// artifact; a missing/typed-wrong field simply makes the predicate false (never a
// crash). Equality of nested values reuses reflect.DeepEqual over the decoded JSON
// value space (the same comparison records.Canonicalize would yield, modulo key order
// — and key order is irrelevant under DeepEqual on maps).

// lifecycleStatuses is the closed §44.2 TruthLifecycle status set (mirrors
// kernel/scope.LifecycleStatus, the single owner; not re-typed here as an enum, only
// recognized). "active" is the live status; the other three are dead-by-succession.
var deadStatuses = map[string]bool{
	"deprecated": true,
	"shadowed":   true,
	"removed":    true,
}

// statusOf reads the lifecycle status from a body, checking both a top-level "status"
// and a nested "lifecycle" field (the spec fixtures write `{ lifecycle: deprecated }`
// and the scope substrate writes `{ status: active }`). Returns "" when absent.
func statusOf(m map[string]any) string {
	if s, ok := m["lifecycle"].(string); ok {
		return s
	}
	if s, ok := m["status"].(string); ok {
		return s
	}
	return ""
}

// withoutKeys returns a shallow copy of m with the given keys removed — used to compare
// "everything else equal" while ignoring the dimension under test (status / scope /
// weight). Pure; never mutates m.
func withoutKeys(m map[string]any, keys ...string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	for _, k := range keys {
		delete(out, k)
	}
	return out
}

// bodyEqualExcept reports whether old and new are equal once the given keys are removed
// from BOTH — i.e. they differ ONLY (at most) in those keys. The remaining structure is
// compared via canonical JSON equality (the S02 scheme), so key order is irrelevant.
func bodyEqualExcept(old, new map[string]any, keys ...string) bool {
	return canonEqual(withoutKeys(old, keys...), withoutKeys(new, keys...))
}

// canonEqual reports whether two decoded JSON values are canonically equal: it re-marshals
// each and compares the S02 canonical form (records.Canonicalize), so {a,b} == {b,a}. On a
// marshal error it falls back to reflect.DeepEqual (never panics).
func canonEqual(a, b any) bool {
	ab, errA := json.Marshal(a)
	bb, errB := json.Marshal(b)
	if errA != nil || errB != nil {
		return reflect.DeepEqual(a, b)
	}
	ac, errA := records.Canonicalize(ab)
	bc, errB := records.Canonicalize(bb)
	if errA != nil || errB != nil {
		return reflect.DeepEqual(a, b)
	}
	return string(ac) == string(bc)
}

// isDeprecation reports the §44.2 deprecate nature: the lifecycle status moves from a live
// value (active or absent) to a dead one (deprecated/shadowed/removed), and the body is
// OTHERWISE unchanged (the rule did not change — only its lifecycle stamp did).
func isDeprecation(old, new map[string]any) bool {
	oldStatus := statusOf(old)
	newStatus := statusOf(new)
	if !deadStatuses[newStatus] {
		return false // new is not a dead status — not a deprecation
	}
	if deadStatuses[oldStatus] {
		return false // already dead — no live→dead transition
	}
	// The body must be otherwise unchanged: strip BOTH the status and the lifecycle keys
	// from each side and require equality (a deprecate changes only the lifecycle stamp).
	return bodyEqualExcept(old, new, "status", "lifecycle")
}

// scopeOf returns the "scope" sub-value (the S15 TruthScope), or nil when absent.
func scopeOf(m map[string]any) any { return m["scope"] }

// isScopeOnlyChange reports the §44.1 rescope nature (S15): the "scope" value CHANGED and
// the rest of the body is unchanged. THE done criterion: a scope change is a rescope, NOT
// an override. A scope appearing/disappearing also counts (a scope move), as long as the
// body is otherwise equal.
func isScopeOnlyChange(old, new map[string]any) bool {
	oldScope := scopeOf(old)
	newScope := scopeOf(new)
	if canonEqual(oldScope, newScope) {
		return false // scope did not change
	}
	if !hasScopeKey(old) && !hasScopeKey(new) {
		return false // neither side carries a scope dimension
	}
	return bodyEqualExcept(old, new, "scope")
}

func hasScopeKey(m map[string]any) bool {
	_, ok := m["scope"]
	return ok
}

// weightOf returns the composes "weight" value (KRD §96 {cosmetic, load-bearing}), or nil.
func weightOf(m map[string]any) any { return m["weight"] }

// isWeightOnlyChange reports the §96 reweight nature: the composes-edge "weight" CHANGED and
// the rest of the body (parent/child refs, link kind) is unchanged. THE done criterion:
// cosmetic→load-bearing is a reweight — a re-qualification of importance, distinct from
// changing the rule. Requires BOTH sides to carry a weight (a composes edge).
func isWeightOnlyChange(old, new map[string]any) bool {
	ow, ok1 := old["weight"]
	nw, ok2 := new["weight"]
	if !ok1 || !ok2 {
		return false // not a weighted (composes) edge on both sides
	}
	if canonEqual(ow, nw) {
		return false // weight unchanged
	}
	return bodyEqualExcept(old, new, "weight")
}

// enabledWhenOf returns the "enabled_when" Expr sub-value on a control body, or nil.
func enabledWhenOf(m map[string]any) any { return m["enabled_when"] }

// isEnabledWhenOverride reports the §11/§12 override nature — THE done criterion: the same
// control's "enabled_when" CHANGED to a condition NOT IMPLIED by the old one (an
// incompatible condition is a revoked promise). Implication in general is undecidable;
// here it is the DECIDABLE conservative subset: new is implied by old ⇔ they are
// canonically equal. Any other enabled_when change is "not implied" ⇒ override. This is
// honest (no fabricated theorem prover): an identical enabled_when is not a change at all
// (caught upstream by the rescope/refine/none paths), so reaching here with a changed
// enabled_when on the same control IS an override.
func isEnabledWhenOverride(old, new map[string]any) bool {
	oe, ok1 := old["enabled_when"]
	ne, ok2 := new["enabled_when"]
	if !ok1 || !ok2 {
		return false // not a control with an enabled_when on both sides
	}
	if canonEqual(oe, ne) {
		return false // enabled_when unchanged — not an override
	}
	// The change is concentrated on enabled_when (the rest of the control unchanged):
	// a changed enabled_when, not implied by the old one (conservative: ≠), is an override.
	return bodyEqualExcept(old, new, "enabled_when")
}

// isRefinement reports the §11 refine nature: new is a strict SUPERSET of old's fields —
// it ADDS at least one constraint key — while every field old already carries is unchanged
// (a stricter constraint that does not contradict the old one). This is the "consistent
// narrowing" case (e.g. a policy gaining a `deny_after` while keeping its `allow`).
func isRefinement(old, new map[string]any) bool {
	addedKey := false
	for k := range new {
		if _, present := old[k]; !present {
			addedKey = true
		}
	}
	if !addedKey {
		return false // new added nothing — not a narrowing
	}
	// Every key the old body carries must be present and UNCHANGED in new (no contradiction).
	for k, ov := range old {
		nv, present := new[k]
		if !present || !canonEqual(ov, nv) {
			return false // an existing constraint was changed/removed — not a clean refinement
		}
	}
	return true
}
