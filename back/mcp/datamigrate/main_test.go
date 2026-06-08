package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
)

// The datamigrate MCP server is a PURE planner (the wall): these tests prove each tool
// returns deterministically without I/O, mirroring the S95 done-criteria at the MCP boundary.

func backfill() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

func renameChange(scope *db.DataTruthScope) datamigrate.Change {
	return datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindRename,
		Rename: &datamigrate.RenameChange{Entity: "order", From: "ref", To: "reference", Type: "text"},
		Scope:  scope,
	}
}

func TestPlanTool_Accepts(t *testing.T) {
	_, out, err := planTool(context.Background(), nil, planInput{Change: renameChange(backfill())})
	if err != nil || !out.OK || out.Plan == nil {
		t.Fatalf("plan refused a valid rename: ok=%v block=%v err=%v", out.OK, out.Block, err)
	}
	if len(out.Plan.Steps) != 3 || out.Plan.Steps[1].Stage != "backfill" {
		t.Fatalf("plan does not stage backfill: %+v", out.Plan.Steps)
	}
	if !out.Plan.PreservesAllData {
		t.Fatalf("plan does not preserve all data")
	}
}

func TestPlanTool_RefusesNoBackfill(t *testing.T) {
	_, out, err := planTool(context.Background(), nil, planInput{Change: renameChange(nil)})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.OK || out.Block == nil {
		t.Fatalf("breaking change with no backfill was not refused: %+v", out)
	}
	if out.Block.Code != blockreason.CodeBreakingMigrationNoBackfill {
		t.Fatalf("refusal code = %q, want %q", out.Block.Code, blockreason.CodeBreakingMigrationNoBackfill)
	}
}

func TestPlanTool_Reproducible(t *testing.T) {
	c := renameChange(backfill())
	_, a, _ := planTool(context.Background(), nil, planInput{Change: c})
	_, b, _ := planTool(context.Background(), nil, planInput{Change: c})
	if a.Plan == nil || b.Plan == nil || a.Plan.ID != b.Plan.ID {
		t.Fatalf("non-reproducible plan id")
	}
}

func TestKindsTool(t *testing.T) {
	_, out, err := kindsTool(context.Background(), nil, struct{}{})
	if err != nil || !out.OK || len(out.Kinds) != 3 {
		t.Fatalf("kinds tool: %+v err=%v", out, err)
	}
}

func TestGateTool(t *testing.T) {
	_, ok, _ := gateTool(context.Background(), nil, gateInput{Change: renameChange(backfill())})
	if !ok.Allowed {
		t.Fatalf("valid backfill should be allowed")
	}
	_, no, _ := gateTool(context.Background(), nil, gateInput{Change: renameChange(nil)})
	if no.Allowed || no.Block == nil {
		t.Fatalf("breaking-no-backfill should be refused by the gate")
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}
