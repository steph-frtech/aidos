// Package changeset is the Archive's temporal-axis primitive (KRD §44, §98, §44.1): the atomic,
// reversible transactional ENVELOPE that moves the kernel from one stable phase to the next,
// wrapping `spec_delta` (Kernel) and `mirror_delta` (Mirror) TOGETHER in one body so they can never
// drift. Its only statuses are DRAFT | APPLIED | REVERTED — there is NO FAILED (on a hard error a
// DRAFT is DISCARDED/removed, not marked failed). An APPLIED ChangeSet is IMMUTABLE; a "revert" is a
// NEW INVERSE ChangeSet appended to the log (append-only — a revert creates information, it never
// destroys the source, which stays APPLIED until its inverse applies and stamps it REVERTED).
//
// THE TWO AXES (KRD §44):
//   - vertical: spec ↔ miroir — held together in ONE envelope (one ChangeSet, not two).
//   - temporal: DRAFT → APPLIED, and an inverse ChangeSet for a revert.
//
// THE COMMIT GATE (KRD §98, §44): DRAFT → APPLIED is admitted ONLY IF the completeness law holds —
// every spec_delta layer has its living mirror (no orphan, no monster). The completeness predicate
// is INJECTED here (this package never reaches into the kernel/mirrors schemas — the wall); the
// minimal predicate this step ships is "a spec_delta is present ⇒ a mirror_delta must be present".
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. Open/Apply/Revert/Discard
// are total, deterministic functions of their input (Apply takes the applied_at timestamp as an
// argument so the function stays pure). The id is the content hash of the canonical body, so the
// envelope is content-addressed and replayable. The rapid property mirror pins the closed status
// set, APPLIED immutability, the completeness-gated Apply, Revert∘Revert ≡ identity, the strictly
// growing log, and id == content hash.
package changeset

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// Status is the CLOSED set of ChangeSet statuses (KRD §44): there are exactly three. There is NO
// FAILED — a hard-errored DRAFT is Discard'd (removed), never marked failed.
type Status string

const (
	// StatusDraft — an open, mutable envelope not yet committed.
	StatusDraft Status = "DRAFT"
	// StatusApplied — a committed, IMMUTABLE envelope (passed the completeness gate).
	StatusApplied Status = "APPLIED"
	// StatusReverted — an APPLIED envelope whose inverse has itself been APPLIED (stamped, not deleted).
	StatusReverted Status = "REVERTED"
)

// Statuses returns the three statuses in canonical order, so the closed set is never invented
// downstream (the Workbench legend, the migration CHECK).
func Statuses() []Status { return []Status{StatusDraft, StatusApplied, StatusReverted} }

// Delta is one plane's change carried by the envelope. It is intentionally minimal at this step: a
// `kind` (the change_type, KRD §44.1), a `target` (what it touches), and an opaque `body`. The
// inverse of a delta negates its kind (add ⇄ remove) without re-diffing — Revert builds the inverse
// from the source body, never by re-computing a diff.
type Delta struct {
	// Kind is the change_type (KRD §44.1 enum subset used at this step): "add" | "remove" | "refine".
	Kind string `json:"kind"`
	// Target is the layer/entity the delta touches (e.g. "Order.discount").
	Target string `json:"target"`
	// Body is the opaque payload of the change (the AST fragment). Stored verbatim; negation flips
	// only the Kind, so Revert∘Revert reconstructs the original delta.
	Body json.RawMessage `json:"body,omitempty"`
}

// invert returns the semantic inverse of a delta: add ⇄ remove (refine is its own inverse here —
// a later SemanticDiff step refines this). The Target and Body are preserved so that inverting
// twice reconstructs the original (Revert∘Revert ≡ identity).
func (d Delta) invert() Delta {
	k := d.Kind
	switch d.Kind {
	case "add":
		k = "remove"
	case "remove":
		k = "add"
	}
	return Delta{Kind: k, Target: d.Target, Body: d.Body}
}

