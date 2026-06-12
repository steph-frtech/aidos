package agentlayer_test

// S52 GOVERNANCE FIXTURE (state → command → events), the materialized mirror of
// tests/kernel/agent-layer-governance.fixture.md. reflects = kernel.agent_layer
// "bdd-writer" + the runtime AgentRun. test_kind = fixture, authority = above.
//
// The done invariant: an agent-role write above the waterline is
// AGENT_WRITE_ABOVE_WATERLINE-blocked, and a BDD-writer agent's proposed scenario
// stays un-admitted until a HUMAN authority approves it. An agent is never an
// authority — it proposes, it does not declare.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// bddWriter is the canonical "bdd-writer" CoucheAgent of the fixture.
func bddWriter() agentlayer.CoucheAgent {
	return agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			ID:                  "bdd-writer",
			Nom:                 "bdd-writer",
			Role:                "bdd-writer",
			Objectif:            "propose red scenarios",
			Modele:              "claude-fable-5",
			Provider:            agentlayer.ProviderAnthropic,
			PeutProposerVerite:  true,
			PeutModifierNoyau:   false,
			PeutModifierMiroir:  true,
			PeutModifierFitness: false,
			ZonesLecture:        []string{"kernel", "mirrors", "ideas", "brain"},
			ZonesEcriture:       []string{"ideas"},
			StopConditions:      []string{"red set still red"},
		},
		PolitiqueMemoire:  agentlayer.AgentContextPolicy{ReadZones: []string{"brain"}, FirewallDefersToS30: true},
		PolitiqueContexte: agentlayer.AgentContextPolicy{ReadZones: []string{"kernel"}, FirewallDefersToS30: true},
		PolitiqueEcriture: agentlayer.WritePolicy{AllowedWriteZones: []string{"ideas"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"product_owner"},
		},
		Scope:   scope.TruthScope{Region: scope.RegionEU},
		Version: "bdd-writer",
	}
}

// TestFixture_Validate_AgentLayerValid — validate yields a valid layer with the two
// always-false rights.
func TestFixture_Validate_AgentLayerValid(t *testing.T) {
	c := bddWriter()
	if err := agentlayer.Validate(c); err != nil {
		t.Fatalf("AgentLayerValid expected, got error: %v", err)
	}
	if c.Spec.PeutModifierNoyau {
		t.Fatal("peut_modifier_noyau must be false")
	}
	if c.Spec.PeutModifierFitness {
		t.Fatal("peut_modifier_fitness must be false")
	}
}

// TestFixture_Validate_RejectsKernelRight — a spec claiming PeutModifierNoyau is invalid.
func TestFixture_Validate_RejectsKernelRight(t *testing.T) {
	c := bddWriter()
	c.Spec.PeutModifierNoyau = true
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("a CoucheAgent claiming peut_modifier_noyau MUST be invalid (the wall)")
	}
	c = bddWriter()
	c.Spec.PeutModifierFitness = true
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("a CoucheAgent claiming peut_modifier_fitness MUST be invalid (the wall)")
	}
}

// TestFixture_Validate_RejectsAboveWaterlineWriteZone — a write zone above the line is invalid.
func TestFixture_Validate_RejectsAboveWaterlineWriteZone(t *testing.T) {
	c := bddWriter()
	c.Spec.ZonesEcriture = []string{"kernel.truth"}
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("a write zone resolving above the waterline MUST be invalid")
	}
}

// TestFixture_Validate_ClosedTaxonomy — a layer-kind outside the triad is invalid.
func TestFixture_Validate_ClosedTaxonomy(t *testing.T) {
	c := bddWriter()
	c.Kind = "rogue"
	if err := agentlayer.Validate(c); err == nil {
		t.Fatal("a layer-kind outside {agent, equipe_agents, orchestration} MUST be invalid")
	}
	for _, k := range []agentlayer.LayerKind{
		agentlayer.LayerKindAgent, agentlayer.LayerKindEquipeAgents, agentlayer.LayerKindOrchestration,
	} {
		c := bddWriter()
		c.Kind = k
		// BA24 — kind-aware Validate: an orchestration layer also REQUIRES a non-empty
		// team AND a well-formed policy (the closed taxonomy is unchanged; the kind-aware
		// shape guard is the BA24 addition).
		if k == agentlayer.LayerKindOrchestration {
			p := agentlayer.OrchestrationPolicy{
				ClaimArbitrage:     agentlayer.ConflictSerialiseThenMerge,
				FanOut:             agentlayer.FanModeParallel,
				FanIn:              agentlayer.FanModePipeline,
				ConflitMemeFichier: agentlayer.ConflictSerialiseThenMerge,
				MaxConcurrency:     0,
			}
			c.Equipe = []string{"member-a@v1", "member-b@v1"}
			c.Orchestration = &p
		}
		if err := agentlayer.Validate(c); err != nil {
			t.Fatalf("kind %q must validate, got %v", k, err)
		}
	}
}

