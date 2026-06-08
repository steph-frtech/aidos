// Package behaviorcapture is the AIDOS Runtime engine of S67 — ATTACHING A BEHAVIOR-MACRO
// AT IDEA-CAPTURE (KRD §24.6; ROADMAP-app-builder S67). At the moment a human captures an
// idea (S64), the reusable behaviours library (S79) is surfaced; attaching one DRY-RUN-EXPANDS
// it — in attributes / relations / operations / policies / fixtures — as a DRAFT ChangeSet
// PROPOSAL, "ne réécris pas le boilerplate owner-scoping pour la 50ᵉ fois".
//
// THE SINGLE EXPANDER (the load-bearing contract of S67). The expansion is produced by the
// ONE authoritative, pure function behavior.Expand built in S76 — NEVER a second
// implementation (a re-implementation would be a reproducibility hazard; the roadmap forbids
// it, note 3). This package CONSUMES Expand; it does not duplicate the catalogue, the
// idempotence rule, or the content-addressing. The attached expansion is therefore
// BYTE-IDENTICAL to S76's (same Attachment ⇒ same Expansion ⇒ same ExpansionID); the
// reproducibility mirror pins that the proposal carries S76's expansion verbatim.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING. AttachBehaviorAtCapture returns a
// Proposal VALUE — a DRAFT ChangeSet (S20) wrapping the dry-run expansion as its spec_delta
// (WroteKernel stays false). The screen PROPOSES it; freezing the expanded source into the
// kernel goes through the wall (idée → miroir → /goal → approbation humaine), never from
// here. This package imports no kernel-write path; it has no DB, no sink that could touch
// kernel/mirrors/fitness.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE and TOTAL — no clock, no
// rng, no I/O, never panics. The expansion is code (S76's catalogue), never an LLM judgment —
// an "LLM expanding a behavior at capture" would be a determinism gap; the rule is code. Same
// (idea, attachment) ⇒ byte-identical Proposal; the reproducibility mirror
// (behaviorcapture_property_test.go) pins it.
//
// REUSE, NEVER FORK. The DRAFT ChangeSet is changeset.Open (S20) verbatim; the expansion is
// behavior.Expand (S76) verbatim; the proposal's content address reuses records.Hash (S02).
// No new ADR: this freezes one new artifact (attach-at-capture), it shifts no prior contract.
package behaviorcapture

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Behavior re-exports S79/S76's behavior.Kind so the library surfaced at capture is named in
// behaviorcapture terms while the catalogue stays owned by S76 (a type alias — NOT a fork).
type Behavior = behavior.Kind

// Attachment re-exports S76's pure expansion input (which behavior, on which entity, the
// entity's existing shape for idempotence). Reused verbatim — the single source of the input.
type Attachment = behavior.Attachment

// Expansion re-exports S76's dry-run expansion result (the five §24.6 source kinds + the
// content-addressed ExpansionID + WroteKernel=false). Carried in the Proposal verbatim.
type Expansion = behavior.Expansion

// Library returns the reusable behaviours surfaced at capture, in S76's canonical order —
// the deterministic catalogue the capture screen offers ("attach a behavior"). It is exactly
// behavior.Catalogue() (one source of truth for the library), never an ad-hoc list. PURE.
func Library() []Behavior { return behavior.Catalogue() }

// Errors.
var (
	// ErrNoIdea — an attach with an empty idea ref; a behavior is attached AT a capture, so the
	// captured idea it decorates must be named (no dangling proposal).
	ErrNoIdea = errors.New("behaviorcapture: attach has no captured-idea ref")
)

// Proposal is what AttachBehaviorAtCapture RETURNS when a behavior is attached at capture: the
// dry-run Expansion (S76, byte-identical) AND the DRAFT ChangeSet (S20) that PROPOSES freezing
// it. It is a VALUE — nothing is persisted. The screen renders the expansion preview and, on
// human approval, the changeset door (S20) persists the DRAFT; promotion to truth stays /goal.
type Proposal struct {
	// IdeaRef is the captured idea the behavior was attached to (provenance: "what was decorated").
	IdeaRef string `json:"idea_ref"`
	// Expansion is S76's dry-run expansion VERBATIM — the five source kinds + ExpansionID +
	// WroteKernel=false. byte-identical to behavior.Expand(Attachment) (the single-function law).
	Expansion Expansion `json:"expansion"`
	// ChangeSet is the DRAFT envelope (S20) wrapping the expansion as its spec_delta. Status is
	// ALWAYS DRAFT (a proposal, never applied); MirrorDelta is nil here — the macro's fixtures are
	// the proof obligations the /goal flow turns into a mirror_delta later (annexed, not faked).
	ChangeSet changeset.ChangeSet `json:"changeset"`
}

