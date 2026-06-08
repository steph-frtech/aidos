package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// The preview MCP server is a PURE planner (the wall): these tests prove each tool returns
// deterministically without I/O, mirroring the S94 done-criteria at the MCP boundary.

func sampleProgram(t *testing.T) honoemit.Artifact {
	t.Helper()
	art, br := honoemit.EmitPulumiProgram(honoemit.StackManifest{
		App: "shop",
		Services: []honoemit.Service{
			{Name: "shop-server", Role: honoemit.RoleServer, Image: "node:22", InternalPort: 3000},
		},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	})
	if br != nil {
		t.Fatalf("emit pulumi: %v", br)
	}
	return art
}

func sampleInput(t *testing.T) preview.Input {
	return preview.Input{
		Phase:   preview.PhaseRef{PhaseHash: "phase-0123456789abcdef"},
		Surface: preview.EmittedSurface{Project: "shop", ServerBundleHash: "srv", FrontBundleHash: "frt", InfraHash: "inf", DatastoreHash: "dst"},
		Program: sampleProgram(t),
	}
}

func TestPlanTool(t *testing.T) {
	_, out, err := planTool(context.Background(), nil, planInput{Input: sampleInput(t)})
	if err != nil || !out.OK || out.Plan == nil {
		t.Fatalf("plan failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.HasPrefix(out.Plan.Subdomain, "p-") {
		t.Fatalf("plan URL not per-phase: %q", out.Plan.URL)
	}
	if !strings.Contains(strings.Join(out.Plan.Boot, " "), "pulumi up") {
		t.Fatalf("plan boot does not `pulumi up`: %v", out.Plan.Boot)
	}
}

func TestPlanToolRefusesNoPhase(t *testing.T) {
	in := sampleInput(t)
	in.Phase = preview.PhaseRef{}
	_, out, _ := planTool(context.Background(), nil, planInput{Input: in})
	if out.OK || out.Block == nil {
		t.Fatalf("no-phase plan not refused")
	}
}

func TestAppHashTool(t *testing.T) {
	_, out, _ := appHashTool(context.Background(), nil, appHashInput{
		Phase:   preview.PhaseRef{PhaseHash: "phase-abc"},
		Surface: preview.EmittedSurface{Project: "shop", ServerBundleHash: "srv", FrontBundleHash: "frt", InfraHash: "inf"},
	})
	if !out.OK || out.EmittedAppHash == "" {
		t.Fatalf("app_hash failed: %+v", out)
	}
}

func TestCheckServedTool(t *testing.T) {
	_, planOut, _ := planTool(context.Background(), nil, planInput{Input: sampleInput(t)})
	plan := *planOut.Plan

	// match
	_, m, _ := checkServedTool(context.Background(), nil, checkServedInput{Plan: plan, ServedAppHash: plan.EmittedAppHash})
	if !m.OK || !m.Match || m.Block != nil {
		t.Fatalf("honest served hash not matched: %+v", m)
	}
	// mismatch
	_, mm, _ := checkServedTool(context.Background(), nil, checkServedInput{Plan: plan, ServedAppHash: "stale"})
	if mm.Match || mm.Block == nil {
		t.Fatalf("stale served hash not refused: %+v", mm)
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}
