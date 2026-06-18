package deploysrv

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// The deploy MCP server is a PURE pipeline (the wall): these tests prove each tool returns
// deterministically without I/O, mirroring the S96 done-criteria at the MCP boundary.

func validScope() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

func stablePhase() phases.StablePhase {
	return phases.IsStable(
		phases.Cut{"createOrder": "v1"}, nil, nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
	)
}

func sampleInput() deploy.Input {
	return deploy.Input{
		Phase:   stablePhase(),
		Gate:    deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8, MonsterCount: 0},
		Surface: preview.EmittedSurface{Project: "shop", ServerBundleHash: "srv", FrontBundleHash: "frt", InfraHash: "inf", DatastoreHash: "dst"},
		Program: honoemit.Artifact{Path: "gen/shop/infra/index.ts", Bytes: []byte("// pulumi")},
		Change: datamigrate.Change{
			Project: "shop", Kind: datamigrate.KindRename,
			Rename: &datamigrate.RenameChange{Entity: "order", From: "ref", To: "reference", Type: "text"},
			Scope:  validScope(),
		},
	}
}

func TestPlanTool(t *testing.T) {
	_, out, err := planTool(context.Background(), nil, planInput{Input: sampleInput()})
	if err != nil || !out.OK || out.Plan == nil {
		t.Fatalf("plan failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.HasPrefix(out.Plan.Subdomain, "d-") {
		t.Fatalf("plan URL not per-phase deploy: %q", out.Plan.URL)
	}
	if !strings.Contains(strings.Join(out.Plan.Boot, " "), "pulumi up") {
		t.Fatalf("plan boot does not `pulumi up`: %v", out.Plan.Boot)
	}
	if !deploy.MigrationIsForwardOnly(out.Plan.Migration) {
		t.Fatalf("migration not forward-only")
	}
}

func TestPlanToolRefusesNonStable(t *testing.T) {
	in := sampleInput()
	in.Phase = phases.IsStable(
		phases.Cut{"x": "v1"}, nil, nil,
		[]phases.SensorStatus{{ID: "x.fixture", Pass: false}},
	)
	_, out, _ := planTool(context.Background(), nil, planInput{Input: in})
	if out.OK || out.Block == nil || out.Block.Code != "PHASE_NOT_STABLE" {
		t.Fatalf("non-stable phase not refused PHASE_NOT_STABLE: %+v", out)
	}
}

func TestGateTool(t *testing.T) {
	// deployable
	_, ok, _ := gateTool(context.Background(), nil, gateInput{Phase: stablePhase(), Gate: deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8}})
	if !ok.Deployable || len(ok.Reasons) != 0 {
		t.Fatalf("stable+passing gate not deployable: %+v", ok)
	}
	// non-deployable (monster)
	_, no, _ := gateTool(context.Background(), nil, gateInput{Phase: stablePhase(), Gate: deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8, MonsterCount: 2}})
	if no.Deployable || len(no.Reasons) == 0 {
		t.Fatalf("a monster must make the phase non-deployable: %+v", no)
	}
}

func TestCheckServedTool(t *testing.T) {
	_, planOut, _ := planTool(context.Background(), nil, planInput{Input: sampleInput()})
	plan := *planOut.Plan
	_, m, _ := checkServedTool(context.Background(), nil, checkServedInput{Plan: plan, ServedAppHash: plan.EmittedAppHash})
	if !m.Match || m.Block != nil {
		t.Fatalf("honest served hash not matched: %+v", m)
	}
	_, mm, _ := checkServedTool(context.Background(), nil, checkServedInput{Plan: plan, ServedAppHash: "stale"})
	if mm.Match || mm.Block == nil {
		t.Fatalf("stale served hash not refused: %+v", mm)
	}
}

func TestForwardOnlyTool(t *testing.T) {
	_, planOut, _ := planTool(context.Background(), nil, planInput{Input: sampleInput()})
	_, fo, _ := forwardOnlyTool(context.Background(), nil, forwardOnlyInput{Migration: planOut.Plan.Migration})
	if !fo.ForwardOnly {
		t.Fatal("a deployed migration must be forward-only")
	}
}

func TestServerBuilds(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("nil server")
	}
}
