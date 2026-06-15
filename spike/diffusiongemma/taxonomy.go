// taxonomy.go — THROWAWAY (DG01 spike). The CLOSED requirement-type taxonomy + the PURE extractor
// that maps an LLM output to the SET of requirement TYPES it surfaces. This is the determinism-first
// heart of the spike: the metric (DG03's CompletenessReport) is a COUNT of TYPES, never a quality
// judgement of generated code (§8 forbids an LLM judgement hoisted to truth). The extractor is a
// pure function (same text -> same set of types), so the whole measurement is reproducible.
package diffusiongemma

import (
	"sort"
	"strings"
)

// RequirementKind is ONE atomic type of requirement a recompile-from-specs must cover. The set is
// CLOSED and DECLARED (above the line, §8 — not learned): it is grounded in the AIDOS verticale
// (S11 control-spec: view/control/action; S35 entity-source; the operation/invariant/policy rungs),
// each split into the FACETS a spec can carry and an LLM can independently surface. The differential
// question is purely: |types(A) ∪ types(B)| vs |types(single)| over THIS closed set.
type RequirementKind string

const (
	// View / screen facets (S11 view-spec: goal, zones, displayed data).
	KindViewGoal       RequirementKind = "view.goal"        // the screen's reason-to-exist
	KindViewZone       RequirementKind = "view.zone"        // a layout zone (header/list/detail/footer)
	KindViewData       RequirementKind = "view.displayed"   // a displayed data field on screen
	KindViewEmptyState RequirementKind = "view.empty_state" // the empty/zero-state of a list

	// Control facets (S11 control-spec: label/visible_when/enabled_when/triggers).
	KindControl        RequirementKind = "control.exists"       // a button/control exists
	KindControlVisible RequirementKind = "control.visible_when" // visibility rule (an Expr)
	KindControlEnabled RequirementKind = "control.enabled_when" // enabled rule (an Expr)
	KindControlTrigger RequirementKind = "control.triggers"     // control -> action bind

	// Action facets (S11 action-spec: invoke/on_success/on_error).
	KindActionInvoke    RequirementKind = "action.invoke"     // invokes an operation
	KindActionOnSuccess RequirementKind = "action.on_success" // success effect (navigate/toast)
	KindActionOnError   RequirementKind = "action.on_error"   // error effect

	// Operation facets (the workflow rung: command -> events).
	KindOperation      RequirementKind = "operation.exists" // an operation/command exists
	KindOperationEvent RequirementKind = "operation.event"  // an emitted domain event
	KindOperationGuard RequirementKind = "operation.guard"  // a precondition/validation guard

	// Entity / contract facets (S35 entity-source).
	KindEntity      RequirementKind = "entity.exists"   // an entity/aggregate
	KindEntityField RequirementKind = "entity.field"    // a typed field on an entity
	KindEntityRel   RequirementKind = "entity.relation" // a relation between entities

	// Cross-cutting truth facets — the ones a single happy-path recompile most often MISSES.
	KindInvariant RequirementKind = "invariant.forall" // a ∀ invariant ("true on all paths")
	KindPolicy    RequirementKind = "policy.authz"     // an authorization policy
	KindBudget    RequirementKind = "budget.perf_sec"  // a perf/security budget
	KindErrorCase RequirementKind = "case.error"       // an error / failure case
	KindEdgeCase  RequirementKind = "case.edge"        // an edge / boundary case
)

// AllKinds is the CLOSED taxonomy, in a fixed (deterministic) order. The "expected" set for a spec
// is a subset of this; coverage is measured against that expected set, never against this whole list.
func AllKinds() []RequirementKind {
	return []RequirementKind{
		KindViewGoal, KindViewZone, KindViewData, KindViewEmptyState,
		KindControl, KindControlVisible, KindControlEnabled, KindControlTrigger,
		KindActionInvoke, KindActionOnSuccess, KindActionOnError,
		KindOperation, KindOperationEvent, KindOperationGuard,
		KindEntity, KindEntityField, KindEntityRel,
		KindInvariant, KindPolicy, KindBudget, KindErrorCase, KindEdgeCase,
	}
}

