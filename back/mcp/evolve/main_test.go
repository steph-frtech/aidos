package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/evolve"
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

// EG03: the self-play sampler is wired behind the SAME frozen seam. The test injects the
// deterministic FixtureProposer (HERMETIC — it never touches the network; the real
// ClaudeProposer is wired only in main()). The run still emits ONLY can_write writes (the
// wall holds whichever sampler is armed).
func TestEvolveRun_SelfPlayStillConfined(t *testing.T) {
	s := newServerWithSelfPlay(evolve.FixtureProposer)
	_, out, err := s.evolveRun(context.Background(), nil, runInput{Cell: "createOrder", Budget: 8, Seed: 7})
	if err != nil {
		t.Fatalf("evolve_run (self-play): %v", err)
	}
	if len(out.Emitted) == 0 {
		t.Fatal("self-play evolve_run emitted nothing")
	}
	for _, w := range out.Emitted {
		_, c, _ := s.evolveConfine(context.Background(), nil, confineInput{Path: w.Path})
		if c.Verdict != "allowed" {
			t.Fatalf("self-play emitted a non-confined write %q (%q) — the loop must never govern", w.Path, c.Verdict)
		}
	}
}

// EG03: the self-play run (FixtureProposer-backed) is DETERMINISTIC for the same (cell,
// seed) — the reproducibility mirror over the MCP wiring. Hermetic: no network.
func TestEvolveRun_SelfPlayDeterministicFallback(t *testing.T) {
	a := newServerWithSelfPlay(evolve.FixtureProposer)
	b := newServerWithSelfPlay(evolve.FixtureProposer)
	_, outA, _ := a.evolveRun(context.Background(), nil, runInput{Cell: "createOrder", Budget: 8, Seed: 7})
	_, outB, _ := b.evolveRun(context.Background(), nil, runInput{Cell: "createOrder", Budget: 8, Seed: 7})
	if outA.Variant != outB.Variant || outA.Niche != outB.Niche || len(outA.Emitted) != len(outB.Emitted) {
		t.Fatalf("self-play fallback not deterministic: %+v vs %+v", outA, outB)
	}
}

// EG04: the evolve_coverage tool is the capability door (ADR 0009) over the EG04 generators.
// It measures, per generator (novelty | poet | mome), the gate-passing niche coverage on a cell
// vs the deterministic baseline — the SAME frozen gate, the generators only change WHAT is
// proposed. It surfaces the EG04 win: novelty/poet/mome cover ≥ the deterministic baseline (and,
// on this under-covering seed/budget, STRICTLY more). HERMETIC: search strategies, no network.
func TestEvolveCoverage_GeneratorsWidenVsBaseline(t *testing.T) {
	s := newServer()
	in := coverageInput{
		Cell:                    "createOrder",
		Niches:                  []string{"createOrder/baseline", "createOrder/discount", "createOrder/bulk", "createOrder/giftcard", "createOrder/subscription", "createOrder/backorder"},
		AuthorityApprovedNiches: []string{"createOrder/baseline", "createOrder/discount", "createOrder/bulk", "createOrder/giftcard"},
		OutOfSampleThreshold:    0.55,
		Budget:                  5,
		Seed:                    1,
	}
	_, out, err := s.evolveCoverage(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("evolve_coverage: %v", err)
	}
	if out.Baseline <= 0 {
		t.Fatalf("baseline coverage should be positive: %+v", out)
	}
	if len(out.Generators) != 3 {
		t.Fatalf("expected 3 generators (novelty,poet,mome), got %d: %+v", len(out.Generators), out.Generators)
	}
	for _, g := range out.Generators {
		if g.Coverage < out.Baseline {
			t.Fatalf("generator %q regressed coverage: %d < baseline %d", g.Name, g.Coverage, out.Baseline)
		}
		if g.WritesTruth {
			t.Fatalf("coverage report claims a truth write for %q — the wall is breached: %+v", g.Name, g)
		}
		// on this under-covering seed/budget, every named generator strictly widens.
		if g.Coverage <= out.Baseline {
			t.Fatalf("generator %q did not strictly widen on the under-covering fixture: %d ≤ %d", g.Name, g.Coverage, out.Baseline)
		}
	}
}

// EG04: evolve_coverage is DETERMINISTIC — same (cell, niches, budget, seed) → same report.
func TestEvolveCoverage_Deterministic(t *testing.T) {
	s := newServer()
	in := coverageInput{
		Cell:                    "createOrder",
		Niches:                  []string{"createOrder/baseline", "createOrder/discount", "createOrder/bulk", "createOrder/giftcard"},
		AuthorityApprovedNiches: []string{"createOrder/baseline", "createOrder/discount", "createOrder/bulk", "createOrder/giftcard"},
		OutOfSampleThreshold:    0.55,
		Budget:                  5,
		Seed:                    1,
	}
	_, a, _ := s.evolveCoverage(context.Background(), nil, in)
	_, b, _ := s.evolveCoverage(context.Background(), nil, in)
	if a.Baseline != b.Baseline || len(a.Generators) != len(b.Generators) {
		t.Fatalf("evolve_coverage not deterministic: %+v vs %+v", a, b)
	}
	for i := range a.Generators {
		if a.Generators[i] != b.Generators[i] {
			t.Fatalf("evolve_coverage generator %d not deterministic: %+v vs %+v", i, a.Generators[i], b.Generators[i])
		}
	}
}

// EG04: evolve_run accepts a generator selector and the chosen generator runs through the SAME
// frozen seam — the run still emits ONLY can_write (the wall holds whichever generator is armed).
func TestEvolveRun_GeneratorStillConfined(t *testing.T) {
	for _, gen := range []string{"novelty", "poet", "mome"} {
		s := newServer()
		_, out, err := s.evolveRun(context.Background(), nil, runInput{Cell: "createOrder", Budget: 8, Seed: 7, Generator: gen})
		if err != nil {
			t.Fatalf("evolve_run (generator %q): %v", gen, err)
		}
		if len(out.Emitted) == 0 {
			t.Fatalf("generator %q evolve_run emitted nothing", gen)
		}
		for _, w := range out.Emitted {
			_, c, _ := s.evolveConfine(context.Background(), nil, confineInput{Path: w.Path})
			if c.Verdict != "allowed" {
				t.Fatalf("generator %q emitted a non-confined write %q (%q)", gen, w.Path, c.Verdict)
			}
		}
	}
}
