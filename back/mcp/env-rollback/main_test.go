package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// The env-rollback MCP server is a PURE plane (the wall): these tests prove each tool returns
// deterministically without I/O, mirroring the S98 done-criteria at the MCP boundary.

func stablePhase(id, v string) envrollback.PhaseInput {
	return envrollback.PhaseInput{
		Phase: phases.IsStable(
			phases.Cut{id: v}, nil, nil,
			[]phases.SensorStatus{{ID: id + ".fixture", Pass: true}},
		),
		Gate:    deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8},
		Surface: preview.EmittedSurface{Project: "shop", ServerBundleHash: "srv-" + v, FrontBundleHash: "frt-" + v, InfraHash: "inf-" + v, DatastoreHash: "dst-" + v},
	}
}

func redPhase(id, v string) envrollback.PhaseInput {
	p := stablePhase(id, v)
	p.Phase = phases.IsStable(phases.Cut{id: v}, nil, nil, []phases.SensorStatus{{ID: id + ".fixture", Pass: false}})
	return p
}

func TestPromoteTool(t *testing.T) {
	_, out, err := promoteTool(context.Background(), nil, promoteInput{Input: envrollback.PromoteInput{
		Env: envrollback.EnvProd, Project: "shop", Phase: stablePhase("createOrder", "v2"),
	}})
	if err != nil || !out.OK || out.Promotion == nil {
		t.Fatalf("promote failed: ok=%v err=%v", out.OK, err)
	}
	if !strings.HasPrefix(out.Promotion.StackName, "prod-shop-d-") {
		t.Fatalf("stack %q not per-env prod", out.Promotion.StackName)
	}
}

func TestPromoteToolRefusesNonStable(t *testing.T) {
	_, out, _ := promoteTool(context.Background(), nil, promoteInput{Input: envrollback.PromoteInput{
		Env: envrollback.EnvProd, Project: "shop", Phase: redPhase("createOrder", "v2"),
	}})
	if out.OK || out.Block == nil || out.Block.Code != "ENV_PROMOTE_NOT_STABLE" {
		t.Fatalf("non-stable promote not refused ENV_PROMOTE_NOT_STABLE: %+v", out)
	}
}

func TestRollbackTool(t *testing.T) {
	prev := stablePhase("createOrder", "v1")
	curr := stablePhase("createOrder", "v2")
	prevHash, _ := prev.Phase.Version()
	_, out, _ := rollbackTool(context.Background(), nil, rollbackInput{Input: envrollback.RollbackInput{
		Env: envrollback.EnvProd, Project: "shop",
		Current: curr, Target: prev, Lineage: []string{prevHash},
		Actor: "alice", Reason: "incident",
	}})
	if !out.OK || out.Decision == nil {
		t.Fatalf("rollback failed: %+v", out)
	}
	if out.Decision.Provenance.Actor != "alice" {
		t.Fatalf("provenance not recorded: %+v", out.Decision.Provenance)
	}
	// check_served accepts the fresh re-emit and rejects a stale artifact.
	served := out.Decision.ReProjectedAppHash
	_, m, _ := checkServedTool(context.Background(), nil, checkServedInput{Decision: *out.Decision, Target: prev, ServedAppHash: served})
	if !m.Match || m.Block != nil {
		t.Fatalf("fresh re-emit not matched: %+v", m)
	}
	currHash, _ := curr.Phase.Version()
	stale, _ := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: currHash}, curr.Surface)
	_, mm, _ := checkServedTool(context.Background(), nil, checkServedInput{Decision: *out.Decision, Target: prev, ServedAppHash: stale})
	if mm.Match || mm.Block == nil {
		t.Fatalf("stale artifact not rejected: %+v", mm)
	}
}

func TestRollbackToolRefusesNotEarlier(t *testing.T) {
	prev := stablePhase("createOrder", "v1")
	curr := stablePhase("createOrder", "v2")
	_, out, _ := rollbackTool(context.Background(), nil, rollbackInput{Input: envrollback.RollbackInput{
		Env: envrollback.EnvProd, Project: "shop",
		Current: curr, Target: prev, Lineage: nil, // not an ancestor
		Actor: "alice", Reason: "x",
	}})
	if out.OK || out.Block == nil || out.Block.Code != "ROLLBACK_NOT_EARLIER" {
		t.Fatalf("non-ancestor rollback not refused ROLLBACK_NOT_EARLIER: %+v", out)
	}
}

func TestLadderTool(t *testing.T) {
	_, out, _ := ladderTool(context.Background(), nil, ladderInput{})
	if len(out.Ladder) != 3 || out.Ladder[0] != envrollback.EnvPreview || out.Ladder[2] != envrollback.EnvProd {
		t.Fatalf("ladder not in order: %+v", out.Ladder)
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}
