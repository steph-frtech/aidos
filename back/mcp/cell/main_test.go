package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
)

// The cell MCP server is a PURE plane (the wall): these tests prove each tool returns
// deterministically without I/O, mirroring the S100 done-criteria at the MCP boundary.

func project() cell.Project {
	return cell.Project{
		ID: "shop",
		Nodes: []cell.Node{
			{ID: "ck-op", Cell: "checkout", Kind: cell.KindLayer},
			{ID: "ck-pact", Cell: "checkout", Kind: cell.KindContract, Public: true},
			{ID: "bl-op", Cell: "billing", Kind: cell.KindLayer},
			{ID: "bl-pact", Cell: "billing", Kind: cell.KindContract, Public: true},
			{ID: "cat-pact", Cell: "catalog", Kind: cell.KindContract, Public: true},
		},
		Ratchets: map[cell.Ref]cell.RatchetState{"checkout": cell.RatchetGreen, "billing": cell.RatchetRed, "catalog": cell.RatchetGreen},
	}
}

func fed() cell.Federation {
	return cell.Federation{Contracts: []cell.Contract{{A: "checkout", B: "billing", Honored: true}}}
}

func TestPartitionTool(t *testing.T) {
	_, out, err := partitionTool(context.Background(), nil, partitionInput{Project: project()})
	if err != nil || !out.OK || len(out.Cells) != 3 {
		t.Fatalf("partition failed: ok=%v cells=%d err=%v", out.OK, len(out.Cells), err)
	}
}

func TestPartitionToolRefusesUnassigned(t *testing.T) {
	p := cell.Project{ID: "x", Nodes: []cell.Node{{ID: "loose", Kind: cell.KindLayer}}}
	_, out, _ := partitionTool(context.Background(), nil, partitionInput{Project: p})
	if out.OK || out.Error == "" {
		t.Fatalf("unassigned node not refused: %+v", out)
	}
}

func TestCellPackToolExcludesNeighborInternals(t *testing.T) {
	_, out, _ := cellPackTool(context.Background(), nil, cellPackInput{Project: project(), Cell: "checkout", Federation: fed()})
	pack := out.Pack
	if cell.PackHasNeighborInternal(pack, project()) {
		t.Fatal("pack leaked a neighbor internal")
	}
	var hasBL, hasCat bool
	for _, id := range pack.NeighborContracts {
		if id == "bl-pact" {
			hasBL = true
		}
		if id == "cat-pact" {
			hasCat = true
		}
	}
	if !hasBL {
		t.Fatal("billing's public contract did not cross to a contracted neighbor")
	}
	if hasCat {
		t.Fatal("catalog's contract crossed without a contracts_with link")
	}
}

func TestCheckAccessTool(t *testing.T) {
	_, refused, _ := checkAccessTool(context.Background(), nil, checkAccessInput{From: "checkout", To: "catalog", Federation: fed()})
	if refused.Allowed || refused.Block == nil || refused.Block.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("checkout→catalog not refused CROSS_CELL_NO_CONTRACT: %+v", refused)
	}
	_, allowed, _ := checkAccessTool(context.Background(), nil, checkAccessInput{From: "checkout", To: "billing", Federation: fed()})
	if !allowed.Allowed || allowed.Block != nil {
		t.Fatalf("checkout→billing not allowed: %+v", allowed)
	}
}

func TestShippableTool(t *testing.T) {
	cells, _ := cell.Partition(project())
	_, out, _ := shippableTool(context.Background(), nil, shippableInput{Cells: cells})
	got := map[cell.Ref]bool{}
	for _, r := range out.Shippable {
		got[r] = true
	}
	if !got["checkout"] || got["billing"] || !got["catalog"] {
		t.Fatalf("fractal shipping wrong: %v", out.Shippable)
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}
