// Package semanticdiff is the AIDOS Runtime SemanticDiff classifier (KRD §44.1):
// a PURE function that reads the NATURE of a kernel change between two versions
// (old@hash → new@hash) — instead of a textual line diff — and names it with one
// member of the CLOSED §44.1 change_type set.
//
// KRD §44.1 names eight change_types {add, refine, override, deprecate, rescope,
// reauthorize, reweight, replace_mirror}. THIS step (S21) lands SIX of them —
// add · refine · override · rescope · reweight · deprecate — and explicitly NOT
// reauthorize (rides the S16 AuthorityGraph) nor replace_mirror (rides the S06
// mirror plane): those are later teeth, their rules are not invented here. A
// change Classify cannot map to one of the six yields ChangeUnclassifiable — an
// explicit OpenQuestion, NEVER a fabricated change_type (CLAUDE.md §8 honesty).
//
// THE CLASSIFICATION RULE (anchored to the done criterion + KRD §11/§12/§44.1/§96):
//   - add        — `new` pins a behaviour in free space (no prior version): KRD §11
//     extension, safe by construction.
//   - refine     — `new` adds a strictly more specific constraint UNDER an existing
//     one without contradicting it (a superset of the old fields, the
//     shared fields unchanged): KRD §11, safe iff consistent.
//   - override   — `new` CHANGES what an existing constraint SAYS — the done
//     criterion: an incompatible enabled_when (an Expr not implied by
//     the old one) on the same control ⇒ override (a revoked promise,
//     KRD §11/§12: dangerous, human, traced).
//   - rescope    — the change is a TruthScope move (S15) with the rule body
//     otherwise intact — the done criterion: a scope change is a
//     rescope, NOT an override (KRD §44.1).
//   - reweight   — the change is only a composes-link weight move
//     {cosmetic ↔ load-bearing} (KRD §96) — the done criterion:
//     cosmetic→load-bearing is a reweight, distinct from changing the
//     rule itself.
//   - deprecate  — `new` sets a TruthLifecycle.status to deprecated/shadowed/removed
//     (KRD §44.2: a truth dies by versioned succession, never deletion),
//     the body otherwise unchanged.
//
// PURE (CLAUDE.md §6 determinism-first): Classify is a TOTAL, DETERMINISTIC function
// of (old, new) — no DB, no clock, no RNG, no I/O, NO WRITE. It READS existing kernel
// rows handed in as Artifact values; it never reaches into the kernel/mirrors schemas
// (the wall, CLAUDE.md §2). It NEVER panics: a malformed/partial pair yields a typed
// result (often ChangeUnclassifiable), never a crash. Same (old,new) ⇒ same change_type.
//
// REUSE, DON'T REINVENT (ADR 0007): the body equality / canonicalization REUSES S02's
// records.Canonicalize/Hash (it does NOT fork the content-hash scheme); the Expr
// comparison REUSES the frozen back/kernel/expr canonical form. blast_radius /
// requires_authority / red_wave are REFERENCED from prior contracts (S15/S16/S17),
// never recomputed here — this step computes only the change_type.
package semanticdiff

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ChangeType is the closed §44.1 change_type set. S21 lands six members; the two
// out-of-scope §44.1 members (reauthorize, replace_mirror) are intentionally absent
// (not yet landed — never guessed). Unclassifiable is NOT a §44.1 change_type: it is
// the explicit "no member fits" verdict (an OpenQuestion), never a fabricated type.
type ChangeType string

const (
	// ChangeAdd — a behaviour pinned in free space (no prior version). KRD §11.
	ChangeAdd ChangeType = "add"
	// ChangeRefine — a strictly more specific, consistent constraint under an existing one. KRD §11.
	ChangeRefine ChangeType = "refine"
	// ChangeOverride — a changed existing constraint (a revoked promise). KRD §11/§12.
	ChangeOverride ChangeType = "override"
	// ChangeRescope — a TruthScope move (S15) with the body intact. KRD §44.1.
	ChangeRescope ChangeType = "rescope"
	// ChangeReweight — a composes weight move {cosmetic↔load-bearing}. KRD §96.
	ChangeReweight ChangeType = "reweight"
	// ChangeDeprecate — a TruthLifecycle status move (active→deprecated/shadowed/removed). KRD §44.2.
	ChangeDeprecate ChangeType = "deprecate"
	// ChangeUnclassifiable — NOT a §44.1 type: the explicit "no member fits" verdict
	// (an OpenQuestion, never a fabricated change_type). CLAUDE.md §8 honesty.
	ChangeUnclassifiable ChangeType = "unclassifiable"
	// ChangeNone — old and new are identical (identity ⇒ no change). Never a spurious type.
	ChangeNone ChangeType = "none"
)