// ChangeSet is the atomic, reversible transactional envelope (KRD §44, §98). The id is the content
// hash of the canonical body (spec+mirror+parent_phase+reverts+label) — NOT of the status or
// applied_at, which are lifecycle stamps. spec_delta and mirror_delta live together so they cannot
// drift.
type ChangeSet struct {
	// ID is the SHA-256 hex content hash of the canonical body (content-addressed).
	ID string `json:"id"`
	// Label is the human name of the envelope (e.g. "add order discount").
	Label string `json:"label"`
	// Status is one of DRAFT | APPLIED | REVERTED (closed set — no FAILED).
	Status Status `json:"status"`
	// ParentPhase is the stable phase this envelope moves from (a single edge; the DAG is a later step).
	ParentPhase string `json:"parent_phase"`
	// SpecDelta is the Kernel-plane change (nil ⇒ no spec change in this envelope).
	SpecDelta *Delta `json:"spec_delta,omitempty"`
	// MirrorDelta is the Mirror-plane change. The completeness gate requires it whenever SpecDelta is set.
	MirrorDelta *Delta `json:"mirror_delta,omitempty"`
	// Reverts is the id of the source ChangeSet this envelope is the inverse of (empty unless a revert).
	Reverts string `json:"reverts,omitempty"`
	// AppliedAt is the commit timestamp; nil until APPLIED.
	AppliedAt *time.Time `json:"applied_at,omitempty"`
}

