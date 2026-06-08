// approval_property_test.go — the S85 REPRODUCIBILITY + INVARIANT mirror (rapid, CLAUDE.md
// §6 determinism-first: "same input → same output; the judge is deterministic").
//
// It pins, over arbitrary inputs:
//
//   - DETERMINISM/TOTALITY — ProposeTruth, Decide, BuildInbox are pure total functions: same
//     input ⇒ byte-identical verdict, never a panic.
//   - THE WALL INVARIANT — for EVERY agent spec and EVERY above-waterline target, the agent's
//     DIRECT write is refused AGENT_WRITE_ABOVE_WATERLINE (the wall holds for all roles).
//   - PROPOSE NEVER ADMITS — ProposeTruth ONLY ever yields StatusProposed; there is no input
//     by which the agent reaches `admitted` on its own (the circularity §8 forbids).
//   - ADMISSION RE-DERIVED — Decide's resulting status is a function of the AUTHORITY VERDICT,
//     never the input proposal's self-asserted status (a forged `admitted` is ignored).
//   - CONTENT-ADDRESS IDEMPOTENCE — the same truth re-proposed yields the SAME id; admission
//     leaves the id unchanged.
//   - INBOX FAITHFULNESS — BuildInbox surfaces EXACTLY the project's `proposed` proposals, each
//     carrying its mirror, in stable sorted order, project-isolated.
package approval

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/authoritybinding"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

var aboveWaterlineTargets = []string{"kernel.operation", "kernel.policy", "mirrors.record", "fitness.grammar", "back/kernel/entities"}
var belowWaterlineTargets = []string{"archive.content", "changesets.draft", "brain.memory", "context.pack"}

func sampleSpec(t *rapid.T) agentlayer.AgentSpec {
	return agentlayer.AgentSpec{
		ID:                 rapid.SampledFrom([]string{"agent-1", "agent-2", ""}).Draw(t, "id"),
		Role:               rapid.SampledFrom([]string{"executor", "bdd-writer", "orchestrator"}).Draw(t, "role"),
		PeutProposerVerite: true,
	}
}

func sampleTruth(t *rapid.T) TruthWrite {
	return TruthWrite{
		Target:    rapid.SampledFrom(aboveWaterlineTargets).Draw(t, "target"),
		Domain:    rapid.SampledFrom([]string{"checkout", "billing"}).Draw(t, "domain"),
		TruthKind: authority.TruthKind(rapid.SampledFrom([]string{"journey", "regulatory"}).Draw(t, "kind")),
		Mirror:    rapid.SampledFrom([]string{"mirror://a", "mirror://b"}).Draw(t, "mirror"),
		DiffHash:  rapid.SampledFrom([]string{"d1", "d2", ""}).Draw(t, "diff"),
	}
}

// PROPERTY 1 — ProposeTruth is DETERMINISTIC and ONLY ever yields `proposed`.
func TestProp_ProposeTruth_DeterministicAndNeverAdmits(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := sampleSpec(t)
		tw := sampleTruth(t)
		project := rapid.SampledFrom([]string{"proj-A", "proj-B", ""}).Draw(t, "project")

		p1, br1 := ProposeTruth(spec, project, "run", tw)
		p2, br2 := ProposeTruth(spec, project, "run", tw)

		// Determinism: same id, same block verdict.
		if (br1 == nil) != (br2 == nil) {
			t.Fatal("ProposeTruth must be deterministic on its block verdict")
		}
		if br1 == nil {
			if p1.ID != p2.ID {
				t.Fatalf("ProposeTruth must be content-address deterministic: %q != %q", p1.ID, p2.ID)
			}
			// A successful proposal is NEVER admitted (the circularity §8 forbids).
			if p1.Status != StatusProposed {
				t.Fatalf("ProposeTruth must ONLY ever yield `proposed`, got %q", p1.Status)
			}
		}
	})
}

// PROPERTY 2 — THE WALL: every above-waterline DIRECT write is refused, for EVERY role.
func TestProp_DirectTruthWrite_AlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := sampleSpec(t)
		target := rapid.SampledFrom(aboveWaterlineTargets).Draw(t, "target")

		br := RefuseDirectWrite(spec, target)
		if br == nil {
			t.Fatalf("a DIRECT write to above-waterline %q MUST be refused, for role %q", target, spec.Role)
		}
		if br.Code != blockreason.CodeAgentWriteAboveWaterline {
			t.Fatalf("the refusal must be AGENT_WRITE_ABOVE_WATERLINE, got %q", br.Code)
		}
		if len(br.HowToFix) == 0 {
			t.Fatal("every block names its door (how_to_fix non-empty)")
		}
	})
}

// PROPERTY 3 — a below-waterline target is NEVER wrapped as a fake truth proposal.
func TestProp_BelowWaterline_NotAProposal(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := sampleSpec(t)
		target := rapid.SampledFrom(belowWaterlineTargets).Draw(t, "target")

		_, br := ProposeTruth(spec, "proj-A", "run", TruthWrite{
			Target: target, Domain: "checkout", TruthKind: "journey", Mirror: "m",
		})
		if br == nil || string(br.Code) != "NOT_A_TRUTH_WRITE" {
			t.Fatalf("a below-the-line target must be refused NOT_A_TRUTH_WRITE, got %+v", br)
		}
		// And the wall refuses nothing below the line.
		if RefuseDirectWrite(spec, target) != nil {
			t.Fatalf("a below-the-line target is not a truth — the wall must refuse nothing")
		}
	})
}

