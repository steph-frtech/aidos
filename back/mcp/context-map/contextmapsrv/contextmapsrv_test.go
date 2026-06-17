package contextmapsrv

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/contextmap"
)

// The context-map MCP server is a PURE plane (the wall): each tool returns deterministically
// without I/O, mirroring the S101 done-criteria at the MCP boundary.

func scene() contextmap.ContextMap {
	return contextmap.ContextMap{
		Project: "shop",
		Cells:   []cell.Ref{"checkout", "billing", "catalog"},
		Surfaces: []contextmap.CellSurface{
			{Cell: "billing", Published: []contextmap.Interaction{
				{Method: "POST", Path: "/charges", Fields: []string{"amount", "orderId", "status"}, Status: 201},
			}},
			{Cell: "catalog", Published: []contextmap.Interaction{
				{Method: "GET", Path: "/items", Fields: []string{"sku"}, Status: 200},
			}},
		},
		Pairs: []contextmap.ContractPair{
			{Consumer: "checkout", Provider: "billing", Expected: []contextmap.Interaction{
				{Method: "POST", Path: "/charges", Fields: []string{"amount", "orderId"}, Status: 201},
			}},
			{Consumer: "checkout", Provider: "catalog", Expected: []contextmap.Interaction{
				{Method: "GET", Path: "/items", Fields: []string{"sku", "price"}, Status: 200},
			}},
		},
	}
}

func TestVerifyPairToolHonored(t *testing.T) {
	m := scene()
	_, out, _ := verifyPairTool(context.Background(), nil, verifyPairInput{Map: m, Pair: m.Pairs[0]})
	if !out.OK || !out.Verdict.Honored || out.Verdict.Reason != contextmap.ReasonHonored {
		t.Fatalf("checkout→billing must be HONORED: %+v", out.Verdict)
	}
}

func TestVerifyPairToolUnhonored(t *testing.T) {
	m := scene()
	_, out, _ := verifyPairTool(context.Background(), nil, verifyPairInput{Map: m, Pair: m.Pairs[1]})
	if out.Verdict.Honored || out.Verdict.Reason != contextmap.ReasonFieldUnpublished {
		t.Fatalf("checkout→catalog must be UNHONORED (field unpublished): %+v", out.Verdict)
	}
}

func TestVerifyAllTool(t *testing.T) {
	_, out, _ := verifyAllTool(context.Background(), nil, verifyAllInput{Map: scene()})
	if !out.OK || len(out.Verdicts) != 2 {
		t.Fatalf("verify_all wrong: %+v", out)
	}
}

func TestCheckCallTool(t *testing.T) {
	m := scene()
	_, refused, _ := checkCallTool(context.Background(), nil, checkCallInput{From: "checkout", To: "catalog", Map: m})
	if refused.Allowed || refused.Block == nil || refused.Block.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("checkout→catalog (unhonored) not refused: %+v", refused)
	}
	_, allowed, _ := checkCallTool(context.Background(), nil, checkCallInput{From: "checkout", To: "billing", Map: m})
	if !allowed.Allowed || allowed.Block != nil {
		t.Fatalf("checkout→billing (honored) not allowed: %+v", allowed)
	}
}

func TestProposeTool(t *testing.T) {
	_, out, _ := proposeTool(context.Background(), nil, proposeInput{Map: scene(), Label: "design shop", ParentPhase: "phase-0"})
	if !out.OK || out.ChangeSet.Status != changeset.StatusDraft || out.ChangeSet.SpecDelta == nil || out.ChangeSet.MirrorDelta == nil {
		t.Fatalf("propose must return a DRAFT with spec+mirror: %+v", out)
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("nil server")
	}
}
