// approval_fixture_test.go — the S85 DONE-CRITERION mirror (the two fixtures the step pins):
//
//  1. AN AGENT WRITE ABOVE THE WATERLINE IS REFUSED (AGENT_WRITE_ABOVE_WATERLINE). The build
//     loop attempting to write a truth DIRECTLY (a kernel/mirrors/fitness target) is refused;
//     it never lands a truth by itself.
//
//  2. A PROPOSED TRUTH REQUIRES HUMAN APPROVAL BEFORE IT LANDS. A truth the loop's work implies
//     is born `proposed`; a real human holding the scope's authority (S63) admits it; a member
//     WITHOUT that authority is refused INSUFFICIENT_AUTHORITY and the proposal STAYS proposed.
//
// The mirror is RED before approval.go exists and GREEN after. It is the executable form of the
// step's /goal (CLAUDE.md §6, the bootstrap-exception file form — the mirrors schema persists
// it at S06's back-fill; here it is a file + an executable test).
package approval

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/authoritybinding"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// buildLoopSpec is the governed build-loop agent spec — ALWAYS PeutModifierNoyau:false (the
// wall, §2). It may PROPOSE a truth (PeutProposerVerite) but never write one.
func buildLoopSpec() agentlayer.AgentSpec {
	return agentlayer.AgentSpec{
		ID:                 "buildloop-agent-v1",
		Nom:                "build-loop",
		Role:               "executor",
		PeutProposerVerite: true,
		// The wall fields are structurally false (Validate forces them; the loop never writes truth).
		PeutModifierNoyau:   false,
		PeutModifierFitness: false,
	}
}

// checkoutGraph is a scope AuthorityGraph requiring a product_owner approver for a journey
// truth in the checkout domain (the slice the demo exercises).
func checkoutGraph() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "checkout",
		TruthKind: authority.TruthKind("journey"),
		Approvers: []authority.Role{"product_owner"},
	}
}

// ownerGrantsProductOwner is the declared S63 binding: a project OWNER holds the product_owner
// authority role in the checkout domain.
func ownerGrantsProductOwner() []authoritybinding.AuthorityRoleBinding {
	return []authoritybinding.AuthorityRoleBinding{
		{Domain: "checkout", MinProjectRole: membership.RoleOwner, Roles: []authority.Role{"product_owner"}},
	}
}

// ── FIXTURE 1 — the wall refuses a DIRECT agent truth-write (AGENT_WRITE_ABOVE_WATERLINE) ──

