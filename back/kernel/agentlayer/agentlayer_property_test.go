package agentlayer_test

// Property mirror (∀) for the CoucheAgent governance functions (S52).
// reflects=kernel.agent_layer · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Validate /
// MayWrite / Propose / Approve — the governance RULE itself is the human's, above the
// line, pinned by the fixture). Run via `go test` (rapid is the frozen invariant slot).
//
// The invariants (KRD §21/§13.8/§44.5 + CLAUDE.md §2/§8):
//
//  1. Validate REJECTS any spec with peut_modifier_noyau==true OR peut_modifier_fitness==true
//     (the two are ALWAYS false — the wall is structural, not a toggle).
//  2. MayWrite DENIES with AGENT_WRITE_ABOVE_WATERLINE IFF the target resolves above the
//     waterline (REUSES the S04 predicate), regardless of the agent's role.
//  3. Propose always yields status "proposed" (NEVER "admitted") + a non-empty
//     requires_authority — an agent NEVER self-admits.
//  4. Approve is never admitted for the proposing agent itself (an agent is never an authority).
//  5. MayWrite is TOTAL and DETERMINISTIC (same input ⇒ same verdict).
//  6. The layer-kind taxonomy is CLOSED: a kind outside the triad ⇒ Validate errors.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func drawKind(rt *rapid.T) agentlayer.LayerKind {
	ks := agentlayer.LayerKinds()
	return ks[rapid.IntRange(0, len(ks)-1).Draw(rt, "kind")]
}

func drawProvider(rt *rapid.T) agentlayer.Provider {
	ps := agentlayer.Providers()
	return ps[rapid.IntRange(0, len(ps)-1).Draw(rt, "provider")]
}

// drawAgent draws a well-formed CoucheAgent (the two always-false rights forced false).
func drawAgent(rt *rapid.T) agentlayer.CoucheAgent {
	roles := []string{"bdd-writer", "executor", "orchestrator", "reviewer", "explorer"}
	role := roles[rapid.IntRange(0, len(roles)-1).Draw(rt, "role")]
	kind := drawKind(rt)
	// BA24 — a well-formed orchestration layer carries a non-empty team AND a policy
	// bounded by the spec knob; any other kind carries NEITHER (kind-aware Validate).
	var equipe []string
	var orch *agentlayer.OrchestrationPolicy
	if kind == agentlayer.LayerKindOrchestration {
		equipe = []string{"member-a@v1", "member-b@v1"}
		orch = &agentlayer.OrchestrationPolicy{
			ClaimArbitrage:     agentlayer.ConflictSerialiseThenMerge,
			FanOut:             agentlayer.FanModeParallel,
			FanIn:              agentlayer.FanModePipeline,
			ConflitMemeFichier: agentlayer.ConflictSerialiseThenMerge,
			MaxConcurrency:     0, // 0 = bounded only by the spec knob (never a phantom)
		}
	}
	return agentlayer.CoucheAgent{
		Layer:         records.AuthorityAbove,
		Kind:          kind,
		Equipe:        equipe,
		Orchestration: orch,
		Spec: agentlayer.AgentSpec{
			ID:                 "a-" + role,
			Nom:                role,
			Role:               role,
			Objectif:           rapid.StringN(0, 20, 20).Draw(rt, "objectif"),
			Modele:             "claude-fable-5",
			Provider:           drawProvider(rt),
			PeutProposerVerite: rapid.Bool().Draw(rt, "propose"),
			PeutModifierMiroir: rapid.Bool().Draw(rt, "miroir"),
			// the two always-false rights are forced false (a valid agent).
			ZonesLecture:   []string{"kernel", "ideas"},
			ZonesEcriture:  []string{"ideas"},
			StopConditions: []string{"red set still red"},
		},
		PolitiqueEcriture: agentlayer.WritePolicy{AllowedWriteZones: []string{"ideas"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"product_owner"},
		},
		Scope:   scope.TruthScope{Region: scope.RegionEU},
		Version: "a-" + role,
	}
}