// AttachBehaviorAtCapture is the S67 attach — PURE, TOTAL, DRY-RUN.
//
//   - it expands the attached behavior via the ONE authoritative behavior.Expand (S76),
//     never a second implementation (byte-identical result, content-addressed ExpansionID);
//   - it wraps that expansion as the spec_delta of a fresh DRAFT ChangeSet (S20), targeted at
//     the attachment's entity, labelled by the behavior — a PROPOSAL, never an apply;
//   - it WRITES NOTHING (the expansion's WroteKernel stays false; the ChangeSet stays DRAFT):
//     freezing goes via the wall (idée → miroir → /goal), never from here;
//   - same (ideaRef, attachment) ⇒ byte-identical Proposal.
//
// An empty idea ref errors (ErrNoIdea); an unknown behavior or an entity-less attachment is
// rejected BY S76's Expand (ErrUnknownBehavior / ErrNoEntity) — this package never guesses an
// expansion (the honesty rule, the single-function law).
func AttachBehaviorAtCapture(ideaRef string, a Attachment, parentPhase string) (Proposal, error) {
	if ideaRef == "" {
		return Proposal{}, ErrNoIdea
	}
	// THE SINGLE EXPANDER (S76). No second implementation — Expand owns the catalogue, the
	// idempotence and the content-addressing. The error (unknown behavior / no entity) is S76's.
	exp, err := behavior.Expand(a)
	if err != nil {
		return Proposal{}, err
	}

	// Wrap the dry-run expansion as the spec_delta of a DRAFT ChangeSet (S20). The body is the
	// expansion VERBATIM (canonicalised at content-address time), so the proposal carries S76's
	// expansion byte-identically — the spec_delta IS the expansion, never a re-derivation.
	body, err := json.Marshal(exp)
	if err != nil {
		return Proposal{}, fmt.Errorf("behaviorcapture: marshal expansion: %w", err)
	}
	spec := changeset.Delta{
		Kind:   "add",
		Target: exp.Entity,
		Body:   body,
	}
	label := fmt.Sprintf("attach behavior %q to %q (capture %s)", exp.Behavior, exp.Entity, ideaRef)
	cs, err := changeset.Open(label, parentPhase, &spec, nil)
	if err != nil {
		return Proposal{}, fmt.Errorf("behaviorcapture: open DRAFT changeset: %w", err)
	}

	return Proposal{IdeaRef: ideaRef, Expansion: exp, ChangeSet: cs}, nil
}

// ProposalID content-addresses a Proposal over its semantic body (the idea ref + the expansion
// id + the DRAFT changeset id) — the stable handle the Workbench keys the preview on. Reuses
// records.Canonicalize/Hash (S02): same Proposal ⇒ same id, key-order-stable. PURE.
func ProposalID(p Proposal) (string, error) {
	body := struct {
		IdeaRef     string `json:"idea_ref"`
		ExpansionID string `json:"expansion_id"`
		ChangeSetID string `json:"changeset_id"`
	}{
		IdeaRef:     p.IdeaRef,
		ExpansionID: p.Expansion.ExpansionID,
		ChangeSetID: p.ChangeSet.ID,
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

// PieceCount totals the source pieces the attached expansion proposes — the deterministic
// count the capture screen renders ("attacher cette behavior propose N pièces"). It is exactly
// behavior.PieceCount over the carried expansion (one source of truth for the count). PURE.
func PieceCount(p Proposal) int { return behavior.PieceCount(p.Expansion) }

// PreviewNames returns every proposed piece name in one stable, sorted list — the capture
// screen's preview rows. It is exactly behavior.SortedNames over the carried expansion. PURE.
func PreviewNames(p Proposal) []string { return behavior.SortedNames(p.Expansion) }
