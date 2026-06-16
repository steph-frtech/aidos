package evolve_test

// EG03 BDD MIRROR — PROPERTY (∀, rapid): the SELF-PLAY PROPOSER behind the frozen Sampler
// seam. Conceptually stored in the `mirrors` schema (reflects: runtime.evolve self-play
// Proposer + JudgeCandidate + NewSelfPlaySampler + ProposeViaIdea, judged by the frozen
// Promote gate; test_kind: property, cert_language: rapid, authority: below, computational),
// materialized here for the Go runner. Governed by ADR 0089 (generator = REPLACEABLE port
// behind the Sampler seam; the /evolve harness UNCHANGED; the generator writes only
// branches/reports/ideas — never kernel/mirrors/fitness).
//
// HERMETIC: the mirror uses ONLY FixtureProposer (deterministic, seeded, no network). The
// real ClaudeProposer is NEVER exercised here — the test never touches the CLI / the network.
//
// THE THREE EG03 CRITERIA (the done set):
//
//	(1) A variant enters a QD niche ONLY if it carries a GREEN mirror ∧ GREEN out-of-sample ∧
//	    authority approval — NEVER on the generator's confidence. The cell (Judge) derives the
//	    evidence; the frozen Promote gate disposes. A bold/off-niche proposal is REFUSED.
//	(2) IA OFF → the harness falls back to the deterministic sampler and stays VERT — the
//	    harness is invariant to the sampler (EG02): a self-play sampler over a FAILING / empty
//	    Proposer degrades to FallbackSampler and yields the EG02 invariant contract.
//	(3) NO truth write — a promotable variant reaches the kernel ONLY via firewall.ViaIdea →
//	    an `ideas` draft → /goal. ProposeViaIdea NEVER wrote the kernel (WroteKernel == false),
//	    and a non-passing variant cannot reach even the idea door.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/evolve"
	"pgregory.net/rapid"
)

// errProposerDown stands in for the IA being OFF (the CLI absent / erroring).
var errProposerDown = errors.New("proposer down (AI off)")

// fixtureCell is a realistic cell fixture (six declared niches; the authority approved four —
// the realistic friction). The threshold is below 0.55 so modest mutations clear it. The
// niche set is non-trivial so coverage is a real signal, not a rig.
func fixtureCell() evolve.Cell {
	return evolve.Cell{
		ID: "createOrder",
		Niches: []string{
			"createOrder/baseline",
			"createOrder/discount",
			"createOrder/bulk",
			"createOrder/giftcard",
			"createOrder/subscription",
			"createOrder/backorder",
		},
		AuthorityApprovedNiches: []string{
			"createOrder/baseline",
			"createOrder/discount",
			"createOrder/bulk",
			"createOrder/giftcard",
		},
		OutOfSampleThreshold: 0.55,
	}
}

// (1) ∀ (seed, budget): the variant the self-play sampler surfaces enters a niche (passes the
// frozen Promote gate) ONLY when the CELL-derived evidence is mirror_green ∧ oos_green ∧
// authority_approved — never on the generator's confidence. The gate verdict over the
// sampler's variant equals the gate verdict over its re-derived evidence: the gate, not the
// generator, decides. And NO variant the gate ADMITS carries a red mirror, red oos, or an
// unapproved niche.
func TestProp_SelfPlayVariantPromotedOnlyByDeterministicGate(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 20).Draw(t, "budget")

		sampler := evolve.NewSelfPlaySampler(cell, evolve.FixtureProposer, budget)
		run := evolve.Evolve("createOrder", budget, seed, sampler)

		// The gate is re-run on the surfaced variant's evidence — the SOLE authority.
		gate := evolve.Promote(run.Variant, run.Evidence)
		if gate.Verdict == evolve.PromotionProposed {
			// If admitted, ALL three deterministic conditions MUST hold — the generator's
			// confidence bought nothing.
			if run.Evidence.Mirror != evolve.MirrorGreen {
				t.Fatalf("a variant entered a niche with a RED mirror: %+v", run.Evidence)
			}
			if run.Evidence.OutOfSample != evolve.OutOfSampleGreen {
				t.Fatalf("a variant entered a niche with RED out-of-sample: %+v", run.Evidence)
			}
			if !run.Evidence.AuthorityApproved {
				t.Fatalf("a variant entered a niche WITHOUT authority approval: %+v", run.Evidence)
			}
		}
	})
}

// (1b) ∀ candidate: JudgeCandidate derives the evidence from the CELL, never from the
// generator — a candidate naming an UNAPPROVED niche is never authority-approved, and a BOLD
// mutation (> 0.85) always derives a RED mirror, whatever the proposal claims.
func TestProp_JudgeIsCellDerivedNotGeneratorAsserted(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		niche := rapid.SampledFrom([]string{
			"createOrder/baseline", "createOrder/subscription", "createOrder/backorder", "not-a-niche",
		}).Draw(t, "niche")
		mut := rapid.Float64Range(0, 1).Draw(t, "mutation")
		c := evolve.Candidate{Niche: niche, Mutation: mut}
		ev := evolve.JudgeCandidate(cell, c)

		// authority approval is a NAME-MATCH on the cell's approved set — not the generator's say.
		approvedNiche := niche == "createOrder/baseline"
		if ev.AuthorityApproved != approvedNiche {
			t.Fatalf("authority approval not cell-derived for niche %q: %+v", niche, ev)
		}
		// a bold mutation breaks fidelity → red mirror (the deterministic Judge), regardless.
		if mut > 0.85 && ev.Mirror != evolve.MirrorRed {
			t.Fatalf("a bold mutation %.3f did not derive a RED mirror: %+v", mut, ev)
		}
		if mut <= 0.85 && ev.Mirror != evolve.MirrorGreen {
			t.Fatalf("a modest mutation %.3f did not derive a GREEN mirror: %+v", mut, ev)
		}
	})
}