func TestBuildLoopDirectTruthWriteIsRefused(t *testing.T) {
	spec := buildLoopSpec()

	// The loop attempts to write a truth DIRECTLY (an above-waterline kernel target).
	br := RefuseDirectWrite(spec, "kernel.operation")
	if br == nil {
		t.Fatal("a DIRECT agent write above the waterline MUST be refused — the wall held nothing")
	}
	if br.Code != blockreason.CodeAgentWriteAboveWaterline {
		t.Fatalf("the refusal must be AGENT_WRITE_ABOVE_WATERLINE, got %q", br.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("a wall refusal without a fix path is a prison (§44.5)")
	}

	// A below-the-line target is NOT a truth — the wall refuses nothing there.
	if RefuseDirectWrite(spec, "archive.content") != nil {
		t.Fatal("a below-the-line write is not a truth — the wall must refuse nothing")
	}
}

// ProposeTruth itself refuses to wrap a below-the-line target as a fake proposal (the propose
// door is for truths only). And it refuses a truth with no mirror (a monster).
func TestProposeTruthGuards(t *testing.T) {
	spec := buildLoopSpec()

	// A below-the-line target is not a truth: NOT_A_TRUTH_WRITE, no proposal.
	_, br := ProposeTruth(spec, "proj-A", "run-1", TruthWrite{
		Target: "archive.content", Domain: "checkout", TruthKind: "journey", Mirror: "mir-1",
	})
	if br == nil || string(br.Code) != "NOT_A_TRUTH_WRITE" {
		t.Fatalf("a below-the-line target must be refused NOT_A_TRUTH_WRITE, got %+v", br)
	}

	// A truth with no mirror is a monster: MISSING_MIRROR, no proposal.
	_, br = ProposeTruth(spec, "proj-A", "run-1", TruthWrite{
		Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "",
	})
	if br == nil || br.Code != blockreason.CodeMissingMirror {
		t.Fatalf("a truth with no mirror must be refused MISSING_MIRROR, got %+v", br)
	}
}

// ── FIXTURE 2 — a proposed truth requires HUMAN APPROVAL before it lands ───────────────────

func TestProposedTruthRequiresHumanApproval(t *testing.T) {
	spec := buildLoopSpec()
	bindings := ownerGrantsProductOwner()
	graph := checkoutGraph()

	// The loop's work implies a truth (the checkout journey). It PROPOSES — never writes.
	p, br := ProposeTruth(spec, "proj-A", "run-42", TruthWrite{
		Target:    "kernel.operation",
		Domain:    "checkout",
		TruthKind: "journey",
		Mirror:    "mirror://checkout-happy-path",
		DiffHash:  "diff-abc",
	})
	if br != nil {
		t.Fatalf("a legal truth proposal must succeed, got block %+v", br)
	}
	if p.Status != StatusProposed {
		t.Fatalf("a fresh proposal must be `proposed`, got %q", p.Status)
	}
	if p.ID == "" {
		t.Fatal("a proposal must be content-addressed")
	}
	if p.ProposedByAgent != "buildloop-agent-v1" {
		t.Fatalf("provenance must name the AGENT that proposed, got %q", p.ProposedByAgent)
	}

	// (a) A member WITHOUT the scope's authority (a viewer holds NO product_owner authority)
	//     is refused INSUFFICIENT_AUTHORITY and the proposal STAYS proposed.
	viewer := &membership.Membership{Identity: "u-viewer", ProjectID: "proj-A", Role: membership.RoleViewer}
	viewerActor := authoritybinding.RealActor{Identity: "u-viewer", Display: "Vera Viewer"}
	dViewer := Decide(p, graph, viewerActor, viewer, bindings)
	if dViewer.Status != StatusProposed {
		t.Fatalf("a viewer holds no scope authority — the proposal MUST stay proposed, got %q", dViewer.Status)
	}
	if dViewer.BlockReason == nil || dViewer.BlockReason.Code != authoritybinding.CodeInsufficientAuthority {
		t.Fatalf("a non-authority approval must be refused INSUFFICIENT_AUTHORITY, got %+v", dViewer.BlockReason)
	}
	// The proposal did NOT land.
	if got := Admitted(p, dViewer); got.Status != StatusProposed {
		t.Fatalf("a refused approval must leave the truth UN-landed (proposed), got %q", got.Status)
	}

	// (b) A real human holding the scope's authority (an OWNER, who holds product_owner via the
	//     declared binding) ADMITS the proposal — only THEN does the truth land.
	owner := &membership.Membership{Identity: "u-owner", ProjectID: "proj-A", Role: membership.RoleOwner}
	ownerActor := authoritybinding.RealActor{Identity: "u-owner", Display: "Olga Owner"}
	dOwner := Decide(p, graph, ownerActor, owner, bindings)
	if dOwner.Status != StatusAdmitted {
		t.Fatalf("a real human holding the scope authority must ADMIT the proposal, got %q (block %+v)", dOwner.Status, dOwner.BlockReason)
	}
	landed := Admitted(p, dOwner)
	if landed.Status != StatusAdmitted {
		t.Fatalf("an admitted proposal must transition to `admitted`, got %q", landed.Status)
	}
	// The content address is UNCHANGED — admission is a transition over the SAME proposal.
	if landed.ID != p.ID {
		t.Fatalf("admission must not change the content address (same proposal), %q != %q", landed.ID, p.ID)
	}

	// (c) A FORGED `admitted` status on the input is RE-DERIVED away: a viewer can never admit,
	//     no matter what status the input claims.
	forged := p
	forged.Status = StatusAdmitted // a malicious loop forges admission in memory
	dForged := Decide(forged, graph, viewerActor, viewer, bindings)
	if dForged.Status != StatusProposed {
		t.Fatalf("a forged `admitted` must be re-derived away (viewer cannot admit), got %q", dForged.Status)
	}

	// (d) A PLACEHOLDER actor (no real human) can never admit a truth.
	placeholderActor := authoritybinding.RealActor{Identity: "agent", Display: "the agent"}
	dPlaceholder := Decide(p, graph, placeholderActor, owner, bindings)
	if dPlaceholder.Status != StatusProposed {
		t.Fatalf("a placeholder actor can never admit a truth, got %q", dPlaceholder.Status)
	}
	if dPlaceholder.BlockReason == nil || dPlaceholder.BlockReason.Code != authoritybinding.CodePlaceholderActor {
		t.Fatalf("a placeholder approval must be refused PLACEHOLDER_ACTOR, got %+v", dPlaceholder.BlockReason)
	}
}

// ── THE INBOX — the per-project surface of pending agent proposals with their mirrors ──────

func TestApprovalInboxSurfacesPendingProposals(t *testing.T) {
	spec := buildLoopSpec()

	mk := func(project, mirror, target string) AgentTruthProposal {
		p, br := ProposeTruth(spec, project, "run", TruthWrite{
			Target: target, Domain: "checkout", TruthKind: "journey", Mirror: mirror,
		})
		if br != nil {
			t.Fatalf("proposal for %s/%s must succeed, got %+v", project, mirror, br)
		}
		return p
	}

	pA1 := mk("proj-A", "mirror://a1", "kernel.operation")
	pA2 := mk("proj-A", "mirror://a2", "kernel.policy")
	pB1 := mk("proj-B", "mirror://b1", "kernel.entity")

	// An ADMITTED proposal of project A has landed — it is no longer pending.
	graph := checkoutGraph()
	owner := &membership.Membership{Identity: "u-owner", ProjectID: "proj-A", Role: membership.RoleOwner}
	ownerActor := authoritybinding.RealActor{Identity: "u-owner", Display: "Olga Owner"}
	pA2Landed := Admitted(pA2, Decide(pA2, graph, ownerActor, owner, ownerGrantsProductOwner()))

	all := []AgentTruthProposal{pA1, pA2Landed, pB1}

	inbox := BuildInbox("proj-A", all)
	if inbox.Project != "proj-A" {
		t.Fatalf("the inbox must scope to its project, got %q", inbox.Project)
	}
	// Only proj-A's PROPOSED proposals appear: pA1 (pA2 landed → excluded, pB1 is another project).
	if len(inbox.Pending) != 1 {
		t.Fatalf("the proj-A inbox must surface exactly the one pending proposal, got %d", len(inbox.Pending))
	}
	if inbox.Pending[0].ID != pA1.ID {
		t.Fatalf("the inbox must surface pA1, got %q", inbox.Pending[0].ID)
	}
	// Every pending proposal carries its mirror (no headless approval — the proof is present).
	if inbox.Pending[0].Truth.Mirror == "" {
		t.Fatal("a pending proposal must carry its mirror (the human approves WHAT IS PROVEN)")
	}

	// A project with no proposals yields an empty (never nil-panic) inbox.
	empty := BuildInbox("proj-Z", all)
	if len(empty.Pending) != 0 {
		t.Fatalf("a project with no proposals must yield an empty inbox, got %d", len(empty.Pending))
	}
}
