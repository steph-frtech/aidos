package modeler

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
)

// ── fixtures: the canonical Customer↔Order draft (the S75 done-criterion scenario) ──

func customer() entities.Entity {
	return entities.Entity{
		Name: "Customer",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			{Name: "email", Type: entities.TypeString, Required: true},
		},
	}
}

func order(withRel bool) EntityNode {
	o := entities.Entity{
		Name: "Order",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			{Name: "total", Type: entities.TypeDecimal, Required: true},
		},
	}
	n := EntityNode{Entity: o}
	if withRel {
		n.Relations = []ref.Relation{
			{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
		}
	}
	return n
}

func customerOrderDraft() Draft {
	return Draft{
		Project: "shop",
		Nodes: []EntityNode{
			{Entity: customer()},
			order(true),
		},
	}
}

// Scenario: modéliser Customer↔Order et proposer → le modeleur produit un ChangeSet
// `proposed` (DRAFT), content-addressé, jamais APPLIED (le mur).
func TestPropose_CustomerOrder_ProducesProposedChangeSet(t *testing.T) {
	d := customerOrderDraft()
	prop, err := Propose(d, "phase-0")
	if err != nil {
		t.Fatalf("Propose Customer↔Order: %v", err)
	}
	if prop.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("changeset must be DRAFT (proposed), got %q", prop.ChangeSet.Status)
	}
	if prop.ChangeSet.ID == "" {
		t.Fatal("proposed changeset must be content-addressed (non-empty id)")
	}
	if prop.ChangeSet.SpecDelta == nil || prop.ChangeSet.MirrorDelta == nil {
		t.Fatal("a spec change must carry both a spec_delta and a mirror_delta (completeness law)")
	}
	if prop.ChangeSet.SpecDelta.Target != "entity-schema@shop" {
		t.Fatalf("spec_delta must be project-scoped, got target %q", prop.ChangeSet.SpecDelta.Target)
	}
	if prop.SchemaHash == "" {
		t.Fatal("proposal must carry the schema hash")
	}
	// the spec_delta body must round-trip to the canonical draft.
	var got Draft
	if err := json.Unmarshal(prop.ChangeSet.SpecDelta.Body, &got); err != nil {
		t.Fatalf("spec_delta body is not the canonical draft: %v", err)
	}
	if got.Project != "shop" || len(got.Nodes) != 2 {
		t.Fatalf("spec_delta body did not carry the draft: %+v", got)
	}
}

// Scenario: reject laisse le Kernel intact — Propose ne touche jamais la vérité (le
// changeset reste DRAFT ; rien n'est APPLIED). On le prouve : aucune transition vers
// APPLIED n'est produite par Propose, et le statut reste proposable/discardable.
func TestPropose_RejectLeavesKernelIntact(t *testing.T) {
	d := customerOrderDraft()
	prop, err := Propose(d, "phase-0")
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	// A reject = discard the DRAFT. The kernel never saw an apply. We assert the
	// changeset Propose produced is DRAFT (so discard is legal, KRD §44) and that the
	// apply path was NOT taken by Propose.
	if prop.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("a proposed-then-rejected changeset must still be DRAFT, got %q", prop.ChangeSet.Status)
	}
	if prop.ChangeSet.AppliedAt != nil {
		t.Fatal("Propose must NEVER apply — applied_at must be nil (the wall)")
	}
}

// Scenario: une relation vers une entité non déclarée est REFUSÉE (UNKNOWN_RELATION_TARGET),
// jamais devinée — la cible n'est pas inventée.
func TestPropose_UnknownRelationTarget_Refused(t *testing.T) {
	d := Draft{
		Project: "shop",
		Nodes: []EntityNode{
			{Entity: order(false).Entity, Relations: []ref.Relation{
				{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK},
			}},
		},
	}
	_, err := Propose(d, "phase-0")
	if err == nil {
		t.Fatal("a relation to an undeclared entity must be refused (UNKNOWN_RELATION_TARGET)")
	}
	br := BlockInvalid(err)
	if br.Code != blockCodeDraft || len(br.HowToFix) == 0 {
		t.Fatalf("refusal must be an actionable BlockReason, got %+v", br)
	}
}

