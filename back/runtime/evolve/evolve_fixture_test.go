package evolve_test

// S42 BDD MIRROR — FIXTURE (N2: state → command → events), conceptually stored in the
// `mirrors` schema (reflects: runtime.evolve.Confine/Promote/Evolve, test_kind:
// fixture, cert_language: operation-dsl/go, authority: above) and materialized here
// for the Go runner. These ARE the done criteria (KRD §66.1):
//
//   - write(/branches/evolution/...) → Allowed ; write(/reports/...) → Allowed ;
//     write(/ideas/proposed/...) → Allowed  (THE done criterion: a candidate branch
//     is allowed)
//   - write(/kernel/...) → Refused(SANDBOX_WRITE_ESCAPES_ZONE) ; likewise
//     /mirrors/above, /authority, /fitness  (THE done criterion: writing /kernel is
//     forbidden ; how_to_fix points at confining + opening a /goal)
//   - promote(green ∧ oos-green ∧ approved) → Promoted PROPOSAL (no truth write)  (THE
//     done criterion: promotion needs a green mirror)
//   - promote(mirror_red, higher score) → Refused  (the anti-Goodhart anchor)
//   - promote(green, oos_red) → Refused  (out-of-sample is the honest signal)
//   - Evolve(cell, budget, seed, sampler) → run emitting only branches/reports/ideas.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// fixedSeed/fixedBudget keep the run replayable.
const (
	fixedSeed   int64 = 42
	fixedBudget int   = 8
)

// fixed sampler: a pure, deterministic sampler so the Evolve run is replayable.
func fixedSampler(cell string, seed int64) (string, evolve.Variant, evolve.Evidence) {
	return "parent-1", evolve.Variant{ID: "var-7", Niche: "createOrder/discount"},
		evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: true, Fitness: 0.7}
}

// THE done criterion (allow): a candidate branch / report / idea write is allowed.
func TestFixture_CandidateWritesAllowed(t *testing.T) {
	for _, path := range []string{
		"/branches/evolution/var-7",
		"/reports/var-7.json",
		"/ideas/proposed/retry-cap",
	} {
		got := evolve.Confine(evolve.WriteAttempt{Path: path})
		if got.Verdict != evolve.VerdictAllowed {
			t.Fatalf("Confine(%q) = %q, want allowed", path, got.Verdict)
		}
		if got.BlockReason != nil {
			t.Fatalf("Confine(%q) carried a BlockReason on an allowed write", path)
		}
	}
}

// THE done criterion (refuse): a write to /kernel (and /fitness, /authority,
// /mirrors/above) is blocked with SANDBOX_WRITE_ESCAPES_ZONE.
func TestFixture_GoverningWritesRefused(t *testing.T) {
	for _, path := range []string{
		"/kernel/createOrder.operation",
		"/fitness/createOrder.budget",
		"/authority/createOrder",
		"/mirrors/above/createOrder.feature",
	} {
		got := evolve.Confine(evolve.WriteAttempt{Path: path})
		if got.Verdict != evolve.VerdictRefused {
			t.Fatalf("Confine(%q) = %q, want refused", path, got.Verdict)
		}
		if got.BlockReason == nil {
			t.Fatalf("Confine(%q) refused without a BlockReason", path)
		}
		if got.BlockReason.Code != blockreason.CodeSandboxWriteEscapesZone {
			t.Fatalf("Confine(%q) code = %q, want SANDBOX_WRITE_ESCAPES_ZONE", path, got.BlockReason.Code)
		}
		if !containsSub(got.BlockReason.HowToFix, "open_a_/goal_to_promote_a_candidate") {
			t.Fatalf("Confine(%q) how_to_fix missing the /goal door: %v", path, got.BlockReason.HowToFix)
		}
	}
}

// a path entirely outside can_write (not even a cannot_write zone) is refused too —
// the sandbox is an allow-list (fail closed).
func TestFixture_OutsideCanWriteRefused(t *testing.T) {
	got := evolve.Confine(evolve.WriteAttempt{Path: "/src/main.go"})
	if got.Verdict != evolve.VerdictRefused {
		t.Fatalf("Confine(/src/main.go) = %q, want refused (fail closed)", got.Verdict)
	}
}

