package main

import (
	"context"
	"testing"
)

func gr() graphIn {
	return graphIn{
		Domain:     "checkout",
		TruthKind:  "behaviour",
		Approvers:  []string{"product_owner", "security"},
		Veto:       []string{"legal"},
		Escalation: []string{"architecture_board"},
	}
}

func prop(actor, head string, granted []string) proposalIn {
	return proposalIn{
		Actor: actor, Domain: "checkout", TruthKind: "behaviour", Head: head, Granted: granted,
		Label:  "add discount",
		Spec:   &deltaIn{Kind: "add", Target: "Order.discount", Body: `{"ast":1}`},
		Mirror: &deltaIn{Kind: "add", Target: "Order.discount.mirror", Body: `{"g":1}`},
	}
}

// TOOL 1: truth_propose runs the gate without moving the head — a veto blocks.
func TestTool_ProposeVetoBlocks(t *testing.T) {
	_, out, err := proposeTool(context.Background(), nil, proposeInput{
		Graph: gr(), Proposal: prop("alice", "head-0", []string{"product_owner", "security", "legal"}),
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Outcome != "blocked" || out.BlockCode == "" {
		t.Fatalf("veto must block with a code; got %+v", out)
	}
	if out.NewHead != "" {
		t.Fatalf("propose must not move the head")
	}
}

// TOOL 2: truth_approve lands a fresh admitted write and moves the head.
func TestTool_ApproveFreshLands(t *testing.T) {
	_, out, err := approveTool(context.Background(), nil, approveInput{
		Graph: gr(), Proposal: prop("alice", "head-0", []string{"product_owner", "security"}), LiveHead: "head-0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Outcome != "applied" || out.NewHead == "" || out.EnvelopeStat != "APPLIED" {
		t.Fatalf("a fresh admitted write must land + move the head; got %+v", out)
	}
}

// TOOL 2b: truth_approve refuses a stale head — never last-write-wins.
func TestTool_ApproveStaleHeadRefused(t *testing.T) {
	_, out, err := approveTool(context.Background(), nil, approveInput{
		Graph: gr(), Proposal: prop("bob", "head-0", []string{"product_owner", "security"}), LiveHead: "head-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Outcome != "stale_head" || out.StaleAgainst != "head-1" {
		t.Fatalf("a stale head must be refused with the live head to re-run against; got %+v", out)
	}
}

// TOOL 2c: a fully-recorded override converts a veto block into an applied write with provenance.
func TestTool_ApproveOverrideRecorded(t *testing.T) {
	_, out, err := approveTool(context.Background(), nil, approveInput{
		Graph:    gr(),
		Proposal: prop("alice", "head-0", []string{"product_owner", "security", "legal"}),
		LiveHead: "head-0",
		Override: &overrideIn{By: "cto", Reason: "cleared", ADR: "ADR-0016"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.Outcome != "applied" || out.OverrideBy != "cto" || out.OverrideADR != "ADR-0016" {
		t.Fatalf("a recorded override must land with provenance; got %+v", out)
	}
}

// TOOL 3: truth_apply_concurrent — two proposals on one head, exactly one lands, the other stale.
func TestTool_ConcurrentNoOverwrite(t *testing.T) {
	_, out, err := concurrentTool(context.Background(), nil, concurrentInput{
		Graph: gr(), StartHead: "head-0",
		Proposals: []proposalIn{
			prop("alice", "head-0", []string{"product_owner", "security"}),
			prop("bob", "head-0", []string{"product_owner", "security"}),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.AppliedCount != 1 {
		t.Fatalf("exactly one concurrent write may land (anti-overwrite §9); got %d", out.AppliedCount)
	}
	if len(out.Stale) != 1 || out.Stale[0] != "bob" {
		t.Fatalf("bob must be the stale member who re-runs the mirrors; got %v", out.Stale)
	}
	if out.Decisions[1].Outcome != "stale_head" {
		t.Fatalf("the second apply must be stale_head; got %s", out.Decisions[1].Outcome)
	}
}

// server registers the three tools.
func TestServer_RegistersTools(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must build")
	}
}