// Scenario: une relation 1-N vers une entité SANS identifiant est refusée (la clé étrangère
// n'a pas de colonne à référencer) — le même garde-fou que l'EmitDDL de S74.
func TestPropose_FKTargetWithoutIdentifier_Refused(t *testing.T) {
	noID := entities.Entity{Name: "Customer", Attributes: []entities.Attribute{
		{Name: "email", Type: entities.TypeString, Required: true},
	}}
	d := Draft{
		Project: "shop",
		Nodes: []EntityNode{
			{Entity: noID},
			order(true),
		},
	}
	if _, err := Propose(d, "phase-0"); err == nil {
		t.Fatal("an FK relation to an identifier-less entity must be refused")
	}
}

// Scenario: deux éditeurs simultanés du canvas ne s'écrasent pas — chacun ajoute une
// entité ; le merge garde LES DEUX (aucune perte silencieuse, pas de last-write-wins).
func TestMergeDrafts_TwoEditorsNoOverwrite(t *testing.T) {
	base := Draft{Project: "shop", Nodes: []EntityNode{{Entity: customer()}}}
	// Editor A adds Order.
	a := Draft{Project: "shop", Nodes: []EntityNode{{Entity: customer()}, order(true)}}
	// Editor B adds Invoice (concurrently, off the same base).
	invoice := EntityNode{Entity: entities.Entity{Name: "Invoice", Attributes: []entities.Attribute{
		{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
	}}}
	b := Draft{Project: "shop", Nodes: []EntityNode{{Entity: customer()}, invoice}}

	out := MergeDrafts(base, a, b)
	names := map[string]bool{}
	for _, n := range out.Merged.Nodes {
		names[n.Entity.Name] = true
	}
	if !names["Customer"] || !names["Order"] || !names["Invoice"] {
		t.Fatalf("merge must keep BOTH editors' additions, got %v", names)
	}
	if len(out.AddedByA) != 1 || out.AddedByA[0] != "Order" {
		t.Fatalf("Order must be recorded as added by A, got %v", out.AddedByA)
	}
	if len(out.AddedByB) != 1 || out.AddedByB[0] != "Invoice" {
		t.Fatalf("Invoice must be recorded as added by B, got %v", out.AddedByB)
	}
}

// Scenario: deux éditeurs changent LE MÊME nœud différemment → un CONFLIT est SURFACÉ
// (jamais un écrasement silencieux) ; la version de B n'est pas perdue, elle est signalée.
func TestMergeDrafts_DivergentEditIsConflictNotOverwrite(t *testing.T) {
	base := Draft{Project: "shop", Nodes: []EntityNode{{Entity: customer()}}}
	custA := customer()
	custA.Attributes = append(custA.Attributes, entities.Attribute{Name: "name", Type: entities.TypeString})
	custB := customer()
	custB.Attributes = append(custB.Attributes, entities.Attribute{Name: "phone", Type: entities.TypeString})
	a := Draft{Project: "shop", Nodes: []EntityNode{{Entity: custA}}}
	b := Draft{Project: "shop", Nodes: []EntityNode{{Entity: custB}}}

	out := MergeDrafts(base, a, b)
	if len(out.Conflicts) != 1 || out.Conflicts[0] != "Customer" {
		t.Fatalf("a divergent edit on the same node must be surfaced as a conflict, got %v", out.Conflicts)
	}
}

// Scenario: présence — deux éditeurs présents se voient ; un soft-lock est advisory.
func TestPresence_TwoEditorsSeeEachOther(t *testing.T) {
	p := PresenceSet{}.
		Join(Presence{Editor: "alice", LockedNode: "Customer"}).
		Join(Presence{Editor: "bob"})
	if len(p.Editors) != 2 {
		t.Fatalf("two editors must both be present, got %d", len(p.Editors))
	}
	if holder, ok := p.LockHolder("Customer"); !ok || holder != "alice" {
		t.Fatalf("alice must hold the soft lock on Customer, got %q/%v", holder, ok)
	}
	p = p.Leave("alice")
	if len(p.Editors) != 1 || p.Editors[0].Editor != "bob" {
		t.Fatalf("after alice leaves, only bob remains, got %+v", p.Editors)
	}
}
