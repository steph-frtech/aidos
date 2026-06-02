package evolve_test

// S42 BDD MIRROR — PROPERTY (∀, rapid), conceptually stored in the `mirrors` schema
// (reflects: runtime.evolve.Confine/Promote/Evolve, test_kind: property,
// cert_language: rapid, authority: below, computational) and materialized here. The
// invariants (KRD §66.1, §62 ②, §87):
//
//   ∀ path under can_write {/branches/evolution, /reports, /ideas/proposed}: Confine ⇒ Allowed
//   ∀ path under cannot_write or outside can_write: Confine ⇒ Refused(SANDBOX_WRITE_ESCAPES_ZONE)
//   ∀ Evolve run: every emitted write is under can_write (the loop NEVER governs)
//   ∀ variant with mirror != green: Promote ⇒ Refused (gate binary, never the score)
//   ∀ variant oos != green OR no authority: Promote ⇒ Refused
//   ∀ Promote ⇒ Promoted: it is a PROPOSAL (never writes truth itself)
//   ∀ Confine/Promote/Evolve: deterministic (seed/budget passed in, never ambient)
//   ∀ Promote/Evolve: never invents a niche/fitness/approval — traces to a real input
//   ∀ malformed input: a verdict, never a panic

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
	"pgregory.net/rapid"
)

var canWritePrefixes = []string{"/branches/evolution", "/reports", "/ideas/proposed"}
var cannotWritePrefixes = []string{"/kernel", "/mirrors/above", "/authority", "/fitness"}

// ∀ path under a can_write prefix ⇒ Allowed.
func TestProp_CanWriteAlwaysAllowed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prefix := canWritePrefixes[rapid.IntRange(0, len(canWritePrefixes)-1).Draw(t, "prefix")]
		suffix := rapid.StringMatching(`[a-z0-9./-]{0,20}`).Draw(t, "suffix")
		path := prefix
		if suffix != "" {
			path = prefix + "/" + suffix
		}
		got := evolve.Confine(evolve.WriteAttempt{Path: path})
		if got.Verdict != evolve.VerdictAllowed {
			t.Fatalf("Confine(%q) = %q, want allowed", path, got.Verdict)
		}
	})
}

// ∀ path under a cannot_write prefix ⇒ Refused(SANDBOX_WRITE_ESCAPES_ZONE).
func TestProp_CannotWriteAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prefix := cannotWritePrefixes[rapid.IntRange(0, len(cannotWritePrefixes)-1).Draw(t, "prefix")]
		suffix := rapid.StringMatching(`[a-z0-9./-]{0,20}`).Draw(t, "suffix")
		path := prefix
		if suffix != "" {
			path = prefix + "/" + suffix
		}
		got := evolve.Confine(evolve.WriteAttempt{Path: path})
		if got.Verdict != evolve.VerdictRefused {
			t.Fatalf("Confine(%q) = %q, want refused", path, got.Verdict)
		}
		if got.BlockReason == nil || got.BlockReason.Code != blockreason.CodeSandboxWriteEscapesZone {
			t.Fatalf("Confine(%q) wrong/absent BlockReason: %+v", path, got.BlockReason)
		}
	})
}

// ∀ arbitrary path: Confine yields a verdict (never panics) and a refusal always
// carries the actionable BlockReason (never a prison).
func TestProp_ConfineTotalAndActionable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		path := rapid.String().Draw(t, "path")
		got := evolve.Confine(evolve.WriteAttempt{Path: path})
		if got.Verdict == evolve.VerdictRefused {
			if got.BlockReason == nil || len(got.BlockReason.HowToFix) == 0 {
				t.Fatalf("Confine(%q) refused without an actionable how_to_fix", path)
			}
		}
	})
}

