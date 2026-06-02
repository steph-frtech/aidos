package main

import (
	"context"
	"testing"
)

// MCP behaviour mirror: the evolve server DEFERS to the pure evolve engine. These
// tests assert each tool's wiring (run emits only can_write; confine refuses /kernel;
// promote is a proposal gated on the three conditions, never a truth write).

func TestEvolveRun_EmitsOnlyCanWrite(t *testing.T) {
	s := newServer()
	_, out, err := s.evolveRun(context.Background(), nil, runInput{Cell: "createOrder", Budget: 8, Seed: 42})
	if err != nil {
		t.Fatalf("evolve_run: %v", err)
	}
	if len(out.Emitted) == 0 {
		t.Fatal("evolve_run emitted nothing")
	}
	for _, w := range out.Emitted {
		_, c, _ := s.evolveConfine(context.Background(), nil, confineInput{Path: w.Path})
		if c.Verdict != "allowed" {
			t.Fatalf("evolve_run emitted a non-confined write %q (%q) — the loop must never govern", w.Path, c.Verdict)
		}
	}
	// the run is retrievable.
	_, got, _ := s.evolveRunGet(context.Background(), nil, runGetInput{RunID: out.RunID})
	if got.RunID != out.RunID {
		t.Fatalf("evolve_run_get round-trip failed: %q", got.RunID)
	}
	_, list, _ := s.evolveRunList(context.Background(), nil, struct{}{})
	if len(list.RunIDs) != 1 {
		t.Fatalf("evolve_run_list = %v, want one run", list.RunIDs)
	}
}

func TestEvolveConfine_RefusesKernel(t *testing.T) {
	s := newServer()
	_, out, _ := s.evolveConfine(context.Background(), nil, confineInput{Path: "/kernel/createOrder.operation"})
	if out.Verdict != "refused" {
		t.Fatalf("confine /kernel = %q, want refused", out.Verdict)
	}
	if out.BlockCode != "SANDBOX_WRITE_ESCAPES_ZONE" {
		t.Fatalf("confine /kernel code = %q", out.BlockCode)
	}
}

func TestEvolveProposePromotion_GreenProposalNoTruthWrite(t *testing.T) {
	s := newServer()
	_, out, _ := s.evolveProposePromotion(context.Background(), nil, promoteInput{
		VariantID: "var-7", Niche: "createOrder/discount",
		Mirror: "green", OutOfSample: "green", AuthorityApproved: true, Fitness: 0.7,
	})
	if out.Verdict != "proposed" {
		t.Fatalf("promote(green∧oos∧approved) = %q, want proposed", out.Verdict)
	}
	if !out.Proposal || out.WritesTruth {
		t.Fatalf("promotion must be a PROPOSAL that writes no truth: %+v", out)
	}
}

func TestEvolveProposePromotion_RedMirrorRefused(t *testing.T) {
	s := newServer()
	_, out, _ := s.evolveProposePromotion(context.Background(), nil, promoteInput{
		VariantID: "var-9", Niche: "createOrder/discount",
		Mirror: "red", OutOfSample: "green", AuthorityApproved: true, Fitness: 0.99,
	})
	if out.Verdict != "refused" {
		t.Fatalf("promote(mirror_red, high score) = %q, want refused", out.Verdict)
	}
}

func TestEvolveServerRegistersTools(t *testing.T) {
	if newMCPServer(newServer()) == nil {
		t.Fatal("nil MCP server")
	}
}