// kindMarkers maps each requirement kind to the deterministic, case-insensitive substrings that, if
// present in an LLM output line, signal that the output SURFACED that requirement type. These are
// the parser's closed vocabulary — NOT a model: the extractor is a pure string match (determinism-
// first; a "diff is a diff", a parse is a parse, never an LLM judging an LLM). An output is modeled
// as plain text (Markdown-ish requirement notes) because that is what a generation model emits and
// what a recompile would or would not also produce.
func kindMarkers() map[RequirementKind][]string {
	return map[RequirementKind][]string{
		KindViewGoal:        {"view goal:", "screen goal:", "but de l'écran"},
		KindViewZone:        {"zone:", "layout zone", "header zone", "footer zone", "detail zone"},
		KindViewData:        {"displays field", "displayed:", "shows field", "affiche le champ"},
		KindViewEmptyState:  {"empty state", "empty-state", "zero state", "état vide", "no items"},
		KindControl:         {"control:", "button:", "bouton:"},
		KindControlVisible:  {"visible_when", "visible when", "visibilité"},
		KindControlEnabled:  {"enabled_when", "enabled when", "disabled when", "grisé quand"},
		KindControlTrigger:  {"triggers action", "triggers:", "déclenche l'action"},
		KindActionInvoke:    {"invoke operation", "invokes operation", "invoke:", "appelle l'opération"},
		KindActionOnSuccess: {"on_success", "on success", "en cas de succès"},
		KindActionOnError:   {"on_error", "on error", "en cas d'erreur"},
		KindOperation:       {"operation:", "command:", "opération:"},
		KindOperationEvent:  {"emits event", "event:", "émet l'événement"},
		KindOperationGuard:  {"guard:", "precondition", "validates that", "valide que"},
		KindEntity:          {"entity:", "aggregate:", "entité:"},
		KindEntityField:     {"field:", "champ:", "attribute:"},
		KindEntityRel:       {"relation:", "references entity", "belongs to", "has many"},
		KindInvariant:       {"invariant:", "for all", "∀", "must always", "doit toujours", "never negative", "jamais négatif"},
		KindPolicy:          {"policy:", "authorization", "only the owner", "permission", "seul le propriétaire"},
		KindBudget:          {"budget:", "must respond within", "p95", "rate limit", "latency budget"},
		KindErrorCase:       {"error case:", "on failure", "rejected when", "rejeté quand", "out of stock", "rupture de stock"},
		KindEdgeCase:        {"edge case:", "boundary:", "when empty", "maximum", "overflow", "cas limite"},
	}
}

// Extract maps an LLM output (plain text) to the SET of requirement TYPES it surfaces. PURE and
// DETERMINISTIC: lower-cases, scans each line against the closed marker vocabulary, returns a sorted
// de-duplicated slice. No LLM, no clock, no rng. This is the function the real DG03 metric would
// re-run over EVERY candidate output (LLM_A, LLM_B, recompile) so the model's output is always
// re-judged by deterministic code (§8 — the judge is deterministic).
func Extract(output string) []RequirementKind {
	lower := strings.ToLower(output)
	markers := kindMarkers()
	seen := map[RequirementKind]bool{}
	for _, k := range AllKinds() {
		for _, m := range markers[k] {
			if strings.Contains(lower, strings.ToLower(m)) {
				seen[k] = true
				break
			}
		}
	}
	out := make([]RequirementKind, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// asSet is a tiny helper turning a slice of kinds into a set for union/diff math.
func asSet(ks []RequirementKind) map[RequirementKind]bool {
	s := make(map[RequirementKind]bool, len(ks))
	for _, k := range ks {
		s[k] = true
	}
	return s
}

// union returns the de-duplicated, sorted union of several kind-sets.
func union(sets ...[]RequirementKind) []RequirementKind {
	s := map[RequirementKind]bool{}
	for _, ks := range sets {
		for _, k := range ks {
			s[k] = true
		}
	}
	out := make([]RequirementKind, 0, len(s))
	for k := range s {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}
