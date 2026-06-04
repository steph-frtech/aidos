package agentlayer_test

// BA01 GOVERNANCE FIXTURE (state → command → events) for the behaviour knobs.
// reflects = kernel.agent_layer · test_kind = fixture · authority = above.
//
// THE DONE INVARIANT (ROADMAP-build-agent BA01): every new behaviour knob lives in
// the GOVERNED layer (the AgentSpec SOURCE, above the line), NEVER in a providerCfg;
// the empty defaults are MAX confinement, fail-closed; the extension is proposed via
// /goal as a Proposal Status=proposed, never a direct kernel write.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
)

// TestFixture_Knobs_SpecCarriesGovernedKnobs — the canonical bdd-writer spec, extended
// with knobs, carries them on the AgentSpec (the governed layer) and validates.
func TestFixture_Knobs_SpecCarriesGovernedKnobs(t *testing.T) {
	c := bddWriter()
	c.Spec.Temperature = 0.2
	c.Spec.MaxTurns = 40
	c.Spec.Seed = "seed-fixed"
	c.Spec.AllowedNetworkHosts = []string{"api.anthropic.com"}
	c.Spec.AllowedExec = []string{"go", "git"}
	c.Spec.ResourceLimits = agentlayer.ResourceLimits{MaxMemoryMB: 2048, MaxCPUMillis: 4000, MaxWallSeconds: 600}
	c.Spec.MaxConcurrency = 1

	if err := agentlayer.Validate(c); err != nil {
		t.Fatalf("a knobful bdd-writer must validate, got %v", err)
	}
	// the knobs are READ off the AgentSpec (the governed layer), never a providerCfg.
	if c.Spec.Temperature != 0.2 || c.Spec.MaxTurns != 40 || c.Spec.Seed != "seed-fixed" {
		t.Fatal("knobs must live on the AgentSpec")
	}
}

// TestFixture_Knobs_EmptyDefaultsConfine — a spec with NO declared network/exec
// allow-list denies all egress and all subprocess (fail-closed, max confinement).
func TestFixture_Knobs_EmptyDefaultsConfine(t *testing.T) {
	c := bddWriter() // no AllowedNetworkHosts / AllowedExec declared
	if agentlayer.EgressAllowed(c.Spec, "api.anthropic.com") {
		t.Fatal("empty AllowedNetworkHosts MUST deny egress (fail-closed, no egress by default)")
	}
	if agentlayer.ExecAllowed(c.Spec, "go") {
		t.Fatal("empty AllowedExec MUST deny subprocess (fail-closed, no subprocess by default)")
	}
}

// TestFixture_Knobs_DeclaredAllowed — a declared host/exec passes; anything else fails.
func TestFixture_Knobs_DeclaredAllowed(t *testing.T) {
	c := bddWriter()
	c.Spec.AllowedNetworkHosts = []string{"api.anthropic.com"}
	c.Spec.AllowedExec = []string{"go"}

	if !agentlayer.EgressAllowed(c.Spec, "api.anthropic.com") {
		t.Fatal("a declared host must be allowed")
	}
	if agentlayer.EgressAllowed(c.Spec, "data.exfil.io") {
		t.Fatal("an undeclared host must be denied (allow-list, not deny-list)")
	}
	if !agentlayer.ExecAllowed(c.Spec, "go") {
		t.Fatal("a declared exec must be allowed")
	}
	if agentlayer.ExecAllowed(c.Spec, "curl") {
		t.Fatal("an undeclared exec must be denied")
	}
}

// TestFixture_Knobs_DeriveSeedReproducible — the seed derived from (impl,pack,item) is
// reproducible (replay depends on it) and not an RNG.
func TestFixture_Knobs_DeriveSeedReproducible(t *testing.T) {
	a := agentlayer.DeriveSeed("impl-hash", "pack-hash", "rwi-1")
	b := agentlayer.DeriveSeed("impl-hash", "pack-hash", "rwi-1")
	if a != b {
		t.Fatalf("DeriveSeed must reproduce: %q != %q", a, b)
	}
	if a == agentlayer.DeriveSeed("impl-hash", "pack-hash", "rwi-2") {
		t.Fatal("a different work item must derive a different seed")
	}
}

// TestFixture_Knobs_RejectsOutOfRange — out-of-range knobs are invalid (fail-closed).
func TestFixture_Knobs_RejectsOutOfRange(t *testing.T) {
	for _, tc := range []struct {
		name string
		mut  func(*agentlayer.CoucheAgent)
	}{
		{"temp<0", func(c *agentlayer.CoucheAgent) { c.Spec.Temperature = -0.1 }},
		{"temp>2", func(c *agentlayer.CoucheAgent) { c.Spec.Temperature = 2.5 }},
		{"maxturns<0", func(c *agentlayer.CoucheAgent) { c.Spec.MaxTurns = -1 }},
		{"maxconcurrency<0", func(c *agentlayer.CoucheAgent) { c.Spec.MaxConcurrency = -1 }},
		{"resmem<0", func(c *agentlayer.CoucheAgent) { c.Spec.ResourceLimits.MaxMemoryMB = -1 }},
	} {
		c := bddWriter()
		tc.mut(&c)
		if err := agentlayer.Validate(c); err == nil {
			t.Fatalf("%s: an out-of-range knob MUST be invalid (fail-closed)", tc.name)
		}
	}
}
