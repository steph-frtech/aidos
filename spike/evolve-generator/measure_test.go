// measure_test.go — THROWAWAY (EG01 spike). The EXECUTABLE falsifiability proof: it runs
// the stub vs self-play comparison, prints the report, and computes the go/no-go verdict.
// A spike is exempt from mirror-first (KRD §84), but this test IS the falsifiability check
// — it answers "does a self-play VARIANT generator behind the seam improve gate-passage
// and/or niche-coverage over the existing stub deterministic sampler?" with numbers.
//
// DETERMINISM-FIRST (§8): TestReproducible pins same-seed → same-metric using the FIXTURE
// proposer (no network). The real claude-CLI proposer is NEVER exercised here.
package evolvegen

import "testing"

// TestSpikeVerdict runs the full comparison + verdict and PRINTS the report. It fails only
// if the spike is internally inconsistent (e.g. claims GO but self-play won no extra niche)
// — the verdict (go/no-go) is data the spike reports, not a pass/fail of the test.
func TestSpikeVerdict(t *testing.T) {
	v := Decide()

	t.Logf("=== EG01 SPIKE — self-play variant generator vs stub deterministicSampler ===")
	for _, c := range v.Comparisons {
		t.Logf("[cell %s]", c.Cell)
		t.Logf("  stub      : candidates=%d promoted=%d niches=%v passage=%.0f%% coverage=%.0f%%",
			c.Stub.Candidates, c.Stub.Promoted, c.Stub.NichesCovered, c.Stub.GatePassageRate*100, c.Stub.NicheCoverage*100)
		t.Logf("  self-play : candidates=%d promoted=%d niches=%v passage=%.0f%% coverage=%.0f%%",
			c.Self.Candidates, c.Self.Promoted, c.Self.NichesCovered, c.Self.GatePassageRate*100, c.Self.NicheCoverage*100)
		t.Logf("  delta     : coverage %+.0f%% passage %+.0f%%", c.CoverageDelta*100, c.GatePassageDelta*100)
	}
	t.Logf("--- aggregate ---")
	t.Logf("stub      mean coverage=%.0f%% mean passage=%.0f%%", v.StubMeanCoverage*100, v.StubMeanPassage*100)
	t.Logf("self-play mean coverage=%.0f%% mean passage=%.0f%%", v.SelfMeanCoverage*100, v.SelfMeanPassage*100)
	t.Logf("coverage uplift=%+.1f%% (material threshold=%.1f%%)  passage uplift=%+.1f%%",
		v.CoverageUplift*100, v.MaterialCoverageUplift*100, v.PassageUplift*100)
	t.Logf("VERDICT: %s — %s", v.Decision, v.Rationale)

	// Internal consistency: a GO must be backed by self-play actually winning extra niches.
	if v.Decision == "go" && !(v.SelfMeanCoverage > v.StubMeanCoverage) {
		t.Fatalf("inconsistent verdict: GO but self-play won no extra niche coverage (%.2f vs %.2f)",
			v.SelfMeanCoverage, v.StubMeanCoverage)
	}
	// A NO-GO must be backed by self-play NOT winning extra niches.
	if v.Decision == "no-go" && v.SelfMeanCoverage > v.StubMeanCoverage {
		t.Fatalf("inconsistent verdict: NO-GO but self-play DID win extra coverage (%.2f vs %.2f)",
			v.SelfMeanCoverage, v.StubMeanCoverage)
	}
}

// TestGateIsSameForBothSamplers proves the gate is identical for the stub and the
// self-play sampler — the generator never gets an easier judge (anti-Goodhart, §8). We run
// the SAME variant through Gate and assert the verdict depends only on (cell, variant),
// not on which sampler produced it.
func TestGateIsSameForBothSamplers(t *testing.T) {
	cell := createOrderCell()
	v := Variant{ID: "x", Niche: "createOrder/discount", Mirror: MirrorGreen, OutOfSample: 0.9, Fitness: 0.6}
	g1 := Gate(cell, v)
	g2 := Gate(cell, v)
	if g1 != g2 {
		t.Fatalf("gate not a pure function of (cell, variant): %+v vs %+v", g1, g2)
	}
	if !g1.Passed {
		t.Fatalf("expected this variant to pass the gate, got: %+v", g1)
	}
}

// TestGateRefusesRedMirror — a bold mutation (mirror red) is NEVER promoted, whatever its
// fitness (the anti-Goodhart anchor). Proves the gate is not gameable by score.
func TestGateRefusesRedMirror(t *testing.T) {
	cell := createOrderCell()
	bold := Candidate{Niche: "createOrder/discount", Mutation: 0.95} // > 0.85 → mirror red
	v := Variant{
		ID:          "bold",
		Niche:       bold.Niche,
		Mirror:      deriveMirror(bold),
		OutOfSample: deriveOutOfSample(bold),
		Fitness:     0.99, // high fitness must NOT save it
	}
	g := Gate(cell, v)
	if g.Passed {
		t.Fatalf("a red-mirror variant was promoted despite high fitness — gate is gameable: %+v", g)
	}
	if g.MirrorGreen {
		t.Fatalf("expected mirror red for mutation 0.95, got green")
	}
}

