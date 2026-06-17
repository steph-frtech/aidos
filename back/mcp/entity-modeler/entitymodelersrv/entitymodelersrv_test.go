package entitymodelersrv

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/modeler"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
)

// The entity-modeler MCP server is PURE computation (the wall): these tests prove each tool
// returns deterministically without any I/O, mirroring the S75 done-criteria at the MCP
// boundary — a Customer↔Order draft proposes a `proposed` (DRAFT) changeset, an unknown
// relation target is refused, and two editors' drafts merge without overwrite.

func customerOrder() modeler.Draft {
	return modeler.Draft{
		Project: "shop",
		Nodes: []modeler.EntityNode{
			{Entity: entities.Entity{Name: "Customer", Attributes: []entities.Attribute{
				{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			}}},
			{Entity: entities.Entity{Name: "Order", Attributes: []entities.Attribute{
				{Name: "id", Type: entities.TypeString, Required: true, Identifier: true},
			}}, Relations: []ref.Relation{
				{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK},
			}},
		},
	}
}

func TestSchemaPropose_ProducesProposedChangeSet(t *testing.T) {
	_, out, err := propose(context.Background(), nil, proposeInput{Draft: customerOrder(), ParentPhase: "phase-0"})
	if err != nil {
		t.Fatalf("propose err: %v", err)
	}
	if !out.OK || out.ChangeSet == nil {
		t.Fatalf("Customer↔Order must propose: %+v", out)
	}
	if out.ChangeSet.Status != "DRAFT" {
		t.Fatalf("proposed changeset must be DRAFT, got %q", out.ChangeSet.Status)
	}
	if out.ChangeSet.AppliedAt != nil {
		t.Fatal("propose must never apply (the wall)")
	}
	if out.SchemaHash == "" {
		t.Fatal("propose must carry schema hash")
	}
}

func TestSchemaValidate_UnknownTargetRefused(t *testing.T) {
	d := modeler.Draft{Project: "shop", Nodes: []modeler.EntityNode{
		{Entity: entities.Entity{Name: "Order", Attributes: []entities.Attribute{{Name: "id", Type: entities.TypeString, Identifier: true}}},
			Relations: []ref.Relation{{Name: "c", Target: "Ghost", Cardinality: ref.OneToOne, Semantic: ref.FK}}},
	}}
	_, out, _ := validate(context.Background(), nil, validateInput{Draft: d})
	if out.OK || out.Block == nil {
		t.Fatalf("unknown relation target must be refused: %+v", out)
	}
	if len(out.Block.HowToFix) == 0 {
		t.Fatal("refusal must carry how_to_fix (no prison)")
	}
}

func TestSchemaHash_InputOrderInvariant(t *testing.T) {
	d := customerOrder()
	rev := modeler.Draft{Project: d.Project, Nodes: []modeler.EntityNode{d.Nodes[1], d.Nodes[0]}}
	_, h1, _ := schemaHash(context.Background(), nil, hashInput{Draft: d})
	_, h2, _ := schemaHash(context.Background(), nil, hashInput{Draft: rev})
	if !h1.OK || !h2.OK || h1.Hash != h2.Hash {
		t.Fatalf("schema hash must be input-order-invariant: %q vs %q", h1.Hash, h2.Hash)
	}
}

func TestCanvasMerge_NoOverwrite(t *testing.T) {
	base := modeler.Draft{Project: "shop", Nodes: []modeler.EntityNode{
		{Entity: entities.Entity{Name: "Customer", Attributes: []entities.Attribute{{Name: "id", Type: entities.TypeString, Identifier: true}}}},
	}}
	a := customerOrder()
	b := modeler.Draft{Project: "shop", Nodes: append([]modeler.EntityNode{base.Nodes[0]},
		modeler.EntityNode{Entity: entities.Entity{Name: "Invoice", Attributes: []entities.Attribute{{Name: "id", Type: entities.TypeString, Identifier: true}}}})}
	_, out, _ := merge(context.Background(), nil, mergeInput{Base: base, A: a, B: b})
	got := map[string]bool{}
	for _, n := range out.Merged.Nodes {
		got[n.Entity.Name] = true
	}
	if !got["Customer"] || !got["Order"] || !got["Invoice"] {
		t.Fatalf("merge must keep both editors' additions, got %v", got)
	}
}

func TestCanvasPresence_JoinLeave(t *testing.T) {
	_, j, _ := presence(context.Background(), nil, presenceInput{Op: "join", Editor: "alice", Lock: "Customer"})
	_, j2, _ := presence(context.Background(), nil, presenceInput{Current: j, Op: "join", Editor: "bob"})
	if len(j2.Editors) != 2 {
		t.Fatalf("two editors must be present, got %d", len(j2.Editors))
	}
	_, l, _ := presence(context.Background(), nil, presenceInput{Current: j2, Op: "leave", Editor: "alice"})
	if len(l.Editors) != 1 || l.Editors[0].Editor != "bob" {
		t.Fatalf("after leave only bob remains: %+v", l.Editors)
	}
}