// landedTypes is the closed set of the SIX change_types this step classifies, in
// canonical order. It is the set Classify may RETURN as a real classification
// (besides the special none / unclassifiable verdicts).
var landedTypes = []ChangeType{
	ChangeAdd, ChangeRefine, ChangeOverride, ChangeRescope, ChangeReweight, ChangeDeprecate,
}

// LandedTypes returns the six §44.1 change_types S21 classifies, in canonical order.
// The Workbench legend and the rapid property read this single source so the set is
// never re-invented downstream.
func LandedTypes() []ChangeType {
	out := make([]ChangeType, len(landedTypes))
	copy(out, landedTypes)
	return out
}

// IsLanded reports whether c is one of the six landed §44.1 change_types.
func IsLanded(c ChangeType) bool {
	for _, t := range landedTypes {
		if t == c {
			return true
		}
	}
	return false
}

// Artifact is one kernel version handed to Classify: the content-addressed body
// (canonical JSONB) plus its version@hash (S02). Body is the SOURCE OF TRUTH for the
// classification; Version is referenced for provenance / the OpenQuestion. An absent
// (zero) Artifact on the `old` side means "free space" (the add case).
type Artifact struct {
	// Version is the content hash of the canonical body (S02). Empty ⇒ absent (free space).
	Version string `json:"version"`
	// Body is the canonical JSONB of the kernel artifact. Empty ⇒ absent.
	Body json.RawMessage `json:"body,omitempty"`
}

// IsAbsent reports whether the artifact carries no body — the "free space" side.
func (a Artifact) IsAbsent() bool { return len(a.Body) == 0 }

// SemanticDiff is the KRD §44.1 result. change_type is COMPUTED here; the other three
// fields are REFERENCED from prior contracts (S15/S16/S17), not recomputed at S21 —
// they are surfaced so the Workbench can speak in human language, never re-derived.
type SemanticDiff struct {
	// ChangeType is the computed §44.1 change_type (one of the six, or none/unclassifiable).
	ChangeType ChangeType `json:"change_type"`
	// BlastRadius is REFERENCED (S17 link substrate) — the affected sub-graph. Not recomputed here.
	BlastRadius string `json:"blast_radius,omitempty"`
	// RequiresAuthority is REFERENCED (S16 AuthorityGraph) — who must approve. Not recomputed here.
	RequiresAuthority string `json:"requires_authority,omitempty"`
	// RedWave is REFERENCED (S17 red-wave substrate) — the cascade a hash bump triggers. Not recomputed here.
	RedWave string `json:"red_wave,omitempty"`
	// OldVersion / NewVersion carry provenance (the two compared versions).
	OldVersion string `json:"old_version,omitempty"`
	NewVersion string `json:"new_version,omitempty"`
	// OpenQuestion is set ONLY when ChangeType == unclassifiable — the explicit reason
	// Classify could not map the change, recorded as provenance (never a guessed type).
	OpenQuestion string `json:"open_question,omitempty"`
}

