package main

// exampleLayers is the deterministic mocked read-only view of the governed
// `kernel.agent_layer` SELECT view (§6). It mirrors the front fixture
// front/web/lib/agentlayer-data.ts (BDD_WRITER + EXECUTOR) VERBATIM so the Workbench
// projection and the MCP projection agree byte-for-byte. Every layer here is VALID
// against agentlayer.Validate (so agentimpl.Project always succeeds), carries the two
// structural always-false rights (the wall), and declares its governed BA01 knobs
// (temperature/maxturns/seed/network/exec/resource/concurrency). The bdd-writer is
// MAX-confined (empty network/exec ⇒ no egress, no subprocess, fail-closed); the
// executor declares one egress host + go/git exec.

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

func exampleLayers() []agentlayer.CoucheAgent {
	bddWriter := agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			ID:                 "bdd-writer",
			Nom:                "bdd-writer",
			Role:               "bdd-writer",
			Objectif:           "propose red scenarios",
			Modele:             "claude-opus-4-8",
			Provider:           agentlayer.ProviderAnthropic,
			PeutProposerVerite: true,
			PeutModifierMiroir: true,
			ZonesLecture:       []string{"kernel", "mirrors", "ideas", "brain"},
			ZonesEcriture:      []string{"ideas"},
			StopConditions:     []string{"red set still red"},
			// BA01 — governed knobs. MAX-confined: no egress, no exec (fail-closed).
			Temperature:         0.2,
			MaxTurns:            40,
			Seed:                "",
			AllowedNetworkHosts: nil,
			AllowedExec:         nil,
			ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 2048, MaxCPUMillis: 4000, MaxWallSeconds: 600},
			MaxConcurrency:      1,
		},
		SkillsAutorises: []agentlayer.SkillBinding{
			{SkillName: "write-bdd-scenario", Enabled: true},
			{SkillName: "derive-mirror", Enabled: true},
			// DISABLED — governance NARROWS: BA05 drops it; it never reaches Skills[].
			{SkillName: "evolve", Enabled: false},
		},
		OutilsMCPAutorises: []agentlayer.MCPBinding{
			{Server: "idea-intake", Tool: "submit_idea", Enabled: true},
			// DISABLED — can NEVER appear in the resolved Tools[].
			{Server: "changeset", Tool: "apply_changeset", Enabled: false},
		},
		HooksObligatoires: []agentlayer.AgentHookPolicy{
			{Phase: "PreToolUse", Hook: "pretooluse (wall)", Mandatory: true},
		},
		PolitiqueEcriture: agentlayer.WritePolicy{AllowedWriteZones: []string{"ideas"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"product_owner"},
		},
		Scope: scope.TruthScope{Region: scope.RegionEU},
	}
	bddWriter.Version = bddWriter.Spec.ID

	executor := agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			ID:             "executor",
			Nom:            "executor",
			Role:           "executor",
			Objectif:       "drive a red set to green",
			Modele:         "claude-opus-4-8",
			Provider:       agentlayer.ProviderAnthropic,
			ZonesLecture:   []string{"kernel", "mirrors"},
			ZonesEcriture:  []string{"back/gen", "runtime"},
			StopConditions: []string{"red set still red", "prior green broken"},
			// BA01 — governed knobs. Declares one egress host + go/git exec.
			Temperature:         0,
			MaxTurns:            80,
			Seed:                "",
			AllowedNetworkHosts: []string{"api.anthropic.com"},
			AllowedExec:         []string{"go", "git"},
			ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 4096, MaxCPUMillis: 8000, MaxWallSeconds: 1800},
			MaxConcurrency:      2,
		},
		SkillsAutorises:    []agentlayer.SkillBinding{{SkillName: "tdd", Enabled: true}},
		OutilsMCPAutorises: []agentlayer.MCPBinding{{Server: "mirror-runner", Tool: "run_mirror", Enabled: true}},
		HooksObligatoires:  []agentlayer.AgentHookPolicy{{Phase: "PreToolUse", Hook: "pretooluse (wall)", Mandatory: true}},
		PolitiqueEcriture:  agentlayer.WritePolicy{AllowedWriteZones: []string{"back/gen", "runtime"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"architecture_board"},
		},
		Scope: scope.TruthScope{Region: scope.RegionEU},
	}
	executor.Version = executor.Spec.ID

	return []agentlayer.CoucheAgent{bddWriter, executor}
}
