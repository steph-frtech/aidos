package main

import (
	"context"
	"testing"
)

// The behavior-capture MCP server is PURE computation (the wall): these tests prove each tool
// returns deterministically without any I/O. They mirror the S67 done-criterion at the MCP
// boundary — the surfaced library is the S76 catalogue, an attach produces a DRAFT ChangeSet
// proposal carrying S76's expansion byte-identically, and writes nothing.

func ownableAttach(ideaRef string) attachInput {
	return attachInput{
		IdeaRef:     ideaRef,
		Behavior:    "ownable",
		Entity:      "Order",
		ParentPhase: "phase-0",
	}
}

func TestBehaviorLibraryIsS76Catalogue(t *testing.T) {
	_, out, err := library(context.Background(), nil, libraryInput{})
	if err != nil {
		t.Fatalf("library: %v", err)
	}
	// The S76 catalogue, canonical order: ownable, soft-deletable, auditable.
	want := []string{"ownable", "soft-deletable", "auditable"}
	if len(out.Behaviors) != len(want) {
		t.Fatalf("library size %d, want %d", len(out.Behaviors), len(want))
	}
	for i := range want {
		if out.Behaviors[i] != want[i] {
			t.Fatalf("library[%d] = %q, want %q", i, out.Behaviors[i], want[i])
		}
	}
}

func TestAttachProducesDraftProposal(t *testing.T) {
	_, out, err := attach(context.Background(), nil, ownableAttach("idea-001"))
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if !out.OK {
		t.Fatalf("attach refused: %s", out.Error)
	}
	if out.ChangeSetMode != "DRAFT" {
		t.Fatalf("proposal must be DRAFT, got %q", out.ChangeSetMode)
	}
	if out.WroteKernel {
		t.Fatal("WALL VIOLATION: WroteKernel=true")
	}
	if out.ExpansionID == "" || out.ChangeSetRef == "" || out.ProposalID == "" {
		t.Fatal("proposal must be content-addressed (expansion + changeset + proposal ids)")
	}
	if out.Entity != "Order" || out.Behavior != "ownable" {
		t.Fatalf("proposal echoes wrong attachment: %q / %q", out.Behavior, out.Entity)
	}
	// The §24.6 owner-scoping boilerplate (deferred to S76).
	if len(out.Pieces.Attributes) != 1 || out.Pieces.Attributes[0].Name != "owner_id" {
		t.Fatalf("ownable must propose owner_id, got %+v", out.Pieces.Attributes)
	}
	if len(out.Pieces.Policies) != 1 || out.Pieces.Policies[0].Name != "owner-scoping" {
		t.Fatalf("ownable must propose owner-scoping, got %+v", out.Pieces.Policies)
	}
	if out.PieceCount == 0 || len(out.Preview) == 0 {
		t.Fatal("proposal must expose a non-empty piece count + preview")
	}
}

func TestAttachDeterministic(t *testing.T) {
	_, a, _ := attach(context.Background(), nil, ownableAttach("idea-001"))
	_, b, _ := attach(context.Background(), nil, ownableAttach("idea-001"))
	if a.ProposalID != b.ProposalID || a.ExpansionID != b.ExpansionID || a.ChangeSetRef != b.ChangeSetRef {
		t.Fatal("non-deterministic attach: ids diverged across identical inputs")
	}
}

func TestAttachNoIdeaRefused(t *testing.T) {
	in := ownableAttach("")
	_, out, err := attach(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("attach: %v", err)
	}
	if out.OK {
		t.Fatal("an attach with no captured idea must be refused")
	}
	if out.Error == "" {
		t.Fatal("a refusal must carry an actionable message")
	}
}

func TestAttachUnknownBehaviorRefusedByS76(t *testing.T) {
	in := ownableAttach("idea-001")
	in.Behavior = "telepathic"
	_, out, _ := attach(context.Background(), nil, in)
	if out.OK {
		t.Fatal("an unknown behavior must be refused (S76's error)")
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
