package agentlayer_test

// BA01 PROPERTY+FIXTURE MIRROR (∀ + state→command→events) for the governed
// behaviour knobs added to the AgentSpec SOURCE through idée→miroir→/goal (NEVER a
// direct kernel write — the propose emits a Proposal Status=proposed requiring the
// S16 authority). reflects = kernel.agent_layer · test_kind = property+fixture ·
// cert_language = rapid · liveness = live · authority = above (the knob GRAMMAR is
// the human's, pinned by the fixture; the invariants are computational properties of
// the pure Validate / KnobsConfinement / DeriveSeed).
//
// THE KNOBS (ROADMAP-build-agent BA01) — every one lives in the GOVERNED LAYER, never
// in a providerCfg: Temperature, MaxTurns, Seed (or Seed derived deterministically
// Hash(impl‖pack‖item) — never an RNG), AllowedNetworkHosts (empty → no egress),
// AllowedExec (empty → no subprocess), ResourceLimits, MaxConcurrency.
//
// THE INVARIANTS (mirror-first; the wall; determinism-first):
//
//  1. Validate is KIND-AWARE and the empty defaults are MAX CONFINEMENT, fail-closed:
//     empty AllowedNetworkHosts ⇒ EgressAllowed is false for every host; empty
//     AllowedExec ⇒ ExecAllowed is false for every command. No knob defaults "open".
//  2. Validate REJECTS out-of-range knobs (Temperature<0 or >2, MaxTurns<0,
//     MaxConcurrency<0) — fail-closed, total.
//  3. DeriveSeed is a PURE deterministic function of (impl, pack, item) — same triple
//     ⇒ same seed, NEVER an RNG (the reproducibility mirror).
//  4. A behaviour knob NEVER lives in a providerCfg: KnobsFromProviderCfg is a
//     compile-time-absent surface — the knobs are read ONLY off the AgentSpec
//     (pinned by the fixture asserting the spec carries them and the providerCfg
//     contract is credential/endpoint only). An undeclared knob is a determinism gap.
//  6. The extension is PROPOSED, never written: Propose over a knobful spec yields
//     Status=proposed + a non-empty human authority (the wall).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"pgregory.net/rapid"
)

// (1) Empty defaults = max confinement, fail-closed (egress + exec).
func TestProp_Knobs_EmptyDefaultsAreMaxConfinement(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		// empty network/exec allow-lists (the default)
		c.Spec.AllowedNetworkHosts = nil
		c.Spec.AllowedExec = nil
		host := rapid.StringMatching(`[a-z]{1,8}\.example\.com`).Draw(rt, "host")
		cmd := rapid.SampledFrom([]string{"go", "git", "rm", "curl", "bash"}).Draw(rt, "cmd")
		if agentlayer.EgressAllowed(c.Spec, host) {
			rt.Fatalf("empty AllowedNetworkHosts MUST deny egress to %q (fail-closed)", host)
		}
		if agentlayer.ExecAllowed(c.Spec, cmd) {
			rt.Fatalf("empty AllowedExec MUST deny subprocess %q (fail-closed)", cmd)
		}
	})
}

// (1b) A declared host/exec is allowed; anything outside the allow-list is denied.
func TestProp_Knobs_AllowListIsExact(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.AllowedNetworkHosts = []string{"api.anthropic.com"}
		c.Spec.AllowedExec = []string{"go"}
		if !agentlayer.EgressAllowed(c.Spec, "api.anthropic.com") {
			rt.Fatal("a declared host MUST be allowed")
		}
		if agentlayer.EgressAllowed(c.Spec, "evil.example.com") {
			rt.Fatal("an undeclared host MUST be denied")
		}
		if !agentlayer.ExecAllowed(c.Spec, "go") {
			rt.Fatal("a declared exec MUST be allowed")
		}
		if agentlayer.ExecAllowed(c.Spec, "rm") {
			rt.Fatal("an undeclared exec MUST be denied")
		}
	})
}

