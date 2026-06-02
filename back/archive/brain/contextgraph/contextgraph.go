// Package contextgraph lands the ContextGraphDecision of KRD §119.2 — the
// DETERMINISTIC, LLM-FREE control-plane gate that decides whether a PAST decision /
// MemoryItem may be REUSED for a new request.
//
// The keystone (KRD §119.2): "Le LLM ne vit pas dans le ContextGraph." The ContextGraph
// PERMITS or BLOCKS; agents PROPOSE; the Execution Layer ACTS. This package is therefore a
// PURE library — Decide(candidate, request, now) → ContextGraphDecision — with NO LLM call,
// NO network, NO clock (the clock `now` is passed in so the verdict is deterministic and
// replayable), NO I/O of any kind. It is the reuse GATE over an already-built ContextGraph;
// it does NOT build the graph, compile a ContextPack, promote memory to the kernel, or run a
// RAG/embedding — those are other steps (KRD §119.1, §119.3, §141–§142).
//
// THE FOUR DECLARED DIMENSIONS (KRD §119.2, verbatim — exactly four, never invented):
//
//  1. TIME — the candidate's time_window / expires_at must contain `now`, else may_reuse=false
//     (reason names the expired window). KRD §13.7, §119.1 MemoryItem.expires_at.
//  2. SCOPE — the candidate's TruthScope (S15) must be a SUPERSET of the request context
//     (region/tenant/target/user_segment/environment), else may_reuse=false. The law
//     no_reuse_outside_scope (KRD §82.2 / §13.7: "une décision réutilisée hors scope est une
//     hallucination structurelle").
//  3. AUTHORITY — the candidate's AuthorityGraph owner (S16) must still hold for the request's
//     domain/truth_kind, else required_human_review=true.
//  4. CONDITIONS — any declared reuse `conditions` on the candidate must hold.
//
// The verdict is FALSE-DOMINANT (any failing check blocks reuse), records which dimensions it
// `checked` (so the verdict is explainable), and may set required_human_review. The four
// predicates are DECLARED, not learned (CLAUDE.md §8). The decision is content-addressed:
// its id == Hash(Canonicalize(body)) — REUSING S01/S02's records.Canonicalize/Hash, never a
// forked hashing path. A recorded decision is a ROW, never an UPDATE (append-only).
package contextgraph

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// Dimension is one of the EXACTLY FOUR declared reuse dimensions (KRD §119.2). The set is
// closed: this package invents no fifth dimension.
type Dimension string

const (
	// DimTime — the candidate's time_window / expires_at must contain `now`.
	DimTime Dimension = "time"
	// DimScope — the candidate's TruthScope must be a superset of the request context.
	DimScope Dimension = "scope"
	// DimAuthority — the candidate's AuthorityGraph owner must still hold for the request.
	DimAuthority Dimension = "authority"
	// DimConditions — any declared reuse conditions on the candidate must hold.
	DimConditions Dimension = "conditions"
)

// dimensionOrder is the canonical false-dominant evaluation order (KRD §119.2). Decide walks
// it in this exact order so the verdict is explainable and reproducible.
var dimensionOrder = []Dimension{DimTime, DimScope, DimAuthority, DimConditions}

// Dimensions returns the four KRD §119.2 reuse dimensions in canonical evaluation order.
func Dimensions() []Dimension {
	out := make([]Dimension, len(dimensionOrder))
	copy(out, dimensionOrder)
	return out
}

// Condition is a DECLARED reuse predicate on a candidate: the request fact at Key must equal
// Equals for reuse to hold. It is a declared (not learned) equality predicate — the simplest
// shape that lets a candidate say "only reuse me when X == Y". The set of facts lives in the
// request context (RequestContext.Facts). A richer predicate language is a later tooth; this
// step pins only the equality form the §119.2 example needs.
type Condition struct {
	// Key is the request-fact key the condition reads (e.g. "channel").
	Key string `json:"key"`
	// Equals is the value the fact must equal for the condition to hold.
	Equals string `json:"equals"`
}

