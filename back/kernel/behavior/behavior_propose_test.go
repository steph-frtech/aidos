package behavior_test

// S76 — the behavior-RECORD + PROPOSE mirror (§24.6, EPIC 7). The done-criteria add two clauses on
// top of the GREEN Expand mirror:
//
//   - the behavior is a RECORD: ownable, versioned, taggable, localizable (a catalogue entry the
//     user owns, versions, tags and localises — "ne réécris pas le boilerplate pour la 50ᵉ fois") ;
//   - the EXPANSION IS A PROPOSED CHANGESET, JAMAIS UNE VÉRITÉ APPLIQUÉE. Propose runs the ONE
//     authoritative Expand and wraps its dry-run into a DRAFT changeset.ChangeSet (spec_delta +
//     mirror_delta), targeted at the project scope — it WRITES NOTHING (the wall, CLAUDE.md §2).
//
// fixture mirror: state (a versioned, tagged, localized behavior record attached to an entity)
//   → command (Propose) → events (a DRAFT ChangeSet carrying the canonical expansion, never APPLIED;
//   a reject leaves the kernel intact because Propose never touched it).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
)

func TestRecord_OwnableVersionedTaggableLocalizable(t *testing.T) {
	r := behavior.Record{
		Kind:    behavior.Ownable,
		Owner:   "alice",
		Version: 3,
		Tags:    []string{"scoping", "security"},
		Labels:  map[string]string{"fr": "propriété", "en": "ownership"},
	}
	if err := behavior.ValidateRecord(r); err != nil {
		t.Fatalf("a well-formed record must validate: %v", err)
	}
	// Ownable: owner is required (a behavior is ownable — §24.6).
	if r.Owner == "" {
		t.Fatal("record is ownable: owner must be present")
	}
	// Versioned: a positive monotone version.
	if r.Version < 1 {
		t.Fatal("record is versioned: version must be >= 1")
	}
	// Taggable + localizable: tags + per-locale labels.
	if len(r.Tags) == 0 || r.Labels["fr"] == "" {
		t.Fatal("record is taggable + localizable: tags and a FR label are required (bilingue par défaut)")
	}
	// The record's RecordID is the content-address of its identity (kind+owner+version+tags+labels).
	if behavior.RecordID(r) == "" {
		t.Fatal("record has no content-address id")
	}
}

func TestValidateRecord_Rejects(t *testing.T) {
	cases := map[string]behavior.Record{
		"unknown kind": {Kind: "telepathic", Owner: "a", Version: 1, Labels: map[string]string{"fr": "x"}},
		"no owner":     {Kind: behavior.Ownable, Owner: "", Version: 1, Labels: map[string]string{"fr": "x"}},
		"bad version":  {Kind: behavior.Ownable, Owner: "a", Version: 0, Labels: map[string]string{"fr": "x"}},
		"no FR label":  {Kind: behavior.Ownable, Owner: "a", Version: 1, Labels: map[string]string{"en": "x"}},
		"empty labels": {Kind: behavior.Ownable, Owner: "a", Version: 1, Labels: nil},
	}
	for name, r := range cases {
		if err := behavior.ValidateRecord(r); err == nil {
			t.Fatalf("%s: ValidateRecord must reject, got nil", name)
		}
	}
}

func TestPropose_OwnableOnOrder_OpensDraftNeverApplied(t *testing.T) {
	r := behavior.Record{
		Kind: behavior.Ownable, Owner: "alice", Version: 1,
		Tags: []string{"scoping"}, Labels: map[string]string{"fr": "propriété", "en": "ownership"},
	}
	p, err := behavior.Propose(behavior.Attachment{Behavior: r.Kind, Entity: "Order"}, r, "phase-0")
	if err != nil {
		t.Fatalf("Propose(ownable, Order) errored: %v", err)
	}
	// THE WALL: a DRAFT changeset, never APPLIED.
	if p.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("Propose must open a DRAFT changeset, got status %q", p.ChangeSet.Status)
	}
	if p.ChangeSet.AppliedAt != nil {
		t.Fatal("WALL VIOLATION: the proposed changeset is already APPLIED — Propose must never apply")
	}
	// The changeset carries BOTH a spec_delta and its mirror_delta (completeness — a spec needs a mirror).
	if p.ChangeSet.SpecDelta == nil || p.ChangeSet.MirrorDelta == nil {
		t.Fatal("the proposed changeset must carry spec_delta + mirror_delta (completeness law)")
	}
	if cb := changeset.SpecHasMirror(p.ChangeSet); cb != nil {
		t.Fatalf("the proposed changeset must pass the minimal completeness gate, got %v", cb)
	}
	// The expansion echoed is the dry-run of the ONE Expand — never wrote kernel.
	if p.Expansion.WroteKernel {
		t.Fatal("WALL VIOLATION: the carried expansion reports WroteKernel=true")
	}
	// The spec_delta target is project-scoped (the behavior expands INTO the project's entity).
	if p.ChangeSet.SpecDelta.Target == "" {
		t.Fatal("the spec_delta must target a project-scoped entity")
	}
	// The single-function law: the carried expansion is byte-identical to a direct Expand call.
	direct, _ := behavior.Expand(behavior.Attachment{Behavior: r.Kind, Entity: "Order"})
	if p.Expansion.ExpansionID != direct.ExpansionID {
		t.Fatal("Propose must wrap the ONE authoritative Expand, not a second expansion")
	}
}

func TestPropose_UnknownBehavior_Rejected(t *testing.T) {
	r := behavior.Record{Kind: "telepathic", Owner: "a", Version: 1, Labels: map[string]string{"fr": "x"}}
	_, err := behavior.Propose(behavior.Attachment{Behavior: r.Kind, Entity: "Order"}, r, "phase-0")
	if err == nil {
		t.Fatal("Propose of an unknown behavior must error")
	}
}

func TestPropose_RecordMismatch_Rejected(t *testing.T) {
	// The record's kind must match the attachment's behavior (no silent re-cast).
	r := behavior.Record{Kind: behavior.Ownable, Owner: "a", Version: 1, Labels: map[string]string{"fr": "x"}}
	_, err := behavior.Propose(behavior.Attachment{Behavior: behavior.SoftDeletable, Entity: "Order"}, r, "phase-0")
	if !errors.Is(err, behavior.ErrRecordKindMismatch) {
		t.Fatalf("a record/attachment kind mismatch must error with ErrRecordKindMismatch, got %v", err)
	}
}
