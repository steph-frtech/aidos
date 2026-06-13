package agentlayer_test

// Property + fixture mirror (∀ and state→cmd→events) for the BA24 OrchestrationPolicy,
// the kind-aware Validate, the per-run immutability pin, and ResolveConflict.
// reflects=kernel.agent_layer · test_kind=property+fixture · cert_language=rapid+go ·
// liveness=live · authority=below (the invariants are computational properties of the
// pure functions; the orchestration RULE itself is the human's, above the line, pinned
// by the fixture). Run via `go test` (rapid is the frozen invariant slot).
//
// The invariants (BA24, KRD §21 + CLAUDE.md §2/§6/§8 + gaps F1/F2/F3):
//
//  1. KIND-AWARE Validate: an `orchestration` layer is valid IFF it carries a non-empty
//     team AND a well-formed policy bounded by the spec knob; a non-orchestration layer
//     is INVALID if it carries either (the team/policy belong only to orchestration).
//  2. ResolveConflict is TOTAL and DETERMINISTIC: same pair ⇒ same verdict; defined for
//     every pair (no panic).
//  3. ResolveConflict is SYMMETRIC: ResolveConflict(a,b) and ResolveConflict(b,a) name
//     the SAME winner (argument order never loses work).
//  4. ZERO-LOST-UPDATE: the loser is ALWAYS surfaced (never discarded) and NextAction is
//     ALWAYS serialise_then_merge (never a race/coin-flip).
//  5. The winner respects the total order: lower MirrorRank wins; ties by content-hash;
//     final ties by agent ref.
//  6. IMMUTABILITY PER-RUN: PinForRun pins a version; MutationIsForbidden is true IFF the
//     live policy version diverges from the pin (a mid-run live-edit is detected).
//  7. PolicyVersion is deterministic: same policy ⇒ same version; a changed policy ⇒ a
//     different version (so a live-edit can never masquerade as the pinned policy).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"pgregory.net/rapid"
)

// --- helpers -----------------------------------------------------------------

func validPolicy() agentlayer.OrchestrationPolicy {
	return agentlayer.OrchestrationPolicy{
		ClaimArbitrage:     agentlayer.ConflictSerialiseThenMerge,
		FanOut:             agentlayer.FanModeParallel,
		FanIn:              agentlayer.FanModePipeline,
		ConflitMemeFichier: agentlayer.ConflictSerialiseThenMerge,
		MaxConcurrency:     2,
		CapsParRole:        []agentlayer.RoleCap{{Role: "executor", Cap: 1}, {Role: "reviewer", Cap: 1}},
	}
}

func baseSpec() agentlayer.AgentSpec {
	return agentlayer.AgentSpec{
		ID:             "orch-1",
		Nom:            "orchestrator",
		Role:           "orchestrator",
		Objectif:       "coordinate the team",
		Modele:         "claude-opus-4-8",
		Provider:       agentlayer.ProviderAnthropic,
		ZonesLecture:   []string{"kernel"},
		ZonesEcriture:  []string{"ideas"},
		MaxConcurrency: 4,
	}
}

func baseAutorite() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "build-agent",
		TruthKind: "behavioral",
		Approvers: []authority.Role{authority.Role("product_owner")},
	}
}

func baseScope() scope.TruthScope {
	return scope.TruthScope{Region: scope.RegionEU}
}

func orchestrationLayer() agentlayer.CoucheAgent {
	p := validPolicy()
	return agentlayer.CoucheAgent{
		Layer:             records.AuthorityAbove,
		Kind:              agentlayer.LayerKindOrchestration,
		Spec:              baseSpec(),
		Equipe:            []string{"agent-a@v1", "agent-b@v1"},
		Orchestration:     &p,
		PolitiqueEcriture: agentlayer.WritePolicy{AllowedWriteZones: []string{"ideas"}},
		Autorite:          baseAutorite(),
		Scope:             baseScope(),
		Version:           "orch-1",
	}
}

// --- (1) kind-aware Validate -------------------------------------------------

