package main

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/projectevolve"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/realityingest"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// The reality-evolution MCP server is the S109 per-project COCKPIT capability door (the wall:
// read-only on the kernel). These tests prove the tools COMPOSE the §S106/§S107/§S108 engines
// deterministically at the MCP boundary — the done-criterion: INGEST an incident → APPROVE the
// learned mirror → the red wave APPEARS ; the wall always refuses ; the mirror-breaker is never
// an élite (anti-Goodhart) ; a promotion writes no truth.

const projectID = "shop-42"

func divergentReport() realityingest.TelemetryReport {
	return realityingest.TelemetryReport{Operation: "createOrder", Calls: 1000, Errors: 300, P99Ms: 220}
}

func healthyReport() realityingest.TelemetryReport {
	return realityingest.TelemetryReport{Operation: "createOrder", Calls: 1000, Errors: 0, P99Ms: 220}
}

func expectation() realityingest.MirrorExpectation {
	return realityingest.MirrorExpectation{MirrorRef: "createOrder-succeeds", Operation: "createOrder", MaxErrorRate: 0, MaxP99Ms: 500}
}

func target() learn.Target {
	return learn.Target{
		Kind:     learn.TargetOperation,
		ID:       "op-createOrder",
		Version:  "v1",
		SpecBody: json.RawMessage(`{"kind":"operation","name":"createOrder"}`),
	}
}

func approvedMirror(t learn.Target) learn.ApprovedMirror {
	return learn.ApprovedMirror{MirrorID: "mir-out-of-stock-during-checkout", Reflects: t.Ref()}
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

func journeyInput() closeRealityInput {
	tgt := target()
	return closeRealityInput{
		ProjectID:   projectID,
		Report:      divergentReport(),
		Expectation: expectation(),
		Mirror:      approvedMirror(tgt),
		Target:      tgt,
		Edges:       mirrorEdges(),
		Heads:       links.Heads{"op-createOrder": "v2"},
	}
}

// TestCloseRealityTool_RedWaveAppears is the §S109 done-criterion at the MCP boundary: ingest an
// incident → approve the learned mirror → the red wave APPEARS.
func TestCloseRealityTool_RedWaveAppears(t *testing.T) {
	_, out, err := closeReality(context.Background(), nil, journeyInput())
	if err != nil {
		t.Fatalf("close_reality: %v", err)
	}
	if !out.Diverged {
		t.Fatal("the out-of-stock report must diverge")
	}
	if out.Draft == nil || out.Learn == nil {
		t.Fatal("a divergence must carry both the draft (S106) and the loop-closure (S107)")
	}
	if !out.RedWaveAppeared || out.RedWaveCount == 0 {
		t.Fatalf("the red wave must APPEAR (done-criterion): %+v", out)
	}
	if out.WroteKernel {
		t.Fatal("the cockpit must never write the kernel (the wall)")
	}
}

// TestCloseRealityTool_HealthyNoLearning: a within-promise report ingests nothing, learns nothing.
func TestCloseRealityTool_HealthyNoLearning(t *testing.T) {
	in := journeyInput()
	in.Report = healthyReport()
	_, out, err := closeReality(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("close_reality: %v", err)
	}
	if out.Diverged || out.RedWaveAppeared || out.Draft != nil || out.Learn != nil {
		t.Fatalf("a healthy app must not diverge or learn: %+v", out)
	}
}

// TestCloseRealityTool_Deterministic: same input ⇒ byte-identical output.
func TestCloseRealityTool_Deterministic(t *testing.T) {
	_, a, _ := closeReality(context.Background(), nil, journeyInput())
	_, b, _ := closeReality(context.Background(), nil, journeyInput())
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatal("close_reality must be deterministic")
	}
}

func fixedMirror() projectevolve.FixedMirror {
	return projectevolve.FixedMirror{ProjectID: projectID, MirrorID: "mir-createOrder-succeeds", Behavior: "createOrder succeeds"}
}

func variants() []projectevolve.Variant {
	return []projectevolve.Variant{
		{ProjectID: projectID, ID: "var-fast-green", Niche: "fast", Mirror: "green", OutOfSample: "green", Fitness: 0.82},
		{ProjectID: projectID, ID: "var-fast-breaker", Niche: "fast", Mirror: "red", OutOfSample: "green", Fitness: 0.99},
	}
}

// TestCockpitElitesTool_MirrorBreakerNeverElite: the higher-fitness mirror-breaker is never an élite.
func TestCockpitElitesTool_MirrorBreakerNeverElite(t *testing.T) {
	_, out, err := cockpitElites(context.Background(), nil, elitesInput{Mirror: fixedMirror(), Variants: variants()})
	if err != nil {
		t.Fatalf("cockpit_elites: %v", err)
	}
	for _, e := range out.Elites {
		if e.VariantID == "var-fast-breaker" {
			t.Fatal("the mirror-breaker must NEVER be an élite (anti-Goodhart)")
		}
		if e.Mirror != "green" {
			t.Errorf("every élite must be green: %+v", e)
		}
	}
}

// TestPromoteEliteTool_WritesNoTruth: a green élite with authority → a PROPOSAL that writes no truth.
func TestPromoteEliteTool_WritesNoTruth(t *testing.T) {
	v := variants()[0] // var-fast-green
	_, out, err := promoteElite(context.Background(), nil, promoteInput{Mirror: fixedMirror(), Variant: v, AuthorityApproved: true})
	if err != nil {
		t.Fatalf("promote_elite: %v", err)
	}
	if out.Result.Verdict != projectevolve.PromotionProposed {
		t.Fatalf("a green élite with authority must be PROPOSED: %+v", out.Result)
	}
	if out.Result.BlockReason != nil {
		t.Fatal("a promotion must write no truth (no SANDBOX_CANNOT_GOVERN) — the human freezes at /goal")
	}
}
