package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/mirror/archfitness"
	"github.com/steph-frtech/aidos/back/runtime/cockpit"
)

// The federation-cockpit MCP server is the S105 capability door (the wall: read-only). This
// test proves the assemble_snapshot tool returns the §50 cockpit deterministically at the MCP
// boundary — the done-criterion: a green cell ships while a reddened neighbor is still red.

func twoCellInput() assembleInput {
	p := cell.Project{
		ID: "proj-shop",
		Nodes: []cell.Node{
			{ID: "order-op", Cell: "order", Kind: cell.KindLayer},
			{ID: "order-contract", Cell: "order", Kind: cell.KindContract, Public: true},
			{ID: "payment-op", Cell: "payment", Kind: cell.KindLayer},
			{ID: "payment-contract", Cell: "payment", Kind: cell.KindContract, Public: true},
		},
		Ratchets: map[cell.Ref]cell.RatchetState{"order": cell.RatchetGreen, "payment": cell.RatchetGreen},
	}
	fed := cell.Federation{Contracts: []cell.Contract{{A: "order", B: "payment", Honored: true}}}
	g := archfitness.DepGraph{Project: "proj-shop", Cells: map[cell.Ref]int{"order": 2, "payment": 2}, Federation: fed}
	return assembleInput{
		Project:  p,
		DepGraph: g,
		Baseline: archfitness.Measure(g),
		Fed:      fed,
		Wave: cockpit.FanOutSpec{
			PolicyWaveID: "wave-1",
			Cells: []cockpit.CellViolation{
				{Cell: "order", Violates: false},
				{Cell: "payment", Violates: true},
			},
		},
	}
}

func TestAssembleSnapshotTool_OneCellShipsWhileNeighborRed(t *testing.T) {
	_, out, err := assembleSnapshot(context.Background(), nil, twoCellInput())
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(out.ShippableCells) != 1 || out.ShippableCells[0] != "order" {
		t.Fatalf("only order must ship, got %v", out.ShippableCells)
	}
	if len(out.ReddenedCells) != 1 || out.ReddenedCells[0] != "payment" {
		t.Fatalf("only payment must be reddened, got %v", out.ReddenedCells)
	}
	if out.GloballyStable {
		t.Fatalf("federation must NOT be globally stable while payment is red")
	}
	if out.Structural.State != archfitness.StateHeld {
		t.Fatalf("structural ratchet must hold, got %s", out.Structural.State)
	}
}

func TestNewMCPServer(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must build")
	}
}
