package evolve_test

// EG04 BDD MIRROR — PROPERTY (∀, rapid): the SEARCH-STRATEGY GENERATORS behind the frozen
// Proposer seam. Conceptually stored in the `mirrors` schema (reflects: runtime.evolve
// NoveltySearchProposer / POETProposer / MOMEProposer + NicheCoverage, judged by the frozen
// Promote gate; test_kind: property, cert_language: rapid, authority: below, computational),
// materialized here for the Go runner. Governed by ADR 0089 (the generator is a REPLACEABLE
// port behind the seam; the /evolve harness — quarantine + promotion-gate + Judge=mirror —
// UNCHANGED; a generator writes only branches/reports/ideas, never kernel/mirrors/fitness).
//
// HERMETIC + PURELY DETERMINISTIC: these are SEARCH strategies (Novelty-Search / POET / MOME),
// NOT LLMs. They are seeded (splitmix64), no network, no clock, no ambient rng. The mirror
// touches no CLI and no Postgres. usedRealLLM is structurally false: there is no model here.
//
// THE FOUR EG04 CRITERIA (the done set):
//
//	(1) Novelty/POET/MOME WIDEN the measured gate-passing niche coverage vs the deterministic
//	    FixtureProposer (the round-robin sampler) ALONE — strictly, on the fixture cell — WITHOUT
//	    changing the promotion-gate or the Judge=mirror (every candidate is still re-derived by
//	    JudgeCandidate and disposed by the frozen Promote gate).
//	(2) The gate stays DETERMINISTIC: same seed → same coverage, for every generator (the
//	    reproducibility mirror, determinism-first §6/§8).
//	(3) (in the ADR — Boids/ACO/PSO named abandoned-by-design; no test runner) — see
//	    docs/adr/0089 §"Pedigree illustratif".
//	(4) THE WALL: a generator-backed run emits only can_write (branches/reports/ideas); it never
//	    writes a truth zone — even when the generator is wired through the self-play sampler and
//	    the full Evolve run.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/evolve"
	"pgregory.net/rapid"
)

// generatorTable is the closed set of EG04 search-strategy generators (Novelty/POET/MOME),
// each a deterministic Proposer behind the frozen seam. Closed: the property tests iterate
// EXACTLY these three — Boids/ACO/PSO are NOT here (ADR 0089: pedigree, never coded).
func generatorTable() map[string]evolve.Proposer {
	return map[string]evolve.Proposer{
		"novelty": evolve.NoveltySearchProposer,
		"poet":    evolve.POETProposer,
		"mome":    evolve.MOMEProposer,
	}
}

// (1) ∀ (seed, budget): each generator's gate-passing niche coverage on the fixture cell is
// ≥ the FixtureProposer's coverage (it never REGRESSES the search). The coverage is measured
// by the SAME frozen gate (JudgeCandidate → Promote) — the generators change WHAT is proposed,
// never HOW it is judged.
func TestProp_GeneratorsWidenNicheCoverageVsBaseline(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(5, 12).Draw(t, "budget")

		baseline := evolve.NicheCoverage(cell, evolve.FixtureProposer, budget, seed)
		for name, gen := range generatorTable() {
			got := evolve.NicheCoverage(cell, gen, budget, seed)
			if got < baseline {
				t.Fatalf("generator %q REGRESSED gate-passing coverage: got %d < baseline %d (seed=%d budget=%d)",
					name, got, baseline, seed, budget)
			}
		}
	})
}

// (1b) On the fixture cell with a generous budget, each generator STRICTLY widens coverage vs
// the round-robin FixtureProposer (the materiality of the EG04 win — not just "≥"). This is a
// concrete, hermetic witness: the baseline round-robin under-covers because its single seeded
// mutation stream lands many candidates in the SAME niches and some bold (gate-failing); the
// diversity-seeking generators spread gate-PASSING candidates across MORE distinct niches.
func TestGeneratorsStrictlyWidenCoverageOnFixture(t *testing.T) {
	cell := fixtureCell()
	// a fixed seed + budget where the win is deterministic and reproducible: the round-robin
	// baseline under-covers (3 of 4 approved niches — its single mutation stream repeats /
	// goes bold on a slot) while each diversity generator covers all 4. Witnessed across the
	// seed band by TestProp_GeneratorsWidenNicheCoverageVsBaseline (the ∀ never-regress arm).
	const seed, budget = int64(1), 5
	baseline := evolve.NicheCoverage(cell, evolve.FixtureProposer, budget, seed)
	if baseline >= len(cell.AuthorityApprovedNiches) {
		t.Fatalf("the fixture baseline already saturates coverage (%d/%d) — the strict-widening witness is vacuous; pick a seed where the round-robin under-covers",
			baseline, len(cell.AuthorityApprovedNiches))
	}
	for name, gen := range generatorTable() {
		got := evolve.NicheCoverage(cell, gen, budget, seed)
		if got <= baseline {
			t.Fatalf("generator %q did not STRICTLY widen coverage on the fixture: got %d, baseline %d", name, got, baseline)
		}
		// and it cannot exceed the cell's approved-niche ceiling (it never invents a niche).
		if got > len(cell.AuthorityApprovedNiches) {
			t.Fatalf("generator %q covered %d niches — more than the cell's %d approved niches (invented a niche)",
				name, got, len(cell.AuthorityApprovedNiches))
		}
	}
}

