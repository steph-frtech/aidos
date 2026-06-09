package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/steph-frtech/aidos/back/runtime/federation"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// The federation MCP server is the S103 capability door (the wall: read-only). These tests
// prove each tool returns the §51 composition deterministically at the MCP boundary.

func sampleSaga() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-order-payment",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{Cell: "order", Commits: []sagas.EventName{"order_confirmed"}, Compensation: []links.Ref{{ID: "cancelOrder", Version: "v2"}}},
			{Cell: "payment", Commits: []sagas.EventName{"payment_captured"}, Compensation: []links.Ref{{ID: "refundPayment", Version: "v3"}}},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
	}
}

func TestSagaOverCellsTool_BrokenLegCompensates(t *testing.T) {
	fed := cell.Federation{Contracts: []cell.Contract{{A: "order", B: "payment", Honored: true}}}
	_, out, err := sagaOverCells(context.Background(), nil, sagaInput{
		Saga: sampleSaga(), Federation: fed, Trace: sagas.Trace{"payment_captured"},
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Leg != federation.LegCompensated {
		t.Fatalf("broken leg must compensate, got %q", out.Leg)
	}
}

func TestFanOutTool_NonAffectedStayGreen(t *testing.T) {
	policy := gi.GlobalInvariant{
		Name: "pii-forgettable-federation", Scope: gi.ScopeFederationPolicy,
		Cells:       []gi.CellRef{"order", "payment", "shipping"},
		Predicate:   "every_aggregate_with_pii_implements_forgettable",
		BlastRadius: gi.BlastRadiusGlobal, ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
	staleEdge := func(from, to string) redwave.Edge {
		return redwave.Edge{Link: links.Link{Kind: links.KindDerivesFrom, From: links.Ref{ID: from, Version: "v1"}, To: links.Ref{ID: to, Version: "v1"}}, LoadBearing: true, Layer: redwave.LayerProjection}
	}
	_, out, err := fanOut(context.Background(), nil, fanOutInput{
		Policy: policy, ViolatedCell: "order", PolicyWaveID: "wave-1",
		Cells: []federation.CellViolation{
			{Cell: "order", Violates: true, Bumped: []string{"OrderPII"}, Edges: []redwave.Edge{staleEdge("order-db", "OrderPII")}, Heads: links.Heads{"OrderPII": "v2"}},
			{Cell: "shipping", Violates: false, Heads: links.Heads{}},
		},
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(out.Affected) != 1 || out.Affected[0] != "order" {
		t.Fatalf("only the violating cell must be affected, got %v", out.Affected)
	}
}

func TestNewMCPServer(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must build")
	}
}