// Holds reports whether the condition holds against the given request facts. A missing fact
// does NOT satisfy the condition (false-dominant: an unstated fact cannot license reuse).
func (c Condition) Holds(facts map[string]string) bool {
	v, ok := facts[c.Key]
	return ok && v == c.Equals
}

// Candidate is the PAST decision / MemoryItem whose reuse is being judged. It carries exactly
// what the four declared checks read — its TruthScope (S15), its expiry, its AuthorityGraph
// owner (S16), and its declared reuse conditions. It is consumed as input; this package never
// invents a candidate, a scope, an authority, or a condition (the honesty rule).
type Candidate struct {
	// ID is the candidate decision/MemoryItem id (a pinned id from S15/S16/S31, not coined here).
	ID string `json:"id"`
	// Scope is the candidate's TruthScope (S15) — the where/when/for-whom it was decided under.
	Scope scope.TruthScope `json:"scope"`
	// ExpiresAt is the candidate's expiry (RFC3339; empty = no declared expiry). Mirrors the
	// MemoryItem.expires_at field (S31, KRD §119.1). When the candidate's TruthScope carries a
	// non-empty time_window, that window is authoritative for the TIME check and ExpiresAt is the
	// fallback upper bound. Both are honoured; either failing blocks reuse (false-dominant).
	ExpiresAt string `json:"expires_at,omitempty"`
	// Authority is the AuthorityGraph (S16) that owned the candidate's domain/truth_kind. Its
	// Domain/TruthKind are the owner that must still hold for the request.
	Authority authority.AuthorityGraph `json:"authority"`
	// Conditions are the declared reuse predicates that must hold against the request facts.
	Conditions []Condition `json:"conditions,omitempty"`
}

// RequestContext is the NEW request the candidate's reuse is judged against. Its Scope is the
// concrete request scope (must be CONTAINED by the candidate scope); Domain/TruthKind key the
// authority-holds check; Facts feed the declared conditions. Consumed as input, never invented.
type RequestContext struct {
	// Scope is the concrete request scope (region/tenant/target/user_segment/environment).
	Scope scope.TruthScope `json:"scope"`
	// Domain is the request's domain the candidate authority must still own (e.g. "checkout").
	Domain string `json:"domain,omitempty"`
	// TruthKind is the request's epistemic kind the candidate authority must still own.
	TruthKind authority.TruthKind `json:"truth_kind,omitempty"`
	// Facts are the request facts the declared conditions read.
	Facts map[string]string `json:"facts,omitempty"`
}

// ContextGraphDecision is the §119.2 verdict — EXACTLY {may_reuse, reason, checked,
// required_human_review} (the shape is pinned by KRD; no field is invented). `checked` records
// which of the four dimensions were evaluated, in canonical order, so the verdict explains
// itself. The id is the content hash of the canonical decision body (S01/S02), set by
// ComputeID — it is the address of the recorded decision row.
type ContextGraphDecision struct {
	// ID is the content hash of the canonical decision body (Hash(Canonicalize(body))). Empty
	// until ComputeID is called; it is NOT part of the hashed body (it IS the address).
	ID string `json:"id,omitempty"`
	// CandidateID echoes the judged candidate's id (the verdict references ONLY the given input).
	CandidateID string `json:"candidate_id"`
	// MayReuse is the false-dominant verdict: true iff ALL four checks passed.
	MayReuse bool `json:"may_reuse"`
	// Reason is the human-readable explanation (names the failing dimension when blocked).
	Reason string `json:"reason"`
	// Checked records which dimensions were evaluated, in canonical order.
	Checked []Dimension `json:"checked"`
	// RequiredHumanReview is set when the candidate's authority no longer holds (a human must
	// re-decide rather than a silent reuse).
	RequiredHumanReview bool `json:"required_human_review"`
}