// Classify reads the NATURE of the change from old to new and returns the SemanticDiff.
// It is PURE, TOTAL, DETERMINISTIC and NEVER PANICS (the contract pinned by the rapid
// property mirror). The classification precedence (the rule order matters — a change is
// classified by its FIRST matching nature) is:
//
//  1. identity            → none          (old == new canonically)
//  2. old absent          → add           (free-space extension, KRD §11)
//  3. lifecycle move      → deprecate      (status active→deprecated/shadowed/removed, §44.2)
//  4. scope-only move     → rescope        (TruthScope changed, body equal, S15 / §44.1)
//  5. weight-only move    → reweight       (composes weight changed, rule equal, §96)
//  6. enabled_when change → override       (the same control's enabled_when not implied, §11/§12)
//  7. consistent narrow   → refine         (new is a strict superset of old's fields, §11)
//  8. otherwise           → unclassifiable (an OpenQuestion — never a fabricated type)
//
// Classify writes NOTHING. blast_radius/requires_authority/red_wave are left empty here
// (referenced, not recomputed); the CLI / Workbench fill them from the prior contracts.
func Classify(old, new Artifact) SemanticDiff {
	base := SemanticDiff{OldVersion: old.Version, NewVersion: new.Version}

	// 1. identity — old == new canonically (same content hash) ⇒ no change.
	oldCanon, oldErr := canonical(old.Body)
	newCanon, newErr := canonical(new.Body)
	if !old.IsAbsent() && !new.IsAbsent() && oldErr == nil && newErr == nil &&
		records.Hash(oldCanon) == records.Hash(newCanon) {
		base.ChangeType = ChangeNone
		return base
	}

	// 2. old absent ⇒ add (free-space extension). A new body in a region no prior
	//    version touches is safe by construction (KRD §11).
	if old.IsAbsent() {
		if new.IsAbsent() {
			// Both absent — nothing to classify. Not a §44.1 change.
			base.ChangeType = ChangeUnclassifiable
			base.OpenQuestion = "both old and new are absent — there is no artifact to classify"
			return base
		}
		base.ChangeType = ChangeAdd
		return base
	}
	// A present old with an absent new is NOT a deletion in §44.1 (a truth dies by
	// succession, never deletion — §44.2): it is unclassifiable here, never guessed.
	if new.IsAbsent() {
		base.ChangeType = ChangeUnclassifiable
		base.OpenQuestion = "new is absent — a truth dies by versioned succession (deprecate), never deletion (KRD §44.2); a bare removal is not a §44.1 change_type landed here"
		return base
	}

	// Parse both bodies into generic maps. A malformed body ⇒ unclassifiable (never panic).
	oldMap, ok1 := asObject(old.Body)
	newMap, ok2 := asObject(new.Body)
	if !ok1 || !ok2 {
		base.ChangeType = ChangeUnclassifiable
		base.OpenQuestion = "old or new body is not a JSON object — Classify cannot read its nature"
		return base
	}

	// 3. lifecycle move ⇒ deprecate (status active→deprecated/shadowed/removed, body
	//    otherwise unchanged). KRD §44.2.
	if isDeprecation(oldMap, newMap) {
		base.ChangeType = ChangeDeprecate
		return base
	}

	// 4. scope-only move ⇒ rescope (TruthScope changed, everything else equal). S15 / §44.1.
	//    THE done criterion: a scope change is a rescope, NOT an override.
	if isScopeOnlyChange(oldMap, newMap) {
		base.ChangeType = ChangeRescope
		return base
	}

	// 5. weight-only move ⇒ reweight (composes weight changed, rule otherwise equal). §96.
	//    THE done criterion: cosmetic→load-bearing is a reweight.
	if isWeightOnlyChange(oldMap, newMap) {
		base.ChangeType = ChangeReweight
		return base
	}

	// 6. enabled_when change ⇒ override (the same control's enabled_when not implied by
	//    the old one). §11/§12. THE done criterion: an incompatible enabled_when is an
	//    override (a revoked promise).
	if isEnabledWhenOverride(oldMap, newMap) {
		base.ChangeType = ChangeOverride
		return base
	}

	// 7. consistent narrowing ⇒ refine (new is a strict superset of old's fields, the
	//    shared fields unchanged — a stricter constraint that does not contradict). §11.
	if isRefinement(oldMap, newMap) {
		base.ChangeType = ChangeRefine
		return base
	}

	// 8. otherwise ⇒ unclassifiable — an explicit OpenQuestion, never a fabricated type.
	base.ChangeType = ChangeUnclassifiable
	base.OpenQuestion = "the change does not map to any of the six §44.1 change_types this step lands (add/refine/override/rescope/reweight/deprecate); it must be routed to a human (provenance), not guessed"
	return base
}

// canonical returns the S02 canonical form of a body, or an error for a non-absent
// malformed body. An absent body canonicalizes to empty (handled by callers).
func canonical(b json.RawMessage) ([]byte, error) {
	if len(b) == 0 {
		return nil, nil
	}
	return records.Canonicalize(b)
}

// asObject decodes a body into a generic string-keyed map. Returns ok=false for a
// non-object / malformed body (never panics).
func asObject(b json.RawMessage) (map[string]any, bool) {
	if len(b) == 0 {
		return nil, false
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil || m == nil {
		return nil, false
	}
	return m, true
}
