package stranglersrv

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/strangler"
	"github.com/steph-frtech/aidos/back/kernel/cell"
)

// The strangler MCP server is the S104 capability door (the wall: read-only). These tests
// prove each tool returns the §50 strangler-fig result deterministically at the MCP boundary.

func sampleLegacy() strangler.Legacy {
	return strangler.Legacy{
		Cell:              cell.Ref("billing"),
		InternalNodes:     []string{"billing.invoice"},
		PublishedContract: "billing.charge.v1",
		Observed: []strangler.Trace{
			{Name: "in-currency", Input: json.RawMessage(`{"amount":100}`), Output: json.RawMessage(`{"charged":100}`)},
			{Name: "cross-currency", Input: json.RawMessage(`{"amount":100,"currency":"USD"}`), Output: json.RawMessage(`{"charged":92}`)},
		},
	}
}

func TestCarveTool_Observable(t *testing.T) {
	_, out, err := carve(context.Background(), nil, carveInput{Legacy: sampleLegacy()})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Error != "" || out.Cell == nil {
		t.Fatalf("carve failed: %+v", out)
	}
	if out.Cell.Hash == "" {
		t.Fatal("carved cell missing content hash")
	}
}

func TestCarveTool_NoObservedBehaviourRefused(t *testing.T) {
	_, out, err := carve(context.Background(), nil, carveInput{Legacy: strangler.Legacy{Cell: cell.Ref("billing")}})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Error == "" {
		t.Fatal("a legacy with no observed behaviour must be refused")
	}
}

func TestFreezeAndRefactorTools_PreservingBehaviourAccepted(t *testing.T) {
	_, carved, _ := carve(context.Background(), nil, carveInput{Legacy: sampleLegacy()})
	_, fz, err := freeze(context.Background(), nil, freezeInput{Cell: *carved.Cell})
	if err != nil {
		t.Fatalf("freeze err: %v", err)
	}
	if len(fz.Mirrors) != 2 {
		t.Fatalf("freeze: %d mirrors, want 2", len(fz.Mirrors))
	}
	_, v, err := refactor(context.Background(), nil, refactorInput{
		Cell:    *carved.Cell,
		Mirrors: fz.Mirrors,
		Observation: strangler.RefactorObservation{
			Outputs: map[string]json.RawMessage{
				"in-currency":    json.RawMessage(`{"charged":100}`),
				"cross-currency": json.RawMessage(`{"charged":92}`),
			},
			ContractHonored: true,
		},
	})
	if err != nil {
		t.Fatalf("refactor err: %v", err)
	}
	if !v.Accepted {
		t.Fatalf("preserving refactor must be accepted: %+v", v)
	}
}

func TestRefactorTool_DriftRefused(t *testing.T) {
	_, carved, _ := carve(context.Background(), nil, carveInput{Legacy: sampleLegacy()})
	_, fz, _ := freeze(context.Background(), nil, freezeInput{Cell: *carved.Cell})
	_, v, _ := refactor(context.Background(), nil, refactorInput{
		Cell:    *carved.Cell,
		Mirrors: fz.Mirrors,
		Observation: strangler.RefactorObservation{
			Outputs: map[string]json.RawMessage{
				"in-currency":    json.RawMessage(`{"charged":100}`),
				"cross-currency": json.RawMessage(`{"charged":999}`), // drift
			},
			ContractHonored: true,
		},
	})
	if v.Accepted || v.Block == nil || v.Block.Code != strangler.CodeCharacterizationDrift {
		t.Fatalf("drift must be refused with characterization-drift block: %+v", v)
	}
}

func TestNewMCPServer(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("server must build")
	}
}
