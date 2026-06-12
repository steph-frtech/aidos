package agentimpl_test

// Fixture mirror (N2-style: value → invariant) for the AgentImplementation TYPE (BA02).
// reflects=runtime.agent_impl · test_kind=fixture · cert_language=go · liveness=live ·
// authority=below. These pin the concrete shape of a projection: a below-the-line,
// content-addressed-by-LayerRef struct that carries NO truth (no version, no mirror),
// is regenerable, and whose ForbiddenPaths equal the wall zones.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// A canonical, well-formed projection (the shape BA03's emitter will later produce).
func goldenImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:    "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
		Provider:    agentlayer.ProviderAnthropic,
		Model:       "claude-fable-5",
		Temperature: 0,
		MaxTurns:    120,
		Seed:        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
		Tools: []agentimpl.ResolvedTool{
			{Server: "store", Tool: "read"},
		},
		Skills: []string{"tdd", "diagnose"},
		Hooks: []agentimpl.ResolvedHook{
			{Phase: "PreToolUse", Hook: "pretooluse", Mandatory: true},
		},
		AllowedPaths:        []string{"front/web", "back/gen"},
		ForbiddenPaths:      agentimpl.WallForbiddenPaths(),
		AllowedNetworkHosts: nil, // max confinement: no egress
		AllowedExec:         nil, // max confinement: no subprocess
		ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 2048, MaxCPUMillis: 2000, MaxWallSeconds: 900},
		MaxConcurrency:      1,
	}
}

func TestFixture_GoldenImpl_Valid(t *testing.T) {
	if err := agentimpl.Validate(goldenImpl()); err != nil {
		t.Fatalf("the golden projection must validate: %v", err)
	}
}

func TestFixture_ForbiddenPaths_AreTheWall(t *testing.T) {
	impl := goldenImpl()
	// The wall is in the projection: kernel/mirrors/fitness/migrations zones are forbidden.
	wantWall := []string{"kernel", "mirrors", "fitness", "back/kernel/", "back/migrations/"}
	for _, w := range wantWall {
		found := false
		for _, fp := range impl.ForbiddenPaths {
			if fp == w {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("ForbiddenPaths must carry the wall zone %q, got %v", w, impl.ForbiddenPaths)
		}
	}
}

func TestFixture_EmptyConfinement_FailsClosed(t *testing.T) {
	impl := goldenImpl()
	// Empty allow-lists == max confinement: EgressAllowed / ExecAllowed deny everything.
	if impl.EgressAllowed("api.anthropic.com") {
		t.Fatal("empty AllowedNetworkHosts must deny ALL egress (fail-closed)")
	}
	if impl.ExecAllowed("git") {
		t.Fatal("empty AllowedExec must deny ALL subprocess (fail-closed)")
	}
}

func TestFixture_Confinement_AllowsDeclared(t *testing.T) {
	impl := goldenImpl()
	impl.AllowedNetworkHosts = []string{"api.anthropic.com"}
	impl.AllowedExec = []string{"git", "go"}
	if !impl.EgressAllowed("api.anthropic.com") {
		t.Fatal("a declared host must be allowed")
	}
	if impl.EgressAllowed("evil.example.com") {
		t.Fatal("an undeclared host must be denied (fail-closed)")
	}
	if !impl.ExecAllowed("git") {
		t.Fatal("a declared command must be allowed")
	}
	if impl.ExecAllowed("rm") {
		t.Fatal("an undeclared command must be denied (fail-closed)")
	}
}

func TestFixture_Validate_RejectsUnknownProvider(t *testing.T) {
	impl := goldenImpl()
	impl.Provider = agentlayer.Provider("nope")
	if err := agentimpl.Validate(impl); err == nil {
		t.Fatal("an unknown provider must be rejected")
	}
}

func TestFixture_Validate_RejectsEmptyLayerRef(t *testing.T) {
	impl := goldenImpl()
	impl.LayerRef = ""
	if err := agentimpl.Validate(impl); err == nil {
		t.Fatal("an empty LayerRef must be rejected — a projection must point back to its SOURCE")
	}
}

func TestFixture_Validate_RejectsNegativeResource(t *testing.T) {
	impl := goldenImpl()
	impl.ResourceLimits.MaxMemoryMB = -1
	if err := agentimpl.Validate(impl); err == nil {
		t.Fatal("a negative resource limit must be rejected (fail-closed)")
	}
}