// (2) ∀ generator, ∀ (seed, budget): coverage is a PURE function of the inputs — same seed →
// same coverage. The gate stays deterministic; the generator is reproducible (no clock, no rng).
func TestProp_GeneratorCoverageIsDeterministic(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(5, 12).Draw(t, "budget")
		for name, gen := range generatorTable() {
			a := evolve.NicheCoverage(cell, gen, budget, seed)
			b := evolve.NicheCoverage(cell, gen, budget, seed)
			if a != b {
				t.Fatalf("generator %q coverage not deterministic: %d vs %d (seed=%d budget=%d)", name, a, b, seed, budget)
			}
			// the proposer itself is byte-deterministic too.
			c1, _ := gen(cell, budget, seed)
			c2, _ := gen(cell, budget, seed)
			if len(c1) != len(c2) {
				t.Fatalf("generator %q candidate count not deterministic: %d vs %d", name, len(c1), len(c2))
			}
			for i := range c1 {
				if c1[i] != c2[i] {
					t.Fatalf("generator %q candidate %d not deterministic: %+v vs %+v", name, i, c1[i], c2[i])
				}
			}
		}
	})
}

// (2b) ∀ generator: the PROMOTION GATE is unchanged — every candidate a generator proposes is
// re-derived by JudgeCandidate and disposed by the frozen Promote gate; a gate-PASSING variant
// carries mirror_green ∧ oos_green ∧ authority-approved, NEVER on the generator's confidence.
// This is the anti-Goodhart anchor for the new generators (the Judge=mirror is untouched).
func TestProp_GeneratorsDoNotChangeTheGate(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(5, 12).Draw(t, "budget")
		for _, gen := range generatorTable() {
			cands, err := gen(cell, budget, seed)
			if err != nil {
				t.Fatalf("generator errored: %v", err)
			}
			for _, c := range cands {
				ev := evolve.JudgeCandidate(cell, c)
				v := evolve.Variant{ID: "g", Niche: c.Niche}
				promoted := evolve.Promote(v, ev).Verdict == evolve.PromotionProposed
				if promoted {
					if ev.Mirror != evolve.MirrorGreen || ev.OutOfSample != evolve.OutOfSampleGreen || !ev.AuthorityApproved {
						t.Fatalf("a generator candidate was promoted without the three deterministic conditions: %+v", ev)
					}
				}
				// and a generator never invents a niche the cell does not declare.
				if !nicheDeclared(cell, c.Niche) {
					t.Fatalf("a generator invented an undeclared niche %q", c.Niche)
				}
			}
		}
	})
}

// (4) THE WALL: a generator wired through the self-play sampler into a full Evolve run emits
// ONLY can_write (branches/reports/ideas) and writes NO truth — for every EG04 generator. The
// generators are just another Proposer behind the same seam; the harness owns the zones.
func TestProp_GeneratorRunsNeverEmitTruth(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(5, 12).Draw(t, "budget")
		for name, gen := range generatorTable() {
			sampler := evolve.NewSelfPlaySampler(cell, gen, budget)
			run := evolve.Evolve(cell.ID, budget, seed, sampler)
			c := evolve.ExtractContract(run)
			if !c.AllConfined {
				t.Fatalf("generator %q run escaped confinement: %+v emitted %+v", name, c, run.Emitted)
			}
			if c.WritesTruth {
				t.Fatalf("generator %q run wrote truth: %+v", name, c)
			}
		}
	})
}

// nicheDeclared reports whether the cell declares the niche (the honesty floor — a generator
// proposes only over the cell's declared niches).
func nicheDeclared(cell evolve.Cell, niche string) bool {
	for _, n := range cell.Niches {
		if n == niche {
			return true
		}
	}
	return false
}