// TestFixture_DoneCase1_AboveWaterlineWriteRefused — THE done case (1): an agent role
// writing kernel / mirrors / fitness is refused with AGENT_WRITE_ABOVE_WATERLINE, every role.
func TestFixture_DoneCase1_AboveWaterlineWriteRefused(t *testing.T) {
	spec := bddWriter().Spec
	for _, tc := range []struct {
		role, cible string
	}{
		{"bdd-writer", "kernel.truth"},
		{"bdd-writer", "mirrors.mirror"},
		{"executor", "fitness.grammar"},
		{"orchestrator", "kernel"},
	} {
		s := spec
		s.Role = tc.role
		action := agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: tc.cible}, s)
		if action.Autorisee {
			t.Fatalf("role %q writing %q MUST be refused above the waterline", tc.role, tc.cible)
		}
		if action.RaisonBlocage == nil || action.RaisonBlocage.Code != blockreason.CodeAgentWriteAboveWaterline {
			t.Fatalf("role %q writing %q: expected AGENT_WRITE_ABOVE_WATERLINE, got %+v", tc.role, tc.cible, action.RaisonBlocage)
		}
		// how_to_fix names the door idea → mirror → /goal → approbation.
		joined := ""
		for _, h := range action.RaisonBlocage.HowToFix {
			joined += h + " | "
		}
		if !containsAll(joined, "mirror", "goal", "approbation") {
			t.Fatalf("how_to_fix must name idea → mirror → /goal → approbation, got %q", joined)
		}
	}
}

// TestFixture_BelowWaterlineWriteAllowed — a runtime telemetry write is allowed.
func TestFixture_BelowWaterlineWriteAllowed(t *testing.T) {
	spec := bddWriter().Spec
	action := agentrun.ApplyWall(agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: "runtime.agent_run"}, spec)
	if !action.Autorisee {
		t.Fatalf("a below-the-line runtime write MUST be allowed, got %+v", action.RaisonBlocage)
	}
}

// TestFixture_DoneCase2_ProposeNotAdmitted — THE done case (2): a BDD-writer proposes a
// scenario; it stays `proposed`, requires a HUMAN authority, writes nothing.
func TestFixture_DoneCase2_ProposeNotAdmitted(t *testing.T) {
	c := bddWriter()
	p, err := agentlayer.Propose(c, "checkout charges tax on EU orders")
	if err != nil {
		t.Fatalf("a bdd-writer must be able to propose: %v", err)
	}
	if p.Status != agentlayer.StatusProposed {
		t.Fatalf("proposal status must be 'proposed' (never 'admitted'), got %q", p.Status)
	}
	if len(p.RequiresAuthority) != 1 || p.RequiresAuthority[0] != authority.Role("product_owner") {
		t.Fatalf("proposal must require the human authority product_owner, got %v", p.RequiresAuthority)
	}
	wantRoute := []string{"idea", "mirror", "goal", "approbation"}
	if len(p.Route) != len(wantRoute) {
		t.Fatalf("proposal route must be idea → mirror → goal → approbation, got %v", p.Route)
	}
	for i, r := range wantRoute {
		if p.Route[i] != r {
			t.Fatalf("proposal route[%d] = %q, want %q", i, p.Route[i], r)
		}
	}
}

// TestFixture_SelfApproveRefused — an agent CANNOT self-approve (an agent is never an
// authority); only a HUMAN approver in the graph admits.
func TestFixture_SelfApproveRefused(t *testing.T) {
	c := bddWriter()
	p, _ := agentlayer.Propose(c, "checkout charges tax on EU orders")

	self := agentlayer.Approve(c, p, authority.Role("bdd-writer"))
	if self.Status != agentlayer.StatusProposed {
		t.Fatalf("self-approve must leave the proposal 'proposed', got %q", self.Status)
	}
	if self.BlockReason == nil || self.BlockReason.Code != blockreason.CodeAgentWriteAboveWaterline {
		t.Fatalf("self-approve must be blocked with AGENT_WRITE_ABOVE_WATERLINE, got %+v", self.BlockReason)
	}

	human := agentlayer.Approve(c, p, authority.Role("product_owner"))
	if human.Status != agentlayer.StatusAdmitted {
		t.Fatalf("a human authority (product_owner) must admit the proposal, got %q", human.Status)
	}
}

// TestFixture_RecordRun_NotALayer — recording a run yields a content-addressed, below-the-line
// event with no version/mirror (a run is not a layer).
func TestFixture_RecordRun_NotALayer(t *testing.T) {
	run := agentrun.AgentRun{
		Agent:       "bdd-writer",
		Goal:        "g-checkout-tax",
		RedWorkItem: "rwi-1",
		StartedAt:   "2026-06-02T18:00:00Z",
		EndedAt:     "2026-06-02T18:05:00Z",
		Result:      agentrun.ResultStillRed,
	}
	rec, err := agentrun.Record(run)
	if err != nil {
		t.Fatalf("AgentRunRecorded expected, got %v", err)
	}
	if rec.ID == "" || len(rec.ID) != 64 {
		t.Fatalf("run id must be the 64-hex content hash, got %q", rec.ID)
	}
	// Determinism: same input ⇒ same id.
	rec2, _ := agentrun.Record(run)
	if rec.ID != rec2.ID {
		t.Fatalf("Record must be deterministic: %q != %q", rec.ID, rec2.ID)
	}
}

func containsAll(s string, subs ...string) bool {
	for _, sub := range subs {
		found := false
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}
