package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
)

// The arch-fitness MCP server is a PURE plane (the wall): each tool returns deterministically
// without I/O, mirroring the S102 done-criterion at the MCP boundary — a new boundary
// violation or inter-cell cycle BREAKS the ratchet and blocks the cut.

func cleanCut() archfitness.DepGraph {
	return archfitness.DepGraph{
		Project: "shop",
		Cells:   map[cell.Ref]int{"checkout": 5, "billing": 3},
		Federation: cell.Federation{Contracts: []cell.Contract{
			{A: "checkout", B: "billing", Honored: true},
		}},
		Edges: []archfitness.DepEdge{
			{From: "checkout.place", FromCell: "checkout", To: "billing.charge", ToCell: "billing"},
		},
	}
}

func TestMeasureTool_CleanCut(t *testing.T) {
	_, out, _ := measureTool(context.Background(), nil, measureInput{Graph: cleanCut()})
	if !out.OK || out.Metric.BoundaryViolations != 0 || out.Metric.InterCellCycles != 0 {
		t.Fatalf("clean cut must measure 0 violations / 0 cycles: %+v", out.Metric)
	}
}

func TestRatchetTool_HeldAndBroken(t *testing.T) {
	base := archfitness.StructuralMetric{BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 1, MaxCellComplexity: 5}
	_, held, _ := ratchetTool(context.Background(), nil, ratchetInput{Baseline: base, Candidate: base})
	if held.Verdict.State != archfitness.StateHeld {
		t.Fatalf("identical cut must HOLD: %+v", held.Verdict)
	}
	worse := base
	worse.BoundaryViolations = 1
	_, broken, _ := ratchetTool(context.Background(), nil, ratchetInput{Baseline: base, Candidate: worse})
	if broken.Verdict.State != archfitness.StateBroken || broken.Verdict.Block == nil {
		t.Fatalf("a new boundary violation must BREAK with a block: %+v", broken.Verdict)
	}
}

// gate proves the done-criterion at the MCP boundary: a candidate cut that introduces a NEW
// boundary violation (an uncontracted cross-cell edge) is BROKEN, blocking the cut.
func TestGateTool_NewViolationBlocksCut(t *testing.T) {
	base := archfitness.StructuralMetric{Project: "shop", BoundaryViolations: 0, InterCellCycles: 0, InterBCEdges: 1, MaxCellComplexity: 5}
	candidate := cleanCut()
	// add an uncontracted edge checkout->catalog (no honored pair): a NEW boundary violation.
	candidate.Cells["catalog"] = 4
	candidate.Edges = append(candidate.Edges, archfitness.DepEdge{
		From: "checkout.price", FromCell: "checkout", To: "catalog.lookup", ToCell: "catalog",
	})
	_, out, _ := gateTool(context.Background(), nil, gateInput{Candidate: candidate, Baseline: base})
	if out.Metric.BoundaryViolations != 1 {
		t.Fatalf("gate must measure the new violation: %+v", out.Metric)
	}
	if out.Verdict.State != archfitness.StateBroken {
		t.Fatalf("gate must BREAK on the new violation (blocks the cut): %+v", out.Verdict)
	}
}

func TestProposeTool_DraftEnvelope(t *testing.T) {
	base := archfitness.StructuralMetric{Project: "shop", InterBCEdges: 1, MaxCellComplexity: 5}
	_, out, _ := proposeTool(context.Background(), nil, proposeInput{Graph: cleanCut(), Baseline: base, Label: "baseline", ParentPhase: "phase-0"})
	if !out.OK || out.ChangeSet.Status != "DRAFT" || out.ChangeSet.SpecDelta == nil || out.ChangeSet.MirrorDelta == nil {
		t.Fatalf("propose must return a well-formed DRAFT envelope: %+v err=%q", out.ChangeSet, out.Error)
	}
}
