package learnsrv

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// The learn MCP server is the S107 capability door (the wall: read-only on the kernel). These
// tests prove the tools close the §S107 loop deterministically at the MCP boundary — the
// done-criterion: incident → draft idea (provenance=incident) → approved mirror → hash bump →
// targeted red wave ; the wall always refuses ; nothing learns its own fitness. The Target is the
// DISPATCH-SAFE targetIn (spec_body as an OBJECT, not a json.RawMessage — the S59 scar guard).

func createOrderTarget() targetIn {
	return targetIn{
		Kind:     string(learn.TargetOperation),
		ID:       "op-createOrder",
		Version:  "v1",
		SpecBody: map[string]any{"kind": "operation", "name": "createOrder"},
	}
}

func approvedMirror(t targetIn) learn.ApprovedMirror {
	return learn.ApprovedMirror{
		MirrorID: "mir-out-of-stock-during-checkout",
		Reflects: links.Ref{ID: t.ID, Version: t.Version},
	}
}

func incident(t *testing.T) reality.Incident {
	t.Helper()
	inc, err := reality.Observe(reality.ObserveInput{
		Ref:         "#1042",
		Signal:      reality.Signal{Operation: "createOrder", Error: "30% fail: out-of-stock", Recurrence: 3},
		CauseSketch: "createOrder should refuse when out-of-stock",
		Taint:       []firewall.Taint{firewall.TaintIncidentDerived},
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	return inc
}

func mirrorEdges() []redwave.Edge {
	return []redwave.Edge{{
		Link: links.Link{
			Kind: links.KindMirrors,
			From: links.Ref{ID: "mir-out-of-stock-during-checkout", Version: "v1"},
			To:   links.Ref{ID: "op-createOrder", Version: "v1"},
		},
		LoadBearing: true,
		Layer:       redwave.LayerMirror,
	}}
}

func TestBumpHashTool_ChangesAddress(t *testing.T) {
	tgt := createOrderTarget()
	_, out, err := bumpHash(context.Background(), nil, bumpInput{Target: tgt, Mirror: approvedMirror(tgt)})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !out.Bump.Moved || out.Bump.Before == out.Bump.After {
		t.Errorf("the reflection must move the address: %+v", out.Bump)
	}
}

func TestTargetedWaveTool_MirrorFirst(t *testing.T) {
	tgt := createOrderTarget()
	_, bo, err := bumpHash(context.Background(), nil, bumpInput{Target: tgt, Mirror: approvedMirror(tgt)})
	if err != nil {
		t.Fatalf("bump: %v", err)
	}
	_, out, err := targetedWave(context.Background(), nil, waveInput{
		Bump:  bo.Bump,
		Edges: mirrorEdges(),
		Heads: links.Heads{"op-createOrder": "v2"},
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Wave.IsEmpty() {
		t.Fatal("a moved bump must seed a targeted red wave")
	}
	if out.Wave.Items[0].Layer != redwave.LayerMirror {
		t.Errorf("wave must be mirror-first: %q", out.Wave.Items[0].Layer)
	}
}

func TestCloseLoopTool_IncidentToWaveProvenanceIncidentNoKernelWrite(t *testing.T) {
	tgt := createOrderTarget()
	_, out, err := closeLoop(context.Background(), nil, closeInput{
		Incident: incident(t),
		Mirror:   approvedMirror(tgt),
		Target:   tgt,
		Edges:    mirrorEdges(),
		Heads:    links.Heads{"op-createOrder": "v2"},
	})
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if out.Outcome.Candidate.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Errorf("provenance must be incident: %q", out.Outcome.Candidate.Idea.Provenance.Source)
	}
	if out.Outcome.WroteKernel || out.Outcome.Candidate.WroteKernel {
		t.Error("the loop must NOT write the kernel")
	}
	if !out.Outcome.Bump.Moved {
		t.Error("the operation hash must bump")
	}
	if out.Outcome.Wave.IsEmpty() {
		t.Error("a targeted red wave must become the worklist")
	}
	if out.Outcome.Wall.Code != blockreason.CodeRealityCannotDeclareTruth {
		t.Errorf("the wall must hold: %q", out.Outcome.Wall.Code)
	}
}

func TestNewMCPServer_Builds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("nil server")
	}
}