// hasChecked reports whether d recorded dim in `checked`.
func (d ContextGraphDecision) hasChecked(dim Dimension) bool {
	for _, c := range d.Checked {
		if c == dim {
			return true
		}
	}
	return false
}

// Decide is the PURE, LLM-FREE reuse gate of KRD §119.2. It evaluates the four DECLARED
// predicates in canonical order (time → scope → authority → conditions), FALSE-DOMINANT: the
// first failing check blocks reuse and the verdict names the failing dimension. `now` is passed
// in (never read from the clock) so the verdict is deterministic and replayable.
//
//	may_reuse == true  ⇔  all four checks recorded in `checked` AND all passed.
//
// The authority check, when the candidate's owner no longer holds for the request's
// domain/truth_kind, sets required_human_review (a human re-decides) rather than a flat block.
// Decide is TOTAL (always returns a verdict, never panics) and references ONLY the given
// candidate/request — it invents no candidate, scope, authority, or condition.
//
// Pure: no DB, no clock (now is a parameter), no rng, no network, NO LLM call. The rapid
// property mirror pins determinism, expired⇒false, out-of-scope⇒false, true⇒all-four-passed,
// no-invention, no-panic.
func Decide(candidate Candidate, request RequestContext, now time.Time) ContextGraphDecision {
	d := ContextGraphDecision{
		CandidateID: candidate.ID,
		Checked:     []Dimension{},
		MayReuse:    true,
	}

	// (1) TIME — the candidate's time_window / expires_at must contain `now`. (KRD §13.7, §119.1)
	d.Checked = append(d.Checked, DimTime)
	if ok, reason := timeContains(candidate, now); !ok {
		d.MayReuse = false
		d.Reason = reason
		return d
	}

	// (2) SCOPE — the candidate's TruthScope must be a SUPERSET of the request context.
	//     no_reuse_outside_scope (KRD §82.2 / §13.7).
	d.Checked = append(d.Checked, DimScope)
	if ok, reason := scopeContains(candidate.Scope, request.Scope); !ok {
		d.MayReuse = false
		d.Reason = reason
		return d
	}

	// (3) AUTHORITY — the candidate's AuthorityGraph owner must still hold for the request's
	//     domain/truth_kind, else required_human_review (a human re-decides).
	d.Checked = append(d.Checked, DimAuthority)
	if ok, reason := authorityHolds(candidate.Authority, request); !ok {
		d.MayReuse = false
		d.RequiredHumanReview = true
		d.Reason = reason
		return d
	}

	// (4) CONDITIONS — any declared reuse condition on the candidate must hold.
	d.Checked = append(d.Checked, DimConditions)
	if ok, reason := conditionsHold(candidate.Conditions, request.Facts); !ok {
		d.MayReuse = false
		d.Reason = reason
		return d
	}

	// All four checks recorded and passed ⇒ reuse is permitted.
	d.Reason = fmt.Sprintf(
		"réutilisation autorisée : les quatre dimensions déclarées (time/scope/authority/conditions) "+
			"sont satisfaites pour le candidat %q.", candidate.ID)
	return d
}

