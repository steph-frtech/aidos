// view.go — the read-only governed-layer view the agentloop MCP server drives over.
//
// It is the same kind of deterministic mocked snapshot of the kernel.agent_layer SELECT
// view the agentimpl MCP server serves (§6). It carries the BA19 journey's builder layer —
// "agent:builder@v1" — a governed CoucheAgent that BINDS the target MCP tool the run calls,
// allows writes into the app/ tree (below the line), declares the mandatory PreToolUse wall
// hook, and carries the two structural always-false rights (the wall: never proposes truth,
// never modifies a mirror from below the line). When the derived read view lands, newServer
// is swapped to read it; the tools and the wall hold.
//
// The builder's Version is "builder@v1" ⇒ LayerRef "agentlayer:builder@v1", and the lookup
// accepts the conceptual names the journey uses ("agent:builder@v1", "builder@v1", role).
package main

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// view is the read-only governed-layer provider (the kernel.agent_layer SELECT view, mocked).
type view interface {
	Layer(layerRef string) (agentlayer.CoucheAgent, bool)
	Layers() []agentlayer.CoucheAgent
}

// exampleView serves the deterministic example snapshot (the mocked read-only view, §6).
type exampleView struct{}

func (exampleView) Layers() []agentlayer.CoucheAgent { return exampleLayers() }

// Layer resolves a layer by its LayerRef ("agentlayer:builder@v1"), its conceptual name
// ("agent:builder@v1"), its bare version ("builder@v1"), or its role ("builder"). Unknown
// ⇒ not-found, never fabricated.
func (exampleView) Layer(layerRef string) (agentlayer.CoucheAgent, bool) {
	for _, c := range exampleLayers() {
		if agentimpl.LayerRef(c) == layerRef ||
			c.Version == layerRef ||
			c.Spec.Role == layerRef ||
			"agent:"+c.Version == layerRef {
			return c, true
		}
	}
	return agentlayer.CoucheAgent{}, false
}

// exampleLayers is the deterministic mocked view. The builder is VALID against
// agentlayer.Validate (Project always succeeds), carries the two structural always-false
// rights (the wall), binds the target tool the BA19 journey calls (mirror-runner/run_mirror),
// and allows writes into app/ (below the line). MAX-confined network (no egress).
func exampleLayers() []agentlayer.CoucheAgent {
	builder := agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			ID:             "builder",
			Nom:            "builder",
			Role:           "builder",
			Objectif:       "drive a red work item to green in the app tree",
			Modele:         "claude-opus-4-8",
			Provider:       agentlayer.ProviderAnthropic,
			ZonesLecture:   []string{"kernel", "mirrors"},
			ZonesEcriture:  []string{"app"},
			StopConditions: []string{"red set still red", "prior green broken"},
			// BA01 — governed knobs. MAX-confined network (no egress, fail-closed).
			Temperature:         0,
			MaxTurns:            80,
			Seed:                "",
			AllowedNetworkHosts: nil,
			AllowedExec:         []string{"go"},
			ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 4096, MaxCPUMillis: 8000, MaxWallSeconds: 1800},
			MaxConcurrency:      1,
		},
		SkillsAutorises:    []agentlayer.SkillBinding{{SkillName: "tdd", Enabled: true}},
		OutilsMCPAutorises: []agentlayer.MCPBinding{{Server: "mirror-runner", Tool: "run_mirror", Enabled: true}},
		HooksObligatoires:  []agentlayer.AgentHookPolicy{{Phase: "PreToolUse", Hook: "pretooluse (wall)", Mandatory: true}},
		PolitiqueEcriture:  agentlayer.WritePolicy{AllowedWriteZones: []string{"app"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"architecture_board"},
		},
		Scope: scope.TruthScope{Region: scope.RegionEU},
	}
	builder.Version = "builder@v1"
	return []agentlayer.CoucheAgent{builder}
}