// TestGateRefusesUnapprovedNiche — a variant landing in a niche the authority did not
// approve is refused even if mirror+oos are green (§66.1 authority condition).
func TestGateRefusesUnapprovedNiche(t *testing.T) {
	cell := createOrderCell()
	// "createOrder/subscription" is declared but NOT authority-approved in the fixture.
	v := Variant{ID: "sub", Niche: "createOrder/subscription", Mirror: MirrorGreen, OutOfSample: 0.99, Fitness: 0.7}
	g := Gate(cell, v)
	if g.Passed {
		t.Fatalf("variant in an unapproved niche was promoted: %+v", g)
	}
	if !g.MirrorGreen || !g.OutOfSampleGreen {
		t.Fatalf("expected mirror+oos green for this variant, got %+v", g)
	}
	if g.AuthorityApproved {
		t.Fatalf("expected authority NOT approved for createOrder/subscription")
	}
}

// TestStubMirrorsRealSampler — the spike's stub must faithfully reproduce the real
// back/mcp/evolve deterministicSampler shape: ONE candidate, niche "<cell>/baseline".
// (We assert the SHAPE, not import the real code — the spike module is standalone.)
func TestStubMirrorsRealSampler(t *testing.T) {
	cell := createOrderCell()
	got := stubSampler(cell, Budget, FixtureSeed)
	if len(got) != 1 {
		t.Fatalf("stub must yield exactly 1 candidate (like the real deterministicSampler), got %d", len(got))
	}
	if got[0].Niche != cell.ID+"/baseline" {
		t.Fatalf("stub niche must be %q (real sampler shape), got %q", cell.ID+"/baseline", got[0].Niche)
	}
}

// TestSelfPlayProducesHandful — the self-play sampler (premise) offers 5-10 candidates.
func TestSelfPlayProducesHandful(t *testing.T) {
	cell := createOrderCell()
	self := newSelfPlaySampler(fixtureProposer)
	got := self(cell, Budget, FixtureSeed)
	if len(got) < 5 || len(got) > 10 {
		t.Fatalf("self-play must offer 5-10 candidates, got %d", len(got))
	}
}

// TestProposerFailureYieldsNoFakeWin — if the proposer errors, the self-play sampler
// returns NOTHING (it never fabricates a win). The deterministic stub stays the fallback.
func TestProposerFailureYieldsNoFakeWin(t *testing.T) {
	cell := createOrderCell()
	failing := func(Cell, int, int64) ([]Candidate, error) { return nil, errContext }
	self := newSelfPlaySampler(failing)
	got := self(cell, Budget, FixtureSeed)
	if len(got) != 0 {
		t.Fatalf("a failing proposer must yield 0 candidates (no fake win), got %d", len(got))
	}
}

// errContext is a sentinel error for the failing-proposer test.
var errContext = &spikeErr{"proposer unavailable (offline)"}

type spikeErr struct{ s string }

func (e *spikeErr) Error() string { return e.s }

// TestReproducible is the DETERMINISM-FIRST reproducibility mirror: the same seed yields
// the SAME candidates, the SAME metrics and the SAME verdict every time — the measurement
// is a pure function, no LLM, no clock, no ambient rng. Run many times; any drift fails.
func TestReproducible(t *testing.T) {
	for i := 0; i < 200; i++ {
		v1 := Decide()
		v2 := Decide()
		if v1.Decision != v2.Decision ||
			v1.SelfMeanCoverage != v2.SelfMeanCoverage ||
			v1.StubMeanCoverage != v2.StubMeanCoverage ||
			v1.SelfMeanPassage != v2.SelfMeanPassage ||
			v1.CoverageUplift != v2.CoverageUplift {
			t.Fatalf("verdict not reproducible: %+v vs %+v", v1, v2)
		}
		// The fixture proposer itself must be byte-reproducible per (cell, seed).
		for _, cell := range AllCells() {
			a, _ := fixtureProposer(cell, Budget, FixtureSeed)
			b, _ := fixtureProposer(cell, Budget, FixtureSeed)
			if len(a) != len(b) {
				t.Fatalf("[%s] fixtureProposer count drift: %d vs %d", cell.ID, len(a), len(b))
			}
			for k := range a {
				if a[k] != b[k] {
					t.Fatalf("[%s] fixtureProposer candidate drift at %d: %+v vs %+v", cell.ID, k, a[k], b[k])
				}
			}
		}
	}
}

// TestParseProposalsDeterministic — the CLI output parser is a pure deterministic function
// (it is the deterministic check over the LLM's free text, §8). Malformed lines skipped.
func TestParseProposalsDeterministic(t *testing.T) {
	out := "createOrder/discount|0.3\n- createOrder/bulk|0.7\ngarbage line\ncreateOrder/giftcard|1.5\n||\n"
	a := parseProposals(out)
	b := parseProposals(out)
	if len(a) != len(b) {
		t.Fatalf("parse not deterministic: %d vs %d", len(a), len(b))
	}
	// 3 valid: discount(0.3), bulk(0.7), giftcard(clamped 1.0). "garbage" and "||" dropped.
	if len(a) != 3 {
		t.Fatalf("expected 3 parsed candidates, got %d: %+v", len(a), a)
	}
	if a[2].Mutation != 1.0 {
		t.Fatalf("expected giftcard mutation clamped to 1.0, got %v", a[2].Mutation)
	}
}
