package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/kernel/mirror/watch"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// The mirror-watch MCP server is PURE computation (the wall): these tests prove each tool returns
// deterministically without any I/O — they mirror the S69 done-criteria at the MCP boundary:
// materialize → run RED against absent code → run GREEN against a stub.

func gherkinProposal(t *testing.T) shapeeditor.Proposal {
	t.Helper()
	d, err := shapeeditor.OpenDraft("proj-1", records.LayerRef{LayerID: "Order.place", Version: "v1"}, shapeeditor.NatureAcceptance)
	if err != nil {
		t.Fatalf("OpenDraft: %v", err)
	}
	d.Source = "Scenario: place\nWhen I place\nThen an order exists"
	p, err := shapeeditor.ProposeMirror(d, "phase-0")
	if err != nil {
		t.Fatalf("ProposeMirror: %v", err)
	}
	return p
}

func TestWatchMaterializeAndRun(t *testing.T) {
	p := gherkinProposal(t)

	_, mout, _ := materialize(context.Background(), nil, materializeInput{Proposal: p})
	if !mout.OK || mout.TargetRunner != "godog" || mout.MaterializedSource == "" {
		t.Fatalf("materialize failed: %+v", mout)
	}

	mat := watch.MaterializedMirror{
		MirrorID:           mout.MirrorID,
		ProjectID:          mout.ProjectID,
		Reflects:           p.Mirror.Reflects,
		TargetRunner:       watch.Runner(mout.TargetRunner),
		Shape:              shapeeditor.Shape(mout.Shape),
		MaterializedSource: mout.MaterializedSource,
	}

	// absent code ⇒ RED.
	_, red, _ := run(context.Background(), nil, runInput{Materialized: mat, CodePresent: false})
	if !red.OK || !red.Red || red.Final != "dead" {
		t.Fatalf("absent code must be RED: %+v", red)
	}
	if len(red.Events) != 4 || red.Events[len(red.Events)-1].Phase != "verdict" {
		t.Fatalf("the stream must walk to a verdict: %+v", red.Events)
	}

	// stub present ⇒ GREEN.
	_, green, _ := run(context.Background(), nil, runInput{Materialized: mat, CodePresent: true})
	if !green.OK || green.Red || green.Final != "alive" {
		t.Fatalf("a stub must be GREEN: %+v", green)
	}
}

func TestWatchMaterializeRefusesEmpty(t *testing.T) {
	_, out, _ := materialize(context.Background(), nil, materializeInput{Proposal: shapeeditor.Proposal{}})
	if out.OK {
		t.Fatal("an empty proposal must be refused at the MCP boundary")
	}
}

func TestNewMCPServer(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must build")
	}
}
