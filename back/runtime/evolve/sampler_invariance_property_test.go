package evolve_test

// EG02 BDD MIRROR — PROPERTY (∀, rapid): the SAMPLER-INVARIANCE of the /evolve harness.
// Conceptually stored in the `mirrors` schema (reflects: runtime.evolve.Evolve/Promote/
// Confine + the frozen Sampler seam, test_kind: property, cert_language: rapid, authority:
// below, computational), materialized here for the Go runner. Governed by ADR 0089
// (generator = REPLACEABLE port behind the Sampler seam, fallback DeterministicSampler,
// the /evolve harness UNCHANGED).
//
// THE INVARIANCE (the EG02 done criterion — the harness is invariant to the sampler):
//
//   ∀ (cell≠"", budget, seed), ∀ two CONFORMING samplers A, B:
//     ExtractContract(Evolve(cell, budget, seed, A)) == ExtractContract(Evolve(…, B))
//        — same can_write zones, in the same order, all confined, writes no truth.
//   ∀ run, ∀ sampler: every emitted write is under can_write (the loop never governs).
//   ∀ run, ∀ sampler: the run writes NO truth — no /kernel, /mirrors, /fitness path.
//   ∀ evidence: Promote's verdict is a pure function of the EVIDENCE, never of which
//     sampler produced it (the Judge=mirror is the deterministic gate, §8).
//   ∀ sampler (even an adversarial one trying to escape): Evolve still emits only
//     can_write — Confine fails closed; the generator CANNOT govern through the seam.
//
// The two reference samplers (FallbackSampler, AltReferenceSampler) are genuinely
// DISTINCT — different parent/variant/niche/fitness — so a NON-invariant harness would
// make the contracts diverge and turn this mirror RED. A real generator (EG03) is another
// conforming Sampler behind the same seam; this mirror pins that swapping it changes
// nothing about the harness's contract.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/evolve"
	"pgregory.net/rapid"
)

// truthZones the harness must NEVER emit to (the wall, §2 / §66.1 cannot_write).
var truthZones = []string{"/kernel", "/mirrors", "/fitness", "/authority"}

// equalContract compares two SamplerOutputContracts for the invariance assertion.
func equalContract(a, b evolve.SamplerOutputContract) bool {
	if a.AllConfined != b.AllConfined || a.WritesTruth != b.WritesTruth {
		return false
	}
	if len(a.EmittedZones) != len(b.EmittedZones) {
		return false
	}
	for i := range a.EmittedZones {
		if a.EmittedZones[i] != b.EmittedZones[i] {
			return false
		}
	}
	return true
}

// ∀ (cell≠"", budget, seed): the two DISTINCT reference samplers yield the SAME harness
// CONTRACT — the keystone EG02 invariance. The harness does not depend on which generator
// is plugged into the seam.
func TestProp_HarnessInvariantToSamplerChoice(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cell := rapid.StringMatching(`[a-zA-Z0-9]{1,12}`).Draw(t, "cell") // non-empty: the idea zone is emitted
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 100).Draw(t, "budget")

		runA := evolve.Evolve(cell, budget, seed, evolve.FallbackSampler)
		runB := evolve.Evolve(cell, budget, seed, evolve.AltReferenceSampler)

		cA := evolve.ExtractContract(runA)
		cB := evolve.ExtractContract(runB)

		if !equalContract(cA, cB) {
			t.Fatalf("harness NOT invariant to the sampler: contract A=%+v vs B=%+v", cA, cB)
		}
		// the contract is the EXPECTED one: a non-empty cell emits exactly the three
		// can_write zones, sorted, all confined, no truth.
		want := []string{"/branches/evolution", "/ideas/proposed", "/reports"}
		if len(cA.EmittedZones) != len(want) {
			t.Fatalf("contract zones = %v, want %v", cA.EmittedZones, want)
		}
		for i := range want {
			if cA.EmittedZones[i] != want[i] {
				t.Fatalf("contract zones = %v, want %v", cA.EmittedZones, want)
			}
		}
		if !cA.AllConfined || cA.WritesTruth {
			t.Fatalf("contract violates the wall: %+v", cA)
		}
	})
}

