package behavior_test

// CE04 — the behavior-macro EXPANSION fixture mirror (§24.6). state → command → events:
//
//	state   (a behavior attached to an entity: ownable on "Order")
//	  → command (Expand — the pure dry-run)
//	  → events (the attributes / relations / operations / policies / fixtures it implies,
//	            ExpansionID set, WroteKernel=false)
//
// Asserts the canonical §24.6 example ("le boilerplate owner-scoping") and the wall.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/behavior"
)

func TestExpand_Ownable_OnOrder_OwnerScopingBoilerplate(t *testing.T) {
	e, err := behavior.Expand(behavior.Attachment{Behavior: behavior.Ownable, Entity: "Order"})
	if err != nil {
		t.Fatalf("Expand(ownable, Order) errored: %v", err)
	}
	if e.Behavior != behavior.Ownable || e.Entity != "Order" {
		t.Fatalf("expansion echoes wrong attachment: %q / %q", e.Behavior, e.Entity)
	}
	// Attribute: owner_id (the §24.6 owner-scoping field).
	if len(e.Attributes) != 1 || e.Attributes[0].Name != "owner_id" || !e.Attributes[0].Required {
		t.Fatalf("ownable must expand a required owner_id attribute, got %+v", e.Attributes)
	}
	// Relation: owner → User.
	if len(e.Relations) != 1 || e.Relations[0].Target != "User" {
		t.Fatalf("ownable must expand an owner→User relation, got %+v", e.Relations)
	}
	// Policy: the ownership scoping (OPERATION-scoped DENY).
	if len(e.Policies) != 1 || e.Policies[0].Name != "owner-scoping" || e.Policies[0].Effect != "DENY" {
		t.Fatalf("ownable must expand the owner-scoping policy, got %+v", e.Policies)
	}
	// Fixtures: the proof obligations the macro implies.
	if len(e.Fixtures) != 2 {
		t.Fatalf("ownable must expand 2 fixtures, got %d", len(e.Fixtures))
	}
	// THE WALL.
	if e.WroteKernel {
		t.Fatal("WALL VIOLATION: a dry-run expansion wrote kernel truth")
	}
	if e.ExpansionID == "" {
		t.Fatal("expansion has no content-address id")
	}
}

func TestExpand_UnknownBehavior_Rejected(t *testing.T) {
	_, err := behavior.Expand(behavior.Attachment{Behavior: "telepathic", Entity: "Order"})
	if !errors.Is(err, behavior.ErrUnknownBehavior) {
		t.Fatalf("an unknown behavior must error with ErrUnknownBehavior, got %v", err)
	}
}

func TestExpand_NoEntity_Rejected(t *testing.T) {
	_, err := behavior.Expand(behavior.Attachment{Behavior: behavior.Ownable, Entity: ""})
	if !errors.Is(err, behavior.ErrNoEntity) {
		t.Fatalf("an entity-less attachment must error with ErrNoEntity, got %v", err)
	}
}

func TestExpand_AlreadyHasOwnerId_IdempotentSkip(t *testing.T) {
	// The entity already carries owner_id (e.g. a prior ownable attach) → the attribute is
	// NOT re-emitted, but the still-missing pieces (relation, policy, fixtures) are.
	e, err := behavior.Expand(behavior.Attachment{
		Behavior: behavior.Ownable,
		Entity:   "Order",
		Existing: behavior.Shape{Attributes: []string{"owner_id"}},
	})
	if err != nil {
		t.Fatalf("Expand errored: %v", err)
	}
	if len(e.Attributes) != 0 {
		t.Fatalf("owner_id already present ⇒ no attribute re-emitted, got %+v", e.Attributes)
	}
	if len(e.Relations) != 1 || len(e.Policies) != 1 {
		t.Fatalf("the missing relation+policy must still expand, got rel=%d pol=%d", len(e.Relations), len(e.Policies))
	}
}

func TestExpand_SoftDeletable_ArchiveSurface(t *testing.T) {
	e, err := behavior.Expand(behavior.Attachment{Behavior: behavior.SoftDeletable, Entity: "Document"})
	if err != nil {
		t.Fatalf("Expand errored: %v", err)
	}
	if len(e.Attributes) != 1 || e.Attributes[0].Name != "deleted_at" || e.Attributes[0].Required {
		t.Fatalf("soft-deletable must expand a nullable deleted_at, got %+v", e.Attributes)
	}
	var hasArchive bool
	for _, op := range e.Operations {
		if op.Name == "archive" {
			hasArchive = true
		}
	}
	if !hasArchive {
		t.Fatalf("soft-deletable must expand an archive operation, got %+v", e.Operations)
	}
}