// timeContains reports whether `now` lies within the candidate's validity window. The window is
// the candidate's TruthScope.time_window (from/to, RFC3339) when set, with ExpiresAt as the
// fallback upper bound. An unparseable bound is treated as "expired/out of window" (false-
// dominant: a malformed time cannot license reuse). Empty bounds mean "unbounded on that side".
func timeContains(c Candidate, now time.Time) (bool, string) {
	from := c.Scope.TimeWindow.From
	to := c.Scope.TimeWindow.To
	// ExpiresAt is the fallback upper bound when the window has no `to`.
	if to == "" {
		to = c.ExpiresAt
	}

	if from != "" {
		start, err := time.Parse(time.RFC3339, from)
		if err != nil {
			return false, fmt.Sprintf(
				"dimension time : la borne de début %q du candidat est mal formée — réutilisation bloquée.", from)
		}
		if now.Before(start) {
			return false, fmt.Sprintf(
				"dimension time : `now` (%s) précède le début de la fenêtre de validité (%s) — réutilisation bloquée.",
				now.UTC().Format(time.RFC3339), from)
		}
	}

	if to != "" {
		end, err := time.Parse(time.RFC3339, to)
		if err != nil {
			return false, fmt.Sprintf(
				"dimension time : la borne de fin %q du candidat est mal formée — réutilisation bloquée.", to)
		}
		// The window is inclusive of its bounds; `now` strictly after `end` is expired.
		if now.After(end) {
			return false, fmt.Sprintf(
				"dimension time : la décision a expiré — `now` (%s) est postérieur à la fenêtre de validité (jusqu'à %s). "+
					"Une décision expirée n'est pas réutilisable.",
				now.UTC().Format(time.RFC3339), to)
		}
	}

	return true, ""
}

// scopeContains reports whether the candidate scope is a SUPERSET of the request scope — i.e.
// every dimension the candidate constrains must match the request (the request must fall
// WITHIN the candidate's scope). A dimension left empty on the candidate is a wildcard (the
// candidate did not constrain it); an explicit global region ("*") is a wildcard on region.
// This is the law no_reuse_outside_scope (KRD §82.2 / §13.7): a decision reused outside its
// scope is a structural hallucination.
func scopeContains(candidate, request scope.TruthScope) (bool, string) {
	// Region: candidate "*" or empty is a wildcard; otherwise must equal the request region.
	if candidate.Region != "" && candidate.Region != scope.RegionGlobal {
		if request.Region != candidate.Region {
			return false, fmt.Sprintf(
				"dimension scope : la décision a été prise pour la région %q mais la requête vise %q — "+
					"hors scope (no_reuse_outside_scope). Une décision réutilisée hors scope est une hallucination structurelle.",
				candidate.Region, regionLabel(request.Region))
		}
	}
	if msg, ok := dimMismatch("tenant", candidate.Tenant, request.Tenant); !ok {
		return false, msg
	}
	if msg, ok := dimMismatch("target", string(candidate.Target), string(request.Target)); !ok {
		return false, msg
	}
	if msg, ok := dimMismatch("user_segment", string(candidate.UserSegment), string(request.UserSegment)); !ok {
		return false, msg
	}
	if msg, ok := dimMismatch("environment", string(candidate.Environment), string(request.Environment)); !ok {
		return false, msg
	}
	return true, ""
}

// dimMismatch reports a scope mismatch on one (string) dimension: a constrained candidate
// dimension (non-empty) that the request does not match blocks reuse. An empty candidate
// dimension is a wildcard.
func dimMismatch(name, candidate, request string) (string, bool) {
	if candidate != "" && request != candidate {
		return fmt.Sprintf(
			"dimension scope : la décision a été prise pour %s=%q mais la requête vise %q — hors scope "+
				"(no_reuse_outside_scope).", name, candidate, valueLabel(request)), false
	}
	return "", true
}

// authorityHolds reports whether the candidate's AuthorityGraph owner still holds for the
// request's domain/truth_kind. The owner "holds" when the request's domain matches the graph's
// domain AND (the request states no truth_kind OR it matches the graph's truth_kind). A request
// in a domain the candidate's authority does not own requires HUMAN REVIEW (the verdict sets
// required_human_review) rather than a silent reuse. A request that states no domain inherits
// the candidate's authority (nothing to re-check).
func authorityHolds(g authority.AuthorityGraph, request RequestContext) (bool, string) {
	if request.Domain == "" {
		return true, ""
	}
	if g.Domain != "" && request.Domain != g.Domain {
		return false, fmt.Sprintf(
			"dimension authority : le détenteur d'autorité de la décision gouverne le domaine %q, "+
				"mais la requête vise %q — l'autorité ne tient plus, une revue humaine est requise (KRD §13.8).",
			g.Domain, request.Domain)
	}
	if request.TruthKind != "" && g.TruthKind != "" && request.TruthKind != g.TruthKind {
		return false, fmt.Sprintf(
			"dimension authority : le détenteur d'autorité gouverne le truth_kind %q, mais la requête vise %q — "+
				"l'autorité ne tient plus, une revue humaine est requise (KRD §13.8).",
			g.TruthKind, request.TruthKind)
	}
	return true, ""
}

