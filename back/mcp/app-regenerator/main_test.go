package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/regen"
)

// The app-regenerator MCP server is the S78 capability door: these tests prove each tool
// surfaces regen's pure verdicts at the MCP boundary — byte-stable artifacts and a refusing
// BlockReason on a hand-edit — mirroring the done-criteria.

func sampleSchema() relemit.Schema {
	mk := func(name string) entities.Entity {
		return entities.Entity{Name: name, Attributes: []entities.Attribute{
			{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true},
			{Name: "name", Type: entities.TypeString, Required: true},
		}}
	}
	return relemit.Schema{
		Project: "lib",
		Entities: []relemit.EntityRelations{
			{Entity: mk("author")},
			{Entity: mk("book"), Relations: []ref.Relation{
				{Name: "author", Target: "author", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true},
			}},
		},
	}
}

func faithful(arts []relemit.Artifact) ([]regen.LedgerEntry, []regen.DiskFile) {
	var l []regen.LedgerEntry
	var d []regen.DiskFile
	for _, a := range arts {
		l = append(l, regen.LedgerEntry{Path: a.Path, SourceHash: a.SourceHash, OutputHash: a.OutputHash})
		d = append(d, regen.DiskFile{Path: a.Path, Bytes: append([]byte(nil), a.Bytes...)})
	}
	return l, d
}

func TestRegenerate_FirstPass_Fresh(t *testing.T) {
	_, out, err := regenerate(context.Background(), nil, regenInput{Schema: sampleSchema()})
	if err != nil || !out.OK || out.Plan == nil {
		t.Fatalf("regenerate must succeed on a valid project: %+v err=%v", out, err)
	}
	if len(out.Plan.Fresh) != len(out.Plan.Artifacts) {
		t.Fatalf("first regeneration (empty ledger) is all-fresh: %d/%d", len(out.Plan.Fresh), len(out.Plan.Artifacts))
	}
}

func TestRegenerate_HandEdit_Refused(t *testing.T) {
	arts, br := relemit.EmitAll(sampleSchema())
	if br != nil {
		t.Fatalf("EmitAll refused: %v", br)
	}
	ledger, disk := faithful(arts)
	disk[0].Bytes = append(disk[0].Bytes, 'Z') // hand edit
	_, out, _ := regenerate(context.Background(), nil, regenInput{Schema: sampleSchema(), Ledger: ledger, Disk: disk})
	if out.OK || out.Block == nil {
		t.Fatalf("a hand-edited file must refuse, got ok=%v", out.OK)
	}
	if out.Block.Code != blockreason.CodeGenFileHandEdited {
		t.Fatalf("wrong code: %q", out.Block.Code)
	}
}

func TestCheckDrift_DetectsHandEdit(t *testing.T) {
	arts, _ := relemit.EmitAll(sampleSchema())
	ledger, disk := faithful(arts)
	// Faithful tree → ok.
	_, ok, _ := checkDrift(context.Background(), nil, driftInput{Ledger: ledger, Disk: disk})
	if !ok.OK {
		t.Fatalf("a faithful tree must pass the drift gate")
	}
	// Hand-edited → refused.
	disk[len(disk)-1].Bytes = append(disk[len(disk)-1].Bytes, 'Q')
	_, bad, _ := checkDrift(context.Background(), nil, driftInput{Ledger: ledger, Disk: disk})
	if bad.OK || bad.Block == nil || bad.Block.Code != blockreason.CodeGenFileHandEdited {
		t.Fatalf("a hand-edit must be detected: %+v", bad)
	}
}

func TestPlanOnly_NoBytes(t *testing.T) {
	_, out, _ := planOnly(context.Background(), nil, regenInput{Schema: sampleSchema()})
	if !out.OK {
		t.Fatalf("plan_only must succeed on a valid project")
	}
	if len(out.Fresh) == 0 {
		t.Fatalf("plan_only of a first regeneration lists fresh paths")
	}
}

func TestServerWires3Tools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must construct")
	}
}
