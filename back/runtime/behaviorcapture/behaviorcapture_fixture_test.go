package behaviorcapture_test

// S67 — the ATTACH-AT-CAPTURE fixture mirror (§24.6). state → command → events:
//
//	state   (a captured idea + the reusable behaviours library surfaced; the human attaches
//	         "ownable" to entity "Order")
//	  → command (AttachBehaviorAtCapture — the pure dry-run)
//	  → events  (the §24.6 owner-scoping boilerplate as a DRAFT ChangeSet PROPOSAL — attributes/
//	            relations/operations/policies/fixtures; Status=DRAFT; WroteKernel=false)
//
// Asserts the canonical §24.6 example surfaced AT CAPTURE and the wall — the events match
// S76's expansion verbatim (one function), wrapped as a proposed (never applied) ChangeSet.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/behavior"
	"github.com/steph-frtech/aidos/back/runtime/behaviorcapture"
)

func TestAttach_Ownable_OnOrder_AtCapture_OwnerScopingProposal(t *testing.T) {
	// state → command
	p, err := behaviorcapture.AttachBehaviorAtCapture(
		"idea-capture-001",
		behaviorcapture.Attachment{Behavior: behavior.Ownable, Entity: "Order"},
		"phase-0",
	)
	if err != nil {
		t.Fatalf("attach(ownable, Order) at capture errored: %v", err)
	}

	// events — the proposal echoes the capture + the §24.6 boilerplate.
	if p.IdeaRef != "idea-capture-001" {
		t.Fatalf("proposal must carry the captured idea ref, got %q", p.IdeaRef)
	}
	if p.Expansion.Behavior != behavior.Ownable || p.Expansion.Entity != "Order" {
		t.Fatalf("expansion echoes wrong attachment: %q / %q", p.Expansion.Behavior, p.Expansion.Entity)
	}
	// The §24.6 owner-scoping pieces (deferred to S76; asserted here at the capture surface).
	if len(p.Expansion.Attributes) != 1 || p.Expansion.Attributes[0].Name != "owner_id" {
		t.Fatalf("ownable at capture must propose a required owner_id, got %+v", p.Expansion.Attributes)
	}
	if len(p.Expansion.Relations) != 1 || p.Expansion.Relations[0].Target != "User" {
		t.Fatalf("ownable at capture must propose an owner→User relation, got %+v", p.Expansion.Relations)
	}
	if len(p.Expansion.Policies) != 1 || p.Expansion.Policies[0].Name != "owner-scoping" {
		t.Fatalf("ownable at capture must propose the owner-scoping policy, got %+v", p.Expansion.Policies)
	}
	if len(p.Expansion.Fixtures) != 2 {
		t.Fatalf("ownable at capture must propose 2 fixtures, got %d", len(p.Expansion.Fixtures))
	}

	// RENDERED AS A PROPOSED CHANGESET (DRAFT, never applied).
	if p.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("the proposal must be a DRAFT ChangeSet, got %q", p.ChangeSet.Status)
	}
	if p.ChangeSet.SpecDelta == nil || p.ChangeSet.SpecDelta.Target != "Order" {
		t.Fatalf("the DRAFT spec_delta must target Order, got %+v", p.ChangeSet.SpecDelta)
	}

	// THE WALL.
	if p.Expansion.WroteKernel {
		t.Fatal("WALL VIOLATION: an attach-at-capture wrote kernel truth")
	}
	if p.ChangeSet.ID == "" || p.Expansion.ExpansionID == "" {
		t.Fatal("the proposal must be content-addressed (changeset id + expansion id)")
	}
}

func TestAttach_LibraryIsTheS76Catalogue(t *testing.T) {
	got := behaviorcapture.Library()
	want := behavior.Catalogue()
	if len(got) != len(want) {
		t.Fatalf("the surfaced library must be S76's catalogue, got %d kinds want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("library[%d] = %q, want the S76 catalogue %q (no ad-hoc list)", i, got[i], want[i])
		}
	}
}

func TestAttach_NoIdea_Rejected(t *testing.T) {
	_, err := behaviorcapture.AttachBehaviorAtCapture(
		"", behaviorcapture.Attachment{Behavior: behavior.Ownable, Entity: "Order"}, "phase-0",
	)
	if !errors.Is(err, behaviorcapture.ErrNoIdea) {
		t.Fatalf("an attach with no captured-idea ref must error ErrNoIdea, got %v", err)
	}
}

func TestAttach_UnknownBehavior_RejectedByS76(t *testing.T) {
	// The single-function law: the unknown-behavior error is S76's, not re-implemented here.
	_, err := behaviorcapture.AttachBehaviorAtCapture(
		"idea-x", behaviorcapture.Attachment{Behavior: "telepathic", Entity: "Order"}, "phase-0",
	)
	if !errors.Is(err, behavior.ErrUnknownBehavior) {
		t.Fatalf("an unknown behavior must error ErrUnknownBehavior (S76's), got %v", err)
	}
}

func TestAttach_NoEntity_RejectedByS76(t *testing.T) {
	_, err := behaviorcapture.AttachBehaviorAtCapture(
		"idea-x", behaviorcapture.Attachment{Behavior: behavior.Ownable, Entity: ""}, "phase-0",
	)
	if !errors.Is(err, behavior.ErrNoEntity) {
		t.Fatalf("an entity-less attach must error ErrNoEntity (S76's), got %v", err)
	}
}
