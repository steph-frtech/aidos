// main_test.go — the S85 MCP-boundary mirror: the two done-criteria hold AT THE MCP DOOR.
//
//  1. A truth proposed by the loop is `proposed`, never admitted; a direct truth-write has no
//     tool (the wall holds — there is no truth-write tool, only propose).
//  2. approval_decide admits ONLY a real human holding the scope's authority; a viewer is
//     refused INSUFFICIENT_AUTHORITY and the proposal stays proposed.
package main

import (
	"context"
	"testing"
)

func TestMCP_Propose_YieldsProposedNeverAdmitted(t *testing.T) {
	_, out, err := propose(context.Background(), nil, proposeInput{
		Project:   "proj-A",
		AgentID:   "buildloop-agent-v1",
		AgentRun:  "run-42",
		Target:    "kernel.operation",
		Domain:    "checkout",
		TruthKind: "journey",
		Mirror:    "mirror://checkout",
		DiffHash:  "diff-1",
	})
	if err != nil {
		t.Fatalf("propose: %v", err)
	}
	if !out.Proposed || out.Proposal == nil {
		t.Fatalf("a legal truth must be proposed, got %+v", out)
	}
	if out.Proposal.Status != "proposed" {
		t.Fatalf("a proposal must be `proposed` at the MCP door (never admitted), got %q", out.Proposal.Status)
	}
	if out.Proposal.Mirror == "" {
		t.Fatal("the proposal must carry its mirror (no headless approval)")
	}
}

func TestMCP_Propose_BelowWaterlineRefused(t *testing.T) {
	_, out, _ := propose(context.Background(), nil, proposeInput{
		Project: "proj-A", AgentID: "a", Target: "archive.content", Domain: "checkout", TruthKind: "journey", Mirror: "m",
	})
	if out.Proposed {
		t.Fatal("a below-the-line target is not a truth — propose must refuse it")
	}
	if out.BlockCode != "NOT_A_TRUTH_WRITE" {
		t.Fatalf("a below-the-line target must be refused NOT_A_TRUTH_WRITE, got %q", out.BlockCode)
	}
}

func TestMCP_Propose_MissingMirrorRefused(t *testing.T) {
	_, out, _ := propose(context.Background(), nil, proposeInput{
		Project: "proj-A", AgentID: "a", Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "",
	})
	if out.Proposed || out.BlockCode != "MISSING_MIRROR" {
		t.Fatalf("a truth with no mirror must be refused MISSING_MIRROR, got %+v", out)
	}
}

func TestMCP_Decide_HumanApprovalGate(t *testing.T) {
	base := decideInput{
		Project:         "proj-A",
		ProposalID:      "p-1",
		Domain:          "checkout",
		TruthKind:       "journey",
		Mirror:          "mirror://checkout",
		Target:          "kernel.operation",
		ProposedByAgent: "buildloop-agent-v1",
		Approvers:       []string{"product_owner"},
		Bindings: []authorityBindingIn{
			{Domain: "checkout", MinProjectRole: "owner", Roles: []string{"product_owner"}},
		},
	}

	// A VIEWER holds no scope authority — INSUFFICIENT_AUTHORITY, stays proposed.
	viewer := base
	viewer.ActorIdentity = "u-viewer"
	viewer.ActorDisplay = "Vera"
	viewer.MemberRole = "viewer"
	_, dv, err := decide(context.Background(), nil, viewer)
	if err != nil {
		t.Fatalf("decide viewer: %v", err)
	}
	if dv.Admitted || dv.Status != "proposed" {
		t.Fatalf("a viewer must NOT admit — the proposal stays proposed, got %+v", dv)
	}
	if dv.BlockCode != "INSUFFICIENT_AUTHORITY" {
		t.Fatalf("a non-authority approval must be INSUFFICIENT_AUTHORITY, got %q", dv.BlockCode)
	}

	// An OWNER holds product_owner via the binding — ADMITTED.
	owner := base
	owner.ActorIdentity = "u-owner"
	owner.ActorDisplay = "Olga"
	owner.MemberRole = "owner"
	_, do, err := decide(context.Background(), nil, owner)
	if err != nil {
		t.Fatalf("decide owner: %v", err)
	}
	if !do.Admitted || do.Status != "admitted" {
		t.Fatalf("a real human holding the scope authority must ADMIT, got %+v", do)
	}

	// A PLACEHOLDER actor can never admit.
	ph := base
	ph.ActorIdentity = "agent"
	ph.ActorDisplay = "the agent"
	ph.MemberRole = "owner"
	_, dp, _ := decide(context.Background(), nil, ph)
	if dp.Admitted || dp.BlockCode != "PLACEHOLDER_ACTOR" {
		t.Fatalf("a placeholder actor must be refused PLACEHOLDER_ACTOR, got %+v", dp)
	}
}

func TestMCP_Inbox_SurfacesPendingWithMirror(t *testing.T) {
	props := []proposeInput{
		{Project: "proj-A", AgentID: "a", Target: "kernel.operation", Domain: "checkout", TruthKind: "journey", Mirror: "mirror://a1"},
		{Project: "proj-B", AgentID: "a", Target: "kernel.policy", Domain: "checkout", TruthKind: "journey", Mirror: "mirror://b1"},
	}
	_, out, err := inbox(context.Background(), nil, inboxInput{Project: "proj-A", Proposals: props})
	if err != nil {
		t.Fatalf("inbox: %v", err)
	}
	if len(out.Pending) != 1 {
		t.Fatalf("the proj-A inbox must surface exactly its one pending proposal, got %d", len(out.Pending))
	}
	if out.Pending[0].Mirror == "" {
		t.Fatal("a pending proposal must carry its mirror")
	}
	if out.Pending[0].Project != "proj-A" {
		t.Fatalf("the inbox must be project-isolated, got %q", out.Pending[0].Project)
	}
}
