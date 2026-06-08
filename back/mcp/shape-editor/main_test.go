package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// The shape-editor MCP server is PURE computation (the wall): these tests prove each tool returns
// deterministically without any I/O — they mirror the S68 done-criteria at the MCP boundary.

func TestDeriveByNature(t *testing.T) {
	cases := map[string]string{"acceptance": "gherkin", "invariant": "property", "workflow": "fixture"}
	for nat, want := range cases {
		_, out, _ := derive(context.Background(), nil, deriveInput{Nature: nat})
		if !out.OK || out.Shape != want {
			t.Fatalf("derive(%q) = %+v, want shape %q", nat, out, want)
		}
	}
	_, out, _ := derive(context.Background(), nil, deriveInput{Nature: "nope"})
	if out.OK {
		t.Fatal("unknown nature must be refused at the MCP boundary")
	}
}

func TestParseShape(t *testing.T) {
	_, out, _ := parse(context.Background(), nil, parseInput{Shape: "fixture", Source: "fixture: f\nstate: s\ncommand: c\nevent: e"})
	if !out.OK || out.Spec.Command != "c" {
		t.Fatalf("parse fixture failed: %+v", out)
	}
	_, bad, _ := parse(context.Background(), nil, parseInput{Shape: "fixture", Source: "garbage"})
	if bad.OK {
		t.Fatal("an unparseable source must be refused")
	}
}

func TestMergeLocksOnClash(t *testing.T) {
	d, _ := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order", Version: "v1"}, shapeeditor.NatureWorkflow)
	ta, tb := "A", "B"
	_, out, _ := merge(context.Background(), nil, mergeInput{
		Draft: d,
		A:     editInput{Author: "alice", BaseVersion: 0, Title: &ta},
		B:     editInput{Author: "bob", BaseVersion: 0, Title: &tb},
	})
	if out.OK || !out.Locked || len(out.Conflicts) != 1 {
		t.Fatalf("same-field clash must lock with one conflict, got %+v", out)
	}
	// The draft is NOT advanced — no last-write-wins.
	if out.Merged.Version != 0 {
		t.Fatalf("a lock must not advance the draft, got v=%d", out.Merged.Version)
	}
}

func TestMergeDisjoint(t *testing.T) {
	d, _ := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order", Version: "v1"}, shapeeditor.NatureWorkflow)
	title := "T"
	src := "fixture: f\nstate: s\ncommand: c\nevent: e"
	_, out, _ := merge(context.Background(), nil, mergeInput{
		Draft: d,
		A:     editInput{Author: "alice", BaseVersion: 0, Title: &title},
		B:     editInput{Author: "bob", BaseVersion: 0, Source: &src},
	})
	if !out.OK || out.Merged.Version != 1 || out.Merged.Title != "T" || out.Merged.Source == "" {
		t.Fatalf("disjoint edits must merge both, got %+v", out)
	}
}

func TestProposeRedDraftNoWrite(t *testing.T) {
	d, _ := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order.discount", Version: "v1"}, shapeeditor.NatureWorkflow)
	d.Source = "fixture: discount\nstate: cart\ncommand: apply\nevent: applied"
	_, out, _ := propose(context.Background(), nil, proposeInput{Draft: d, ParentPhase: "phase-0"})
	if !out.OK {
		t.Fatalf("propose failed: %s", out.Error)
	}
	if out.WroteMirror {
		t.Fatal("WALL VIOLATION: WroteMirror=true")
	}
	if out.ChangeSetStatus != "DRAFT" {
		t.Fatalf("changeset must be DRAFT, got %q", out.ChangeSetStatus)
	}
	if !out.Red || out.Liveness != "dead" {
		t.Fatalf("the authored mirror must be born red, got red=%v liveness=%q", out.Red, out.Liveness)
	}
	if out.ProjectID != "proj-1" || out.MirrorID == "" {
		t.Fatalf("mirror must be project-scoped + content-addressed, got %+v", out)
	}
}
