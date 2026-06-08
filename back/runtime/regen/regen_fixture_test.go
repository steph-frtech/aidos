// regen_fixture_test.go — the S78 WORKFLOW fixture mirror: a concrete worked example of
// « Régénérer mon app » over a small multi-entity project (Customer + Order, a relation,
// an async op), driving regen through its three observable outcomes:
//
//   - a FIRST regeneration (empty ledger) → every emitted path is Fresh, none refused;
//   - a SECOND regeneration over the faithful tree → every path Unchanged (a no-op rewrite);
//   - a regeneration over a HAND-EDITED tree → refused with GEN_FILE_HAND_EDITED.
//
// It documents the action's contract by example (the fixture form, CLAUDE.md §1 Mandat A).
package regen

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// checkoutProject is the canonical small project: a Customer, an Order that references it
// (a many-to-one relation), and one async op (an email-on-order worker). It exercises
// entities + relations + async — the full source breadth S78 regenerates.
func checkoutProject() relemit.Schema {
	customer := entities.Entity{
		Name: "customer",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "email", Type: entities.TypeString, Required: true},
		},
	}
	order := entities.Entity{
		Name: "order",
		Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "total", Type: entities.TypeDecimal, Required: true},
		},
	}
	return relemit.Schema{
		Project: "shop",
		Entities: []relemit.EntityRelations{
			{Entity: customer},
			{Entity: order, Relations: []ref.Relation{
				{Name: "buyer", Target: "customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
			}},
		},
		AsyncOps: []relemit.AsyncOp{{
			Name: "sendReceipt",
			Async: operation.Async{
				Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue},
				Effects: []operation.Effect{{Kind: operation.TriggerQueue, Target: "receipts", Payload: map[string]any{"order": "id"}}},
			},
		}},
	}
}

func TestFixture_FirstRegen_AllFresh(t *testing.T) {
	s := checkoutProject()
	plan, br := Regenerate(s, nil, nil)
	if br != nil {
		t.Fatalf("first regeneration of a valid project must not refuse: %q", br.Code)
	}
	if len(plan.Artifacts) == 0 {
		t.Fatal("a project with entities+relations+async must emit artifacts")
	}
	if len(plan.Fresh) != len(plan.Artifacts) {
		t.Fatalf("a first regeneration (empty ledger) makes every path Fresh: %d/%d",
			len(plan.Fresh), len(plan.Artifacts))
	}
	if len(plan.Stale) != 0 || len(plan.Unchanged) != 0 {
		t.Fatal("a first regeneration has no stale/unchanged paths")
	}
	// The async op emits a worker artifact (the async branch of the breadth).
	hasWorker := false
	for _, a := range plan.Artifacts {
		if a.Target == relemit.TargetWorker {
			hasWorker = true
		}
	}
	if !hasWorker {
		t.Fatal("an async op must emit a worker artifact (sync+async breadth)")
	}
}

func TestFixture_SecondRegen_AllUnchanged(t *testing.T) {
	s := checkoutProject()
	arts, br := relemit.EmitAll(s)
	if br != nil {
		t.Fatalf("EmitAll refused a valid project: %q", br.Code)
	}
	ledger := faithfulLedger(arts)
	disk := faithfulDisk(arts)
	plan, refusal := Regenerate(s, ledger, disk)
	if refusal != nil {
		t.Fatalf("a faithful tree must not refuse: %q", refusal.Code)
	}
	if len(plan.Unchanged) != len(arts) {
		t.Fatalf("a second regeneration over a faithful tree is a no-op: %d/%d unchanged",
			len(plan.Unchanged), len(arts))
	}
}

func TestFixture_HandEdit_Refused(t *testing.T) {
	s := checkoutProject()
	arts, br := relemit.EmitAll(s)
	if br != nil {
		t.Fatalf("EmitAll refused: %q", br.Code)
	}
	ledger := faithfulLedger(arts)
	disk := faithfulDisk(arts)
	// Someone hand-edited the first emitted file.
	disk[0].Bytes = append([]byte("// hand edit\n"), disk[0].Bytes...)
	plan, refusal := Regenerate(s, ledger, disk)
	if refusal == nil {
		t.Fatal("a hand-edited gen/ file must refuse the regeneration")
	}
	if refusal.Code != blockreason.CodeGenFileHandEdited {
		t.Fatalf("wrong refusal code: %q", refusal.Code)
	}
	if len(plan.Artifacts) != 0 {
		t.Fatal("a refused regeneration overwrites nothing (empty plan)")
	}
}