// conditionsHold reports whether every declared reuse condition holds against the request facts.
// A failing (or unstated-fact) condition blocks reuse (false-dominant).
func conditionsHold(conds []Condition, facts map[string]string) (bool, string) {
	for _, c := range conds {
		if !c.Holds(facts) {
			return false, fmt.Sprintf(
				"dimension conditions : la condition de réutilisation déclarée (%s == %q) ne tient pas pour la requête — "+
					"réutilisation bloquée.", c.Key, c.Equals)
		}
	}
	return true, ""
}

// regionLabel renders a request region for a message, naming the absent case explicitly.
func regionLabel(r scope.Region) string {
	if r == "" {
		return "(aucune région)"
	}
	return string(r)
}

// valueLabel renders a request dimension value for a message, naming the absent case explicitly.
func valueLabel(v string) string {
	if v == "" {
		return "(non spécifié)"
	}
	return v
}

// canonicalBody is the content-addressed JSONB shape whose hash is the decision id. It carries
// the kind discriminator "context_graph_decision" (namespacing the hash, matching the
// context.context_graph_decision body) plus the verdict fields. The ID is EXCLUDED (it IS the
// address). `checked` is rendered as ordered strings so the canonical form is stable.
type canonicalBody struct {
	Kind                string   `json:"kind"` // always "context_graph_decision"
	CandidateID         string   `json:"candidate_id"`
	MayReuse            bool     `json:"may_reuse"`
	Reason              string   `json:"reason"`
	Checked             []string `json:"checked"`
	RequiredHumanReview bool     `json:"required_human_review"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the decision id. It REUSES
// records.Canonicalize (key-sorted, deterministic) — never a forked hashing path (S01/S02).
func (d ContextGraphDecision) CanonicalBody() ([]byte, error) {
	checked := make([]string, len(d.Checked))
	for i, c := range d.Checked {
		checked[i] = string(c)
	}
	raw, err := json.Marshal(canonicalBody{
		Kind:                "context_graph_decision",
		CandidateID:         d.CandidateID,
		MayReuse:            d.MayReuse,
		Reason:              d.Reason,
		Checked:             checked,
		RequiredHumanReview: d.RequiredHumanReview,
	})
	if err != nil {
		return nil, fmt.Errorf("contextgraph: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// ComputeID computes the content-addressed id of d (REUSING S01/S02 hashing) and returns a copy
// of d with its ID set. Pure: same verdict body ⇒ same id.
func (d ContextGraphDecision) ComputeID() (ContextGraphDecision, error) {
	canon, err := d.CanonicalBody()
	if err != nil {
		return d, err
	}
	d.ID = records.Hash(canon)
	return d, nil
}

// CheckedCSV renders the recorded dimensions as a stable, comma-separated string (canonical
// order) — a small helper for the SELECT-only projection / ledger display.
func CheckedCSV(checked []Dimension) string {
	xs := make([]string, len(checked))
	for i, c := range checked {
		xs[i] = string(c)
	}
	// `checked` is already in canonical order; sort defensively for a fully stable rendering.
	sort.SliceStable(xs, func(i, j int) bool { return dimIndex(xs[i]) < dimIndex(xs[j]) })
	return strings.Join(xs, ",")
}

func dimIndex(s string) int {
	for i, d := range dimensionOrder {
		if string(d) == s {
			return i
		}
	}
	return len(dimensionOrder)
}