// THE done criterion (QD promotion): a green-mirror + oos-green + approved variant
// yields a PROMOTION PROPOSAL and the sandbox writes no truth.
func TestFixture_GreenVariantPromotedAsProposal(t *testing.T) {
	v := evolve.Variant{ID: "var-7", Niche: "createOrder/discount"}
	e := evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: true, Fitness: 0.7}
	got := evolve.Promote(v, e)
	if got.Verdict != evolve.PromotionProposed {
		t.Fatalf("Promote(green∧oos∧approved) = %q, want proposed: %s", got.Verdict, got.Reason)
	}
	if got.Proposal == nil {
		t.Fatal("Promote produced no proposal")
	}
	if got.Proposal.Niche != "createOrder/discount" {
		t.Fatalf("proposal niche = %q, want createOrder/discount", got.Proposal.Niche)
	}
	if !got.Proposal.Proposal || got.Proposal.WritesTruth {
		t.Fatalf("proposal must be a PROPOSAL that writes no truth: %+v", got.Proposal)
	}
}

// the anti-Goodhart anchor: a RED-mirror variant with a HIGHER score is NOT promoted.
func TestFixture_RedMirrorHigherScoreNotPromoted(t *testing.T) {
	v := evolve.Variant{ID: "var-9", Niche: "createOrder/discount"}
	e := evolve.Evidence{Mirror: evolve.MirrorRed, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: true, Fitness: 0.99}
	got := evolve.Promote(v, e)
	if got.Verdict != evolve.PromotionRefused {
		t.Fatalf("Promote(mirror_red, score 0.99) = %q, want refused (the Judge is the mirror, not the score)", got.Verdict)
	}
}

// out-of-sample is the honest signal: green mirror but out-of-sample RED ⇒ NOT promoted.
func TestFixture_GreenMirrorOutOfSampleRedNotPromoted(t *testing.T) {
	v := evolve.Variant{ID: "var-3", Niche: "createOrder/discount"}
	e := evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleRed, AuthorityApproved: true, Fitness: 0.8}
	got := evolve.Promote(v, e)
	if got.Verdict != evolve.PromotionRefused {
		t.Fatalf("Promote(mirror_green, oos_red) = %q, want refused (out-of-sample, never in-sample)", got.Verdict)
	}
}

// no authority approval ⇒ NOT promoted.
func TestFixture_NoAuthorityNotPromoted(t *testing.T) {
	v := evolve.Variant{ID: "var-4", Niche: "createOrder/discount"}
	e := evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: false, Fitness: 0.8}
	got := evolve.Promote(v, e)
	if got.Verdict != evolve.PromotionRefused {
		t.Fatalf("Promote(no authority) = %q, want refused", got.Verdict)
	}
}

// Evolve emits ONLY branches/reports/ideas — every emitted write is confined.
func TestFixture_EvolveEmitsOnlyCanWrite(t *testing.T) {
	run := evolve.Evolve("createOrder", fixedBudget, fixedSeed, fixedSampler)
	if len(run.Emitted) == 0 {
		t.Fatal("Evolve emitted nothing")
	}
	for _, w := range run.Emitted {
		got := evolve.Confine(evolve.WriteAttempt{Path: w.Path})
		if got.Verdict != evolve.VerdictAllowed {
			t.Fatalf("Evolve emitted a non-confined write %q (verdict %q) — the loop must never govern", w.Path, got.Verdict)
		}
	}
	// determinism: a replay with the same seed yields the same run.
	again := evolve.Evolve("createOrder", fixedBudget, fixedSeed, fixedSampler)
	if len(again.Emitted) != len(run.Emitted) || again.Variant.ID != run.Variant.ID {
		t.Fatal("Evolve is not deterministic on replay")
	}
}

func containsSub(xs []string, sub string) bool {
	for _, x := range xs {
		if len(x) >= len(sub) {
			for i := 0; i+len(sub) <= len(x); i++ {
				if x[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}