func TestValidate_OrchestrationRequiresPolicyAndTeam(t *testing.T) {
	if err := agentlayer.Validate(orchestrationLayer()); err != nil {
		t.Fatalf("a well-formed orchestration layer must validate: %v", err)
	}

	noPolicy := orchestrationLayer()
	noPolicy.Orchestration = nil
	if err := agentlayer.Validate(noPolicy); err == nil {
		t.Fatal("an orchestration layer WITHOUT a policy must be rejected")
	}

	noTeam := orchestrationLayer()
	noTeam.Equipe = nil
	if err := agentlayer.Validate(noTeam); err == nil {
		t.Fatal("an orchestration layer with an EMPTY team must be rejected")
	}
}

func TestValidate_AgentMustNotCarryOrchestration(t *testing.T) {
	spec := baseSpec()
	spec.Role = "executor"
	spec.Nom = "executor"
	p := validPolicy()
	agentWithPolicy := agentlayer.CoucheAgent{
		Layer:         records.AuthorityAbove,
		Kind:          agentlayer.LayerKindAgent,
		Spec:          spec,
		Orchestration: &p,
		Autorite:      baseAutorite(),
		Scope:         baseScope(),
		Version:       "a-1",
	}
	if err := agentlayer.Validate(agentWithPolicy); err == nil {
		t.Fatal("a non-orchestration layer carrying a policy must be rejected")
	}

	agentWithTeam := agentlayer.CoucheAgent{
		Layer:    records.AuthorityAbove,
		Kind:     agentlayer.LayerKindAgent,
		Spec:     spec,
		Equipe:   []string{"x@v1"},
		Autorite: baseAutorite(),
		Scope:    baseScope(),
		Version:  "a-1",
	}
	if err := agentlayer.Validate(agentWithTeam); err == nil {
		t.Fatal("a non-orchestration layer carrying a team must be rejected")
	}
}

func TestValidate_PhantomConcurrencyRejected(t *testing.T) {
	// gap F1: the policy cap may not exceed the spec knob.
	c := orchestrationLayer()
	c.Spec.MaxConcurrency = 1
	p := validPolicy()
	p.MaxConcurrency = 5 // > spec 1 — a phantom cap
	c.Orchestration = &p
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("a policy MaxConcurrency exceeding the spec knob must be rejected (gap F1)")
	}
}

func TestValidate_UnknownEnumRejected(t *testing.T) {
	c := orchestrationLayer()
	p := validPolicy()
	p.FanOut = agentlayer.FanMode("wild-guess")
	c.Orchestration = &p
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("an unknown fan mode must be rejected (closed taxonomy)")
	}

	c2 := orchestrationLayer()
	p2 := validPolicy()
	p2.ConflitMemeFichier = agentlayer.SameFileConflictPolicy("coin_flip")
	c2.Orchestration = &p2
	if err := agentlayer.Validate(c2); err == nil {
		t.Fatal("a non-zero-lost-update conflict policy must be rejected")
	}
}

// --- (2,3,4,5) ResolveConflict ----------------------------------------------

func drawContender(rt *rapid.T, name string) agentlayer.ClaimContender {
	layers := []string{"mirror", "projection", "operation_action", "button", "??"}
	return agentlayer.ClaimContender{
		Agent:       rapid.SampledFrom([]string{"a@v1", "b@v1", "c@v1"}).Draw(rt, name+".agent"),
		Target:      rapid.SampledFrom([]string{"file-x", "file-y"}).Draw(rt, name+".target"),
		Layer:       rapid.SampledFrom(layers).Draw(rt, name+".layer"),
		ContentHash: rapid.SampledFrom([]string{"00", "ab", "ff"}).Draw(rt, name+".hash"),
	}
}