// (1) Validate rejects the two always-false rights.
func TestProp_Validate_RejectsAlwaysFalseRights(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.PeutModifierNoyau = true
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatal("Validate must reject peut_modifier_noyau == true")
		}
		c = drawAgent(rt)
		c.Spec.PeutModifierFitness = true
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatal("Validate must reject peut_modifier_fitness == true")
		}
	})
}

// (2) + (5) MayWrite denies IFF above the waterline, regardless of role; total + deterministic.
func TestProp_MayWrite_DeniesIffAboveWaterline(t *testing.T) {
	aboveTargets := []string{"kernel", "kernel.truth", "mirrors", "mirrors.mirror", "fitness", "fitness.grammar", "back/kernel/foo.go", "back/migrations/x.sql"}
	belowTargets := []string{"runtime.agent_run", "ideas", "ideas.candidate", "brain", "context", "front/web/app/x", "back/runtime/foo.go"}
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		for _, tgt := range aboveTargets {
			d := agentlayer.MayWrite(c.Spec, tgt)
			if d.Allowed {
				rt.Fatalf("role %q writing %q above the waterline must be DENIED", c.Spec.Role, tgt)
			}
			if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentWriteAboveWaterline {
				rt.Fatalf("deny above the waterline must carry AGENT_WRITE_ABOVE_WATERLINE, got %+v", d.BlockReason)
			}
			// deterministic
			if d2 := agentlayer.MayWrite(c.Spec, tgt); d2.Allowed != d.Allowed {
				rt.Fatal("MayWrite must be deterministic")
			}
		}
		for _, tgt := range belowTargets {
			d := agentlayer.MayWrite(c.Spec, tgt)
			if !d.Allowed {
				rt.Fatalf("role %q writing %q below the waterline must be ALLOWED, got %+v", c.Spec.Role, tgt, d.BlockReason)
			}
		}
	})
}

// (3) Propose always yields proposed + non-empty requires_authority; never admitted.
func TestProp_Propose_NeverAdmits(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		// ensure a propose right so Propose succeeds
		c.Spec.PeutProposerVerite = true
		p, err := agentlayer.Propose(c, rapid.StringN(0, 30, 30).Draw(rt, "scenario"))
		if err != nil {
			rt.Fatalf("a proposing agent must succeed: %v", err)
		}
		if p.Status != agentlayer.StatusProposed {
			rt.Fatalf("Propose must yield 'proposed', never 'admitted', got %q", p.Status)
		}
		if len(p.RequiresAuthority) == 0 {
			rt.Fatal("Propose must require a non-empty human authority (an agent never self-admits)")
		}
	})
}

// (4) Approve is never admitted for the proposing agent itself.
func TestProp_Approve_AgentNeverSelfAdmits(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Spec.PeutProposerVerite = true
		p, _ := agentlayer.Propose(c, "scenario")
		// self-approve by role OR name is always blocked
		for _, approver := range []authority.Role{authority.Role(c.Spec.Role), authority.Role(c.Spec.Nom)} {
			d := agentlayer.Approve(c, p, approver)
			if d.Status == agentlayer.StatusAdmitted {
				rt.Fatalf("an agent (%q) must NEVER self-admit", approver)
			}
		}
	})
}

// (6) Closed taxonomy: an unknown kind errors.
func TestProp_Validate_ClosedTaxonomy(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawAgent(rt)
		c.Kind = agentlayer.LayerKind(rapid.StringN(1, 12, 12).Draw(rt, "badkind"))
		if agentlayer.IsKnownLayerKind(c.Kind) {
			return // drew a valid kind by chance; skip
		}
		if err := agentlayer.Validate(c); err == nil {
			rt.Fatalf("an unknown layer-kind %q must make Validate error", c.Kind)
		}
	})
}