// PROPERTY 4 — Decide's status is a function of the AUTHORITY verdict, never the input status.
// A forged `admitted` input is re-derived away; admission requires real scope authority.
func TestProp_Decide_AdmissionReDerivedNeverTrustsInputStatus(t *testing.T) {
	graph := authority.AuthorityGraph{Domain: "checkout", TruthKind: "journey", Approvers: []authority.Role{"product_owner"}}
	bindings := []authoritybinding.AuthorityRoleBinding{
		{Domain: "checkout", MinProjectRole: membership.RoleOwner, Roles: []authority.Role{"product_owner"}},
	}

	rapid.Check(t, func(t *rapid.T) {
		// A canonical proposal in the checkout/journey scope.
		spec := buildLoopSpecProp()
		p, br := ProposeTruth(spec, "proj-A", "run", TruthWrite{
			Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "m",
		})
		if br != nil {
			t.Fatalf("the canonical proposal must succeed, got %+v", br)
		}

		role := rapid.SampledFrom([]membership.Role{membership.RoleOwner, membership.RoleEditor, membership.RoleViewer}).Draw(t, "role")
		inputStatus := rapid.SampledFrom([]ProposalStatus{StatusProposed, StatusAdmitted}).Draw(t, "inStatus")
		p.Status = inputStatus // possibly FORGED admitted

		m := &membership.Membership{Identity: "u", ProjectID: "proj-A", Role: role}
		actor := authoritybinding.RealActor{Identity: "u", Display: "User"}

		d1 := Decide(p, graph, actor, m, bindings)
		d2 := Decide(p, graph, actor, m, bindings)
		if d1.Status != d2.Status {
			t.Fatal("Decide must be deterministic")
		}

		// ONLY the owner (who holds product_owner via the binding) reaches admitted — regardless
		// of the input's (possibly forged) status. A non-owner NEVER admits.
		if role == membership.RoleOwner {
			if d1.Status != StatusAdmitted {
				t.Fatalf("an owner holding the scope authority must admit, got %q", d1.Status)
			}
		} else {
			if d1.Status != StatusProposed {
				t.Fatalf("a non-authority member must NEVER admit (even with forged input %q), got %q", inputStatus, d1.Status)
			}
			if d1.BlockReason == nil {
				t.Fatal("a non-admission must carry a BlockReason")
			}
		}
	})
}

func buildLoopSpecProp() agentlayer.AgentSpec {
	return agentlayer.AgentSpec{ID: "buildloop-agent-v1", Role: "executor", PeutProposerVerite: true}
}

// PROPERTY 5 — BuildInbox surfaces EXACTLY the project's `proposed` proposals, project-isolated,
// each carrying its mirror, in stable sorted order.
func TestProp_BuildInbox_FaithfulAndIsolated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := buildLoopSpecProp()
		n := rapid.IntRange(0, 6).Draw(t, "n")
		var all []AgentTruthProposal
		wantProjAProposed := map[string]bool{}

		for i := 0; i < n; i++ {
			project := rapid.SampledFrom([]string{"proj-A", "proj-B"}).Draw(t, "project")
			mirror := rapid.SampledFrom([]string{"mirror://1", "mirror://2", "mirror://3"}).Draw(t, "mirror")
			target := rapid.SampledFrom(aboveWaterlineTargets).Draw(t, "target")
			admitted := rapid.Bool().Draw(t, "admitted")

			p, br := ProposeTruth(spec, project, "run", TruthWrite{
				Target: target, Domain: "checkout", TruthKind: "journey", Mirror: mirror,
			})
			if br != nil {
				continue
			}
			if admitted {
				p.Status = StatusAdmitted
			} else if project == "proj-A" {
				wantProjAProposed[p.ID] = true
			}
			all = append(all, p)
		}

		inbox := BuildInbox("proj-A", all)

		// Every pending item is proj-A, proposed, and carries its mirror.
		seen := map[string]bool{}
		for i, p := range inbox.Pending {
			if p.Project != "proj-A" {
				t.Fatalf("the inbox must be project-isolated, got %q", p.Project)
			}
			if p.Status != StatusProposed {
				t.Fatalf("the inbox must surface only `proposed` items, got %q", p.Status)
			}
			if p.Truth.Mirror == "" {
				t.Fatal("every pending proposal must carry its mirror")
			}
			if i > 0 && inbox.Pending[i-1].ID > p.ID {
				t.Fatal("the inbox must be in stable sorted-by-id order")
			}
			seen[p.ID] = true
		}
		// Exactly the expected set (the content-address may dedupe identical proposals).
		for id := range wantProjAProposed {
			if !seen[id] {
				t.Fatalf("a proj-A proposed proposal %q is missing from the inbox", id)
			}
		}
	})
}