func TestResolveConflict_TotalDeterministicSymmetricZeroLost(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := drawContender(rt, "a")
		b := drawContender(rt, "b")

		r1 := agentlayer.ResolveConflict(a, b)
		r2 := agentlayer.ResolveConflict(a, b)
		// (2) deterministic
		if r1 != r2 {
			rt.Fatalf("ResolveConflict must be deterministic: %+v vs %+v", r1, r2)
		}
		// (3) symmetric — same winner regardless of argument order
		rSwap := agentlayer.ResolveConflict(b, a)
		if rSwap.Winner != r1.Winner {
			rt.Fatalf("ResolveConflict must be symmetric: winner %+v vs %+v", r1.Winner, rSwap.Winner)
		}
		// (4) zero-lost-update — loser surfaced, NextAction always serialise+merge
		if r1.NextAction != agentlayer.ConflictSerialiseThenMerge {
			rt.Fatalf("NextAction must always be serialise_then_merge, got %q", r1.NextAction)
		}
		if r1.Winner == r1.Loser && a != b {
			rt.Fatalf("distinct contenders must have distinct winner/loser")
		}
		// the winner and loser are exactly the two inputs (no third value invented).
		gotPair := map[agentlayer.ClaimContender]bool{r1.Winner: true, r1.Loser: true}
		if !gotPair[a] || !gotPair[b] {
			rt.Fatalf("winner/loser must be exactly the two inputs: %+v / %+v", r1.Winner, r1.Loser)
		}
		// (5) the winner respects mirror-first ranking
		if agentlayer.MirrorRank(r1.Winner.Layer) > agentlayer.MirrorRank(r1.Loser.Layer) {
			rt.Fatalf("the winner must not rank worse than the loser (mirror-first)")
		}
		// same-target flag is exactly target equality
		if r1.SameTarget != (a.Target == b.Target) {
			rt.Fatalf("SameTarget must equal target equality")
		}
	})
}

func TestResolveConflict_MirrorFirstThenHash(t *testing.T) {
	mirror := agentlayer.ClaimContender{Agent: "z@v1", Target: "f", Layer: "mirror", ContentHash: "ff"}
	button := agentlayer.ClaimContender{Agent: "a@v1", Target: "f", Layer: "button", ContentHash: "00"}
	r := agentlayer.ResolveConflict(button, mirror)
	if r.Winner != mirror {
		t.Fatalf("the mirror-layer contender must win (mirror-first), got %+v", r.Winner)
	}
	if r.Loser != button {
		t.Fatalf("the button-layer contender must wait, got %+v", r.Loser)
	}

	// same layer ⇒ content-hash decides
	lo := agentlayer.ClaimContender{Agent: "z@v1", Target: "f", Layer: "projection", ContentHash: "00"}
	hi := agentlayer.ClaimContender{Agent: "a@v1", Target: "f", Layer: "projection", ContentHash: "ff"}
	r2 := agentlayer.ResolveConflict(hi, lo)
	if r2.Winner != lo {
		t.Fatalf("on equal layer the lower content-hash must win, got %+v", r2.Winner)
	}
}

// --- (6,7) immutability per-run ---------------------------------------------

func TestPolicyVersion_DeterministicAndSensitive(t *testing.T) {
	p := validPolicy()
	if agentlayer.PolicyVersion(p) != agentlayer.PolicyVersion(p) {
		t.Fatal("PolicyVersion must be deterministic")
	}
	changed := p
	changed.MaxConcurrency = p.MaxConcurrency + 1
	if agentlayer.PolicyVersion(p) == agentlayer.PolicyVersion(changed) {
		t.Fatal("a changed policy must yield a different version (a live-edit cannot masquerade)")
	}
}

func TestPinForRun_ImmutabilityPerRun(t *testing.T) {
	p := validPolicy()
	v := agentlayer.PolicyVersion(p)
	pin, err := agentlayer.PinForRun("run-1", v)
	if err != nil {
		t.Fatalf("PinForRun must accept a non-empty version: %v", err)
	}
	if agentlayer.MutationIsForbidden(pin, v) {
		t.Fatal("the pinned version against itself must NOT be a mutation")
	}
	// a mid-run live-edit changes the live version ⇒ detected as forbidden
	edited := p
	edited.FanOut = agentlayer.FanModeSequential
	if !agentlayer.MutationIsForbidden(pin, agentlayer.PolicyVersion(edited)) {
		t.Fatal("a diverging live policy version must be flagged forbidden (gap F3)")
	}
	if _, err := agentlayer.PinForRun("run-1", "  "); err == nil {
		t.Fatal("PinForRun must refuse an empty version")
	}
}
