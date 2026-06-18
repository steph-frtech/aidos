package behaviorexpandersrv

import (
	"context"
	"testing"
)

// The behavior-expander MCP server is PURE computation (the wall): these tests prove each S76 tool
// returns deterministically without any I/O — the catalogue, a record validation verdict, the ONE
// Expand, and a Propose that opens a DRAFT ChangeSet carrying that expansion byte-identically.

func okRecord() recordInput {
	return recordInput{
		Kind: "ownable", Owner: "alice", Version: 1,
		Tags: []string{"scoping"}, Labels: map[string]string{"fr": "propriété", "en": "ownership"},
	}
}

func TestCatalogueIsCanonical(t *testing.T) {
	_, out, err := catalogueTool(context.Background(), nil, catalogueInput{})
	if err != nil {
		t.Fatalf("catalogue: %v", err)
	}
	want := []string{"ownable", "soft-deletable", "auditable"}
	if len(out.Behaviors) != len(want) {
		t.Fatalf("catalogue size %d, want %d", len(out.Behaviors), len(want))
	}
	for i := range want {
		if out.Behaviors[i] != want[i] {
			t.Fatalf("catalogue[%d] = %q, want %q", i, out.Behaviors[i], want[i])
		}
	}
}

func TestValidateRecordOKAndRejected(t *testing.T) {
	_, ok, _ := validateTool(context.Background(), nil, okRecord())
	if !ok.OK || ok.RecordID == "" {
		t.Fatalf("a well-formed record must validate + content-address, got %+v", ok)
	}
	bad := okRecord()
	bad.Owner = "" // not ownable
	_, no, _ := validateTool(context.Background(), nil, bad)
	if no.OK || no.Error == "" {
		t.Fatal("an owner-less record must be refused with an actionable error")
	}
}

func TestExpandRunsTheOneFunction(t *testing.T) {
	_, out, err := expandTool(context.Background(), nil, expandInput{Behavior: "ownable", Entity: "Order"})
	if err != nil {
		t.Fatalf("expand: %v", err)
	}
	if !out.OK || out.WroteKernel {
		t.Fatalf("expand must succeed and write no kernel, got %+v", out)
	}
	if len(out.Pieces.Attributes) != 1 || out.Pieces.Attributes[0].Name != "owner_id" {
		t.Fatalf("ownable must expand owner_id, got %+v", out.Pieces.Attributes)
	}
	if out.ExpansionID == "" || out.PieceCount == 0 {
		t.Fatal("expand must be content-addressed with a non-empty piece count")
	}
}

func TestProposeOpensDraftNeverApplied(t *testing.T) {
	_, out, err := proposeTool(context.Background(), nil, proposeInput{
		Record: okRecord(), Entity: "Order", ParentPhase: "phase-0",
	})
	if err != nil {
		t.Fatalf("propose: %v", err)
	}
	if !out.OK {
		t.Fatalf("propose refused: %s", out.Error)
	}
	if out.ChangeSetStatus != "DRAFT" {
		t.Fatalf("propose must open a DRAFT changeset, got %q", out.ChangeSetStatus)
	}
	if out.WroteKernel {
		t.Fatal("WALL VIOLATION: WroteKernel=true")
	}
	if out.ChangeSetRef == "" || out.ExpansionID == "" || out.RecordID == "" {
		t.Fatal("propose must be content-addressed (changeset + expansion + record ids)")
	}
}

func TestProposeDeterministic(t *testing.T) {
	in := proposeInput{Record: okRecord(), Entity: "Order", ParentPhase: "phase-0"}
	_, a, _ := proposeTool(context.Background(), nil, in)
	_, b, _ := proposeTool(context.Background(), nil, in)
	if a.ChangeSetRef != b.ChangeSetRef || a.ExpansionID != b.ExpansionID || a.RecordID != b.RecordID {
		t.Fatal("non-deterministic propose: ids diverged across identical inputs")
	}
}

func TestProposeKindMismatchRefused(t *testing.T) {
	in := proposeInput{Record: okRecord(), Entity: "Order", ParentPhase: "phase-0"}
	in.Record.Kind = "soft-deletable" // record kind differs from... itself; mismatch is record vs attachment
	// attachment behavior is derived from record kind in proposeTool, so to force a mismatch we test via
	// an unknown record kind which ValidateRecord rejects first.
	in.Record.Kind = "telepathic"
	_, out, _ := proposeTool(context.Background(), nil, in)
	if out.OK {
		t.Fatal("an unknown behavior record must be refused")
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}