// ∀ sampler (the two references), ∀ run: every emitted write is under can_write AND no
// emitted path touches a truth zone — the loop never governs, whatever the sampler.
func TestProp_NoSamplerCanGovernThroughTheSeam(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cell := rapid.StringMatching(`[a-zA-Z0-9]{0,12}`).Draw(t, "cell")
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 100).Draw(t, "budget")

		for _, s := range []evolve.Sampler{evolve.FallbackSampler, evolve.AltReferenceSampler} {
			run := evolve.Evolve(cell, budget, seed, s)
			for _, w := range run.Emitted {
				if evolve.Confine(evolve.WriteAttempt{Path: w.Path}).Verdict != evolve.VerdictAllowed {
					t.Fatalf("a sampler caused a governing write %q — the seam must never let the generator govern", w.Path)
				}
				for _, tz := range truthZones {
					if strings.HasPrefix(w.Path, tz) {
						t.Fatalf("a sampler emitted into a truth zone %q — the wall is breached", w.Path)
					}
				}
			}
		}
	})
}

// ∀ evidence: Promote's verdict is a pure function of the EVIDENCE alone — it is identical
// whether the evidence came from the fallback or an alternate sampler. The Judge=mirror is
// the deterministic gate; the sampler's identity is irrelevant to promotion.
func TestProp_PromotionDependsOnEvidenceNotSampler(t *testing.T) {
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
		fitness := rapid.Float64Range(0, 1).Draw(t, "fitness")
		e := evolve.Evidence{Mirror: mirror, OutOfSample: oos, AuthorityApproved: approved, Fitness: fitness}

		// the SAME evidence carried by a variant from sampler A vs sampler B promotes
		// identically — the gate reads the evidence, never the producer.
		vA := evolve.Variant{ID: "var-A", Niche: "cell/baseline"}
		vB := evolve.Variant{ID: "var-B", Niche: "cell/variant"}
		gotA := evolve.Promote(vA, e)
		gotB := evolve.Promote(vB, e)
		if gotA.Verdict != gotB.Verdict {
			t.Fatalf("promotion verdict depends on the sampler's variant: A=%q B=%q for evidence %+v", gotA.Verdict, gotB.Verdict, e)
		}
		// and the gate is the declared three-condition gate (anti-Goodhart anchor).
		wantPromoted := mirror == evolve.MirrorGreen && oos == evolve.OutOfSampleGreen && approved
		if wantPromoted && gotA.Verdict != evolve.PromotionProposed {
			t.Fatalf("all three conditions held but Promote = %q", gotA.Verdict)
		}
		if !wantPromoted && gotA.Verdict != evolve.PromotionRefused {
			t.Fatalf("a gate condition failed but Promote = %q", gotA.Verdict)
		}
	})
}

// ∀ ADVERSARIAL sampler proposing a truth-zone-LOOKING variant id / niche (e.g. naming a
// niche "fitness" or a variant "kernel"): Evolve STILL emits only can_write — because it
// ALWAYS prefixes the candidate content UNDER a can_write zone, the generator's chosen id
// cannot relocate the write out of quarantine. This is the fault-injection arm of the
// invariance mirror: a hostile generator changes nothing about where the run writes.
//
// (Honest scope: Confine is a string-prefix check, not a path normaliser; this test does
// NOT claim Confine defends against `..` traversal — it claims Evolve never lets the
// SAMPLER pick the write ZONE. The generator proposes content; the harness owns the zone.)
func TestProp_AdversarialSamplerCannotPickTheZone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cell := rapid.StringMatching(`[a-zA-Z0-9]{1,12}`).Draw(t, "cell")
		seed := rapid.Int64().Draw(t, "seed")

		// an adversarial sampler whose variant id / niche NAME truth zones, with no path
		// separator (so we test only what Evolve's prefixing guarantees, not normalisation).
		adversarial := func(c string, s int64) (string, evolve.Variant, evolve.Evidence) {
			return "kernel-parent",
				evolve.Variant{ID: "kernel-createOrder-operation", Niche: "fitness-createOrder"},
				evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: true, Fitness: 1.0}
		}
		run := evolve.Evolve(cell, 8, seed, adversarial)
		// every emitted path is STILL under a can_write zone — the sampler named "kernel"
		// but the harness wrote it under /branches/evolution, /reports, /ideas/proposed.
		c := evolve.ExtractContract(run)
		if !c.AllConfined {
			t.Fatalf("an adversarial sampler escaped confinement: %+v / emitted %+v", c, run.Emitted)
		}
		if c.WritesTruth {
			t.Fatalf("an adversarial sampler wrote truth: %+v", c)
		}
		for _, w := range run.Emitted {
			under := false
			for _, z := range []string{evolve.ZoneBranchesEvolution, evolve.ZoneReports, evolve.ZoneIdeasProposed} {
				if strings.HasPrefix(w.Path, z+"/") {
					under = true
				}
			}
			if !under {
				t.Fatalf("emitted path %q is not under a can_write zone — the sampler picked the zone", w.Path)
			}
		}
	})
}