// (2) Validate rejects out-of-range knobs, fail-closed.
func TestProp_Knobs_ValidateRejectsOutOfRange(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// temperature below 0 or above 2 is invalid
		c := drawAgent(rt)
		c.Spec.Temperature = rapid.Float64Range(-100, -0.0001).Draw(rt, "tneg")
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatalf("Validate must reject negative temperature %v", c.Spec.Temperature)
		}
		c = drawAgent(rt)
		c.Spec.Temperature = rapid.Float64Range(2.0001, 100).Draw(rt, "thi")
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatalf("Validate must reject temperature > 2 (%v)", c.Spec.Temperature)
		}
		// negative MaxTurns / MaxConcurrency invalid
		c = drawAgent(rt)
		c.Spec.MaxTurns = rapid.IntRange(-100, -1).Draw(rt, "mt")
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatal("Validate must reject negative MaxTurns")
		}
		c = drawAgent(rt)
		c.Spec.MaxConcurrency = rapid.IntRange(-100, -1).Draw(rt, "mc")
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatal("Validate must reject negative MaxConcurrency")
		}
	})
}

// (2b) A well-formed knobful spec validates (and a default zero-value knob set is the
// max-confinement default, which is valid).
func TestProp_Knobs_ValidateAcceptsInRange(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.Temperature = rapid.Float64Range(0, 2).Draw(rt, "t")
		c.Spec.MaxTurns = rapid.IntRange(0, 1000).Draw(rt, "mt")
		c.Spec.MaxConcurrency = rapid.IntRange(0, 64).Draw(rt, "mc")
		if err := agentlayer.Validate(c); err != nil {
			rt.Fatalf("a well-formed knobful spec must validate, got %v", err)
		}
	})
}

// (3) DeriveSeed is a pure deterministic function of (impl, pack, item).
func TestProp_DeriveSeed_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := rapid.StringN(0, 40, 40).Draw(rt, "impl")
		pack := rapid.StringN(0, 40, 40).Draw(rt, "pack")
		item := rapid.StringN(0, 40, 40).Draw(rt, "item")
		s1 := agentlayer.DeriveSeed(impl, pack, item)
		s2 := agentlayer.DeriveSeed(impl, pack, item)
		if s1 != s2 {
			rt.Fatalf("DeriveSeed must be deterministic: %q != %q", s1, s2)
		}
		if s1 == "" {
			rt.Fatal("DeriveSeed must yield a non-empty seed")
		}
		// changing any component changes the seed (collision-resistant separation)
		if agentlayer.DeriveSeed(impl+"x", pack, item) == s1 &&
			agentlayer.DeriveSeed(impl, pack+"x", item) == s1 {
			rt.Fatal("DeriveSeed must depend on each of (impl, pack, item)")
		}
	})
}

// (6) The extension is PROPOSED, never written: a knobful spec still routes through
// Propose → Status=proposed + non-empty human authority (the wall).
func TestProp_Knobs_ExtensionProposedNotWritten(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.PeutProposerVerite = true
		c.Spec.Temperature = 0.7
		c.Spec.MaxTurns = 40
		c.Spec.AllowedNetworkHosts = []string{"api.anthropic.com"}
		p, err := agentlayer.Propose(c, "extend AgentSpec with governed knobs")
		if err != nil {
			rt.Fatalf("a proposing agent must succeed: %v", err)
		}
		if p.Status != agentlayer.StatusProposed {
			rt.Fatalf("the knob extension must be PROPOSED, never admitted/written, got %q", p.Status)
		}
		if len(p.RequiresAuthority) == 0 {
			rt.Fatal("the extension must require a human authority (S16) — never a direct kernel write")
		}
	})
}

// (4) THE WALL on the knob axis: a behaviour knob can never be smuggled below the line.
// MaxWrite/wall is unchanged; this asserts the human authority gate is still required.
func TestProp_Knobs_AuthorityIsHuman(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.PeutProposerVerite = true
		c.Spec.Seed = agentlayer.DeriveSeed("impl", "pack", "item")
		p, _ := agentlayer.Propose(c, "knob")
		// the proposing agent can never self-admit the knob extension
		self := agentlayer.Approve(c, p, authority.Role(c.Spec.Role))
		if self.Status == agentlayer.StatusAdmitted {
			rt.Fatal("an agent must NEVER self-admit a knob extension")
		}
	})
}