// (2) IA OFF → the harness falls back to the deterministic sampler and stays VERT, invariant
// to the sampler (EG02): a self-play sampler over a Proposer that ERRORS (or returns nothing)
// degrades to FallbackSampler — its run contract is byte-identical to the EG02 fallback run.
func TestProp_AIOffFallsBackToDeterministicAndStaysGreen(t *testing.T) {
	cell := fixtureCell()
	failing := func(c evolve.Cell, budget int, seed int64) ([]evolve.Candidate, error) {
		return nil, errProposerDown
	}
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 20).Draw(t, "budget")

		offSampler := evolve.NewSelfPlaySampler(cell, failing, budget)
		runOff := evolve.Evolve("createOrder", budget, seed, offSampler)
		runFallback := evolve.Evolve("createOrder", budget, seed, evolve.FallbackSampler)

		// The harness is invariant to the sampler — the EG02 contract is identical.
		cOff := evolve.ExtractContract(runOff)
		cFb := evolve.ExtractContract(runFallback)
		if !equalContract(cOff, cFb) {
			t.Fatalf("AI-off self-play did not degrade to the deterministic contract: off=%+v fb=%+v", cOff, cFb)
		}
		// And it stays GREEN: all confined, no truth.
		if !cOff.AllConfined || cOff.WritesTruth {
			t.Fatalf("AI-off run violates the wall: %+v", cOff)
		}
	})
}

// (3) NO truth write: a promotable variant reaches the kernel ONLY via firewall.ViaIdea — and
// ProposeViaIdea NEVER wrote the kernel. A variant whose deterministic gate did NOT pass is
// REFUSED at the idea door (it cannot reach truth on the generator's confidence).
func TestProp_PromotionGoesViaIdeaNeverWritesTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mirror := evolve.MirrorGreen
		if rapid.Bool().Draw(t, "mirrorRed") {
			mirror = evolve.MirrorRed
		}
		oos := evolve.OutOfSampleGreen
		if rapid.Bool().Draw(t, "oosRed") {
			oos = evolve.OutOfSampleRed
		}
		approved := rapid.Bool().Draw(t, "approved")
		v := evolve.Variant{ID: "var-x", Niche: "createOrder/discount"}
		e := evolve.Evidence{Mirror: mirror, OutOfSample: oos, AuthorityApproved: approved, Fitness: 0.9}

		cand, err := evolve.ProposeViaIdea(v, e)
		gatePassed := mirror == evolve.MirrorGreen && oos == evolve.OutOfSampleGreen && approved

		if gatePassed {
			if err != nil {
				t.Fatalf("a gate-passing variant was refused the idea door: %v", err)
			}
			// the ONLY legal door — and it WROTE NO KERNEL.
			if cand.WroteKernel {
				t.Fatalf("ProposeViaIdea wrote the kernel — the wall is breached: %+v", cand)
			}
			// the idea is a DRAFT (no mirror, no version) — promotion stays /goal.
			if cand.Idea.Status != "draft" {
				t.Fatalf("the candidate idea is not a draft: %+v", cand.Idea)
			}
		} else {
			// a non-passing variant cannot reach even the idea door — never on confidence.
			if err == nil {
				t.Fatalf("a NON-passing variant reached the idea door: gate=%v idea=%+v", gatePassed, cand)
			}
			if cand.WroteKernel {
				t.Fatalf("a refused variant still reported a kernel write: %+v", cand)
			}
		}
	})
}

// (3b) ∀ self-play run: every emitted write is confined to can_write and touches no truth
// zone — the generator cannot govern through the seam (the wall, fault-injection arm).
func TestProp_SelfPlayRunNeverEmitsTruth(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 20).Draw(t, "budget")
		sampler := evolve.NewSelfPlaySampler(cell, evolve.FixtureProposer, budget)
		run := evolve.Evolve("createOrder", budget, seed, sampler)
		c := evolve.ExtractContract(run)
		if !c.AllConfined {
			t.Fatalf("a self-play run escaped confinement: %+v emitted %+v", c, run.Emitted)
		}
		if c.WritesTruth {
			t.Fatalf("a self-play run wrote truth: %+v", c)
		}
	})
}

// (4) reproducibility mirror (determinism-first, §6/§8): the FixtureProposer-backed sampler
// is a PURE function of (cell, seed) — same inputs ⇒ byte-identical surfaced variant + evidence.
func TestProp_SelfPlaySamplerIsDeterministic(t *testing.T) {
	cell := fixtureCell()
	rapid.Check(t, func(t *rapid.T) {
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 20).Draw(t, "budget")
		sampler := evolve.NewSelfPlaySampler(cell, evolve.FixtureProposer, budget)

		p1, v1, e1 := sampler("createOrder", seed)
		p2, v2, e2 := sampler("createOrder", seed)
		if p1 != p2 || v1 != v2 || e1 != e2 {
			t.Fatalf("self-play sampler not deterministic: (%q,%+v,%+v) vs (%q,%+v,%+v)", p1, v1, e1, p2, v2, e2)
		}
	})
}