// canonicalBody is the content-addressed portion of a ChangeSet: everything that defines the
// envelope's identity. Lifecycle stamps (Status, AppliedAt) are EXCLUDED so the id is stable across
// the DRAFT → APPLIED transition (applying does not change the envelope's identity, only its stamp).
type canonicalBody struct {
	Kind        string `json:"kind"` // always "changeset" — namespaces the hash
	Label       string `json:"label"`
	ParentPhase string `json:"parent_phase"`
	SpecDelta   *Delta `json:"spec_delta,omitempty"`
	MirrorDelta *Delta `json:"mirror_delta,omitempty"`
	Reverts     string `json:"reverts,omitempty"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the ChangeSet id. Deterministic:
// json.Marshal of a struct emits fields in declaration order, so the same envelope always yields
// the same bytes and thus the same id (content-addressing).
func (cs ChangeSet) CanonicalBody() ([]byte, error) {
	return json.Marshal(canonicalBody{
		Kind:        "changeset",
		Label:       cs.Label,
		ParentPhase: cs.ParentPhase,
		SpecDelta:   cs.SpecDelta,
		MirrorDelta: cs.MirrorDelta,
		Reverts:     cs.Reverts,
	})
}

// hashOf returns the SHA-256 hex digest of b — the same content-hash scheme S01's contentstore.Hash
// uses (do NOT fork it; this is the identical algorithm so a ChangeSet id is a content-store key).
func hashOf(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// computeID fills cs.ID from its canonical body. Returns an error only if the body cannot marshal.
func computeID(cs ChangeSet) (string, error) {
	b, err := cs.CanonicalBody()
	if err != nil {
		return "", fmt.Errorf("changeset: canonical body: %w", err)
	}
	return hashOf(b), nil
}

// BlockCode is the actionable reason a lifecycle transition was refused (KRD §44.5).
type BlockCode string

const (
	// CodeIncompleteChangeSet — DRAFT → APPLIED refused: a spec_delta layer has no living mirror
	// (an orphan / a monster). The completeness law (KRD §33, §98) forbids the commit.
	CodeIncompleteChangeSet BlockCode = "INCOMPLETE_CHANGESET"
	// CodeAppliedIsImmutable — an edit of an APPLIED (or REVERTED) envelope was refused: an applied
	// envelope is immutable; the only legal write to its lineage is appending an inverse ChangeSet.
	CodeAppliedIsImmutable BlockCode = "APPLIED_IS_IMMUTABLE"
	// CodeNotDraft — a transition legal only from DRAFT was attempted from another status.
	CodeNotDraft BlockCode = "NOT_DRAFT"
	// CodeNotApplied — a revert of a non-APPLIED envelope was attempted (only an APPLIED can be reverted).
	CodeNotApplied BlockCode = "NOT_APPLIED"
)

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[]). A
// wall without a fix path is a prison; every block names the door (how_to_fix non-empty). Same shape
// as the kernel's other BlockReasons.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

func (b *BlockReason) Error() string { return string(b.Code) + ": " + b.Explanation }

// CompletenessFn is the INJECTED completeness predicate. It returns nil when the envelope's
// spec_delta layers each have their living mirror (no orphan, no monster), or a *BlockReason
// (INCOMPLETE_CHANGESET) naming the door otherwise. The predicate is injected so this package never
// reaches into the kernel/mirrors schemas (the wall); a later step wires the real predicate.
type CompletenessFn func(cs ChangeSet) *BlockReason

// SpecHasMirror is the MINIMAL completeness predicate this step ships: a spec_delta REQUIRES a
// mirror_delta in the same envelope (atomic spec+mirror — they cannot drift). A spec without its
// mirror is a monster; it is refused with INCOMPLETE_CHANGESET + how_to_fix add_mirror_for_spec_delta.
// PURE; reads only the envelope handed in.
func SpecHasMirror(cs ChangeSet) *BlockReason {
	if cs.SpecDelta != nil && cs.MirrorDelta == nil {
		return &BlockReason{
			Code:     CodeIncompleteChangeSet,
			Severity: "error",
			Explanation: "le ChangeSet porte un spec_delta sans son mirror_delta — un spec sans son " +
				"miroir est un monstre (loi de complétude, KRD §33/§98) ; le passage à APPLIED est refusé.",
			HowToFix: []string{"add_mirror_for_spec_delta"},
		}
	}
	return nil
}

// Open creates a fresh DRAFT envelope from a label and parent phase, with its content-addressed id.
// The deltas may be attached now or refined while DRAFT. PURE.
func Open(label, parentPhase string, spec, mirror *Delta) (ChangeSet, error) {
	cs := ChangeSet{
		Label:       label,
		Status:      StatusDraft,
		ParentPhase: parentPhase,
		SpecDelta:   spec,
		MirrorDelta: mirror,
	}
	id, err := computeID(cs)
	if err != nil {
		return ChangeSet{}, err
	}
	cs.ID = id
	return cs, nil
}

// Apply commits a DRAFT envelope to APPLIED — admitted ONLY IF complete(cs) passes the completeness
// gate (KRD §98). On success it returns a copy stamped APPLIED with appliedAt; the id is unchanged
// (applying does not change the envelope's identity). On a non-DRAFT input it returns NOT_DRAFT; on
// an incomplete envelope it returns the predicate's BlockReason (INCOMPLETE_CHANGESET). The original
// is never mutated. PURE (appliedAt is an argument, not time.Now()).
func Apply(cs ChangeSet, appliedAt time.Time, complete CompletenessFn) (ChangeSet, *BlockReason) {
	if cs.Status != StatusDraft {
		return cs, &BlockReason{
			Code:        CodeNotDraft,
			Severity:    "error",
			Explanation: fmt.Sprintf("seul un ChangeSet DRAFT peut être appliqué ; celui-ci est %s.", cs.Status),
			HowToFix:    []string{"open_a_new_draft", "revert_if_applied"},
		}
	}
	if complete == nil {
		complete = SpecHasMirror
	}
	if br := complete(cs); br != nil {
		return cs, br // status stays DRAFT — the source is not mutated
	}
	applied := cs
	t := appliedAt
	applied.Status = StatusApplied
	applied.AppliedAt = &t
	return applied, nil
}

// Edit refuses any in-place change to an APPLIED (or REVERTED) envelope — it is IMMUTABLE (THE done
// criterion). The only legal write to an applied envelope's lineage is appending an inverse
// ChangeSet (see Revert). A DRAFT may still be re-opened with new deltas via Open. PURE.
func Edit(cs ChangeSet) *BlockReason {
	if cs.Status == StatusApplied || cs.Status == StatusReverted {
		return &BlockReason{
			Code:     CodeAppliedIsImmutable,
			Severity: "error",
			Explanation: fmt.Sprintf("un ChangeSet %s est IMMUABLE (KRD §44) — il ne peut être édité en "+
				"place ; la seule écriture légale sur sa lignée est l'ajout d'un ChangeSet inverse (revert).", cs.Status),
			HowToFix: []string{"open_a_revert_changeset", "open_a_new_draft_for_a_further_change"},
		}
	}
	return nil
}

// Revert builds the INVERSE of an APPLIED envelope as a NEW DRAFT (negated deltas, reverts == source
// id) WITHOUT mutating the source (the source stays APPLIED, immutable). It is the append-only door:
// a revert creates information, it never destroys the source. Reverting a non-APPLIED envelope is
// refused with NOT_APPLIED. The returned inverse is itself content-addressed (a distinct id). PURE.
func Revert(source ChangeSet) (ChangeSet, *BlockReason) {
	if source.Status != StatusApplied {
		return ChangeSet{}, &BlockReason{
			Code:        CodeNotApplied,
			Severity:    "error",
			Explanation: fmt.Sprintf("seul un ChangeSet APPLIED peut être reverté ; celui-ci est %s.", source.Status),
			HowToFix:    []string{"apply_before_reverting"},
		}
	}
	inv := ChangeSet{
		Label:       "revert: " + source.Label,
		Status:      StatusDraft,
		ParentPhase: source.ParentPhase,
		Reverts:     source.ID,
	}
	if source.SpecDelta != nil {
		d := source.SpecDelta.invert()
		inv.SpecDelta = &d
	}
	if source.MirrorDelta != nil {
		d := source.MirrorDelta.invert()
		inv.MirrorDelta = &d
	}
	id, err := computeID(inv)
	if err != nil {
		return ChangeSet{}, &BlockReason{
			Code:        CodeIncompleteChangeSet,
			Severity:    "error",
			Explanation: "l'inverse n'a pas pu être adressé par contenu : " + err.Error(),
			HowToFix:    []string{"check_delta_bodies_are_valid_json"},
		}
	}
	inv.ID = id
	return inv, nil
}

// StampReverted returns a copy of an APPLIED source stamped REVERTED — the lifecycle stamp written
// when the source's inverse is itself APPLIED. It is NOT an in-place edit of the source's identity:
// the id (content hash of the body) is unchanged; only the status stamp moves (APPLIED → REVERTED),
// which is the one legal lineage write the commit-gate permits. Stamping a non-APPLIED source is
// refused. PURE.
func StampReverted(source ChangeSet) (ChangeSet, *BlockReason) {
	if source.Status != StatusApplied {
		return source, &BlockReason{
			Code:        CodeNotApplied,
			Severity:    "error",
			Explanation: fmt.Sprintf("seul un ChangeSet APPLIED peut être estampillé REVERTED ; celui-ci est %s.", source.Status),
			HowToFix:    []string{"apply_the_inverse_changeset_first"},
		}
	}
	stamped := source
	stamped.Status = StatusReverted
	return stamped, nil
}

// Discard reports whether a DRAFT may be removed (there is NO FAILED — a hard-errored DRAFT is
// removed, not marked failed). It returns nil for a DRAFT (the caller then deletes it from the log)
// or NOT_DRAFT for an APPLIED/REVERTED envelope (which is immutable and append-only — never deleted).
// The removal itself is a store op (the MCP server); this pure function only authorizes it. PURE.
func Discard(cs ChangeSet) *BlockReason {
	if cs.Status != StatusDraft {
		return &BlockReason{
			Code:        CodeNotDraft,
			Severity:    "error",
			Explanation: fmt.Sprintf("seul un DRAFT peut être supprimé (discard) ; un %s est immuable et append-only, jamais supprimé.", cs.Status),
			HowToFix:    []string{"revert_if_applied"},
		}
	}
	return nil
}