// ∀ variant with mirror != green ⇒ Promote Refused, WHATEVER its fitness.
func TestProp_RedMirrorNeverPromoted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		oos := evolve.OutOfSampleGreen
		if rapid.Bool().Draw(t, "oosRed") {
			oos = evolve.OutOfSampleRed
		}
		e := evolve.Evidence{
			Mirror:            evolve.MirrorRed,
			OutOfSample:       oos,
			AuthorityApproved: rapid.Bool().Draw(t, "approved"),
			Fitness:           rapid.Float64Range(0, 1).Draw(t, "fitness"),
		}
		v := evolve.Variant{ID: rapid.StringN(1, 8, 8).Draw(t, "id"), Niche: "n"}
		got := evolve.Promote(v, e)
		if got.Verdict != evolve.PromotionRefused {
			t.Fatalf("Promote(mirror_red, fitness %v) = %q, want refused", e.Fitness, got.Verdict)
		}
	})
}

// ∀ variant: Promote ⇒ Promoted only when all three gate conditions hold, and then it
// is ALWAYS a proposal that writes no truth.
func TestProp_PromotionGateAndProposalOnly(t *testing.T) {
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
		e := evolve.Evidence{Mirror: mirror, OutOfSample: oos, AuthorityApproved: approved, Fitness: rapid.Float64Range(0, 1).Draw(t, "f")}
		v := evolve.Variant{ID: rapid.StringN(1, 8, 8).Draw(t, "id"), Niche: rapid.StringN(0, 10, 10).Draw(t, "niche")}

		got := evolve.Promote(v, e)
		wantPromoted := mirror == evolve.MirrorGreen && oos == evolve.OutOfSampleGreen && approved
		if wantPromoted {
			if got.Verdict != evolve.PromotionProposed {
				t.Fatalf("all three gate conditions held but Promote = %q", got.Verdict)
			}
			if got.Proposal == nil || !got.Proposal.Proposal || got.Proposal.WritesTruth {
				t.Fatalf("a passed gate must yield a PROPOSAL that writes no truth: %+v", got.Proposal)
			}
			// it never invents a niche: the proposal niche IS the variant's niche.
			if got.Proposal.Niche != v.Niche || got.Proposal.VariantID != v.ID {
				t.Fatalf("proposal must trace to the input variant: got %+v, variant %+v", got.Proposal, v)
			}
		} else if got.Verdict != evolve.PromotionRefused {
			t.Fatalf("a gate condition failed but Promote = %q", got.Verdict)
		}
	})
}

// ∀ Evolve run: every emitted write is under can_write (the loop never governs); the
// run is deterministic on replay with the same seed; it invents no niche (the niche
// traces to the sampler's variant).
func TestProp_EvolveNeverGoverns(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cell := rapid.StringMatching(`[a-zA-Z0-9]{0,12}`).Draw(t, "cell")
		seed := rapid.Int64().Draw(t, "seed")
		budget := rapid.IntRange(0, 100).Draw(t, "budget")
		varID := rapid.StringMatching(`[a-z0-9-]{1,10}`).Draw(t, "varID")
		niche := rapid.StringMatching(`[a-z0-9/]{0,10}`).Draw(t, "niche")

		sampler := func(c string, s int64) (string, evolve.Variant, evolve.Evidence) {
			return "parent", evolve.Variant{ID: varID, Niche: niche},
				evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: true, Fitness: 0.5}
		}

		run := evolve.Evolve(cell, budget, seed, sampler)
		for _, w := range run.Emitted {
			if evolve.Confine(evolve.WriteAttempt{Path: w.Path}).Verdict != evolve.VerdictAllowed {
				t.Fatalf("Evolve emitted a governing write %q — the loop must never govern", w.Path)
			}
		}
		if run.Variant.Niche != niche {
			t.Fatalf("Evolve invented a niche: got %q, want %q", run.Variant.Niche, niche)
		}
		// determinism on replay.
		again := evolve.Evolve(cell, budget, seed, sampler)
		if len(again.Emitted) != len(run.Emitted) {
			t.Fatal("Evolve not deterministic on replay")
		}
		for i := range run.Emitted {
			if again.Emitted[i] != run.Emitted[i] {
				t.Fatal("Evolve not deterministic on replay (emitted differs)")
			}
		}
	})
}
