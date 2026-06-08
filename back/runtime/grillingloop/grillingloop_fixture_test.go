package grillingloop_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
	"github.com/steph-frtech/aidos/back/runtime/grillingloop"
)

// Workflow mirror (fixture, N2): reflects=runtime.grillingloop · test_kind=fixture ·
// cert_language=go-fixture · liveness=live · authority=below.
//
// S65 done-criterion: a FIXTURE PER VERDICT BRANCH driving the in-product grilling
// loop (intention ≤ 5 scenarios) → routed idea + recorded verdict + provenance.
// The routing is DETERMINISTIC and AUTHORITATIVE; the LLM is the gated exception,
// re-checked against the verdict schema.

// fixtureCase is one state → command → expected-events row of the grilling loop.
type fixtureCase struct {
	name           string
	intention      grillingloop.Intention
	verdict        exploration.GrillVerdict
	detail         string
	reason         string
	wantStatus     ideas.Status
	wantReason     string
	wantProvenance ideas.ProvenanceSource
}

func sampleIntention() grillingloop.Intention {
	return grillingloop.Intention{
		Intent: "finalement je veux un code promo pour les habitués",
		Scenarios: []string{
			"Given a regular customer When they checkout Then a 10% promo applies",
			"Given a first-time customer When they checkout Then no promo applies",
		},
	}
}

// TestGrillingLoopFixturePerVerdictBranch — the S65 done-criterion: one fixture row
// per verdict branch (sharp → grilled, fuzzy → spiking, bad → rejected/traced),
// each recording the routed status + the verdict + the (human) provenance.
func TestGrillingLoopFixturePerVerdictBranch(t *testing.T) {
	cases := []fixtureCase{
		{
			name:           "sharp routes the intention to grilled (skips spike)",
			intention:      sampleIntention(),
			verdict:        exploration.VerdictSharp,
			detail:         "finalement je veux un code promo",
			wantStatus:     ideas.StatusGrilled,
			wantProvenance: ideas.ProvenanceHuman,
		},
		{
			name:           "fuzzy routes the intention to spiking (the floue branch)",
			intention:      sampleIntention(),
			verdict:        exploration.VerdictFuzzy,
			wantStatus:     ideas.StatusSpiking,
			wantProvenance: ideas.ProvenanceHuman,
		},
		{
			name:           "bad routes the intention to rejected, traced with the reason",
			intention:      sampleIntention(),
			verdict:        exploration.VerdictBad,
			reason:         "duplicate of an existing promo policy",
			wantStatus:     ideas.StatusRejected,
			wantReason:     "duplicate of an existing promo policy",
			wantProvenance: ideas.ProvenanceHuman,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec, err := grillingloop.Route(ideas.ProposesPolicy, c.intention, c.verdict, c.detail, c.reason)
			if err != nil {
				t.Fatalf("Route(%s): unexpected error %v", c.verdict, err)
			}
			if rec.Idea.Status != c.wantStatus {
				t.Fatalf("status = %q, want %q", rec.Idea.Status, c.wantStatus)
			}
			if rec.Verdict != c.verdict {
				t.Fatalf("recorded verdict = %q, want %q", rec.Verdict, c.verdict)
			}
			if rec.Reason != c.wantReason {
				t.Fatalf("recorded reason = %q, want %q", rec.Reason, c.wantReason)
			}
			if rec.Idea.Provenance.Source != c.wantProvenance {
				t.Fatalf("provenance source = %q, want %q", rec.Idea.Provenance.Source, c.wantProvenance)
			}
			// The intent is carried verbatim — never rewritten by the loop.
			if rec.Idea.Intent != c.intention.Intent {
				t.Fatalf("intent = %q, want verbatim %q", rec.Idea.Intent, c.intention.Intent)
			}
			// The routed idea is a candidate, never a frozen truth — the ideas.Idea
			// type carries no Version/Mirror field at all (unrepresentable by design),
			// so the absence is a compile-time guarantee, not a runtime check.
		})
	}
}

// TestRejectKeepsTracedReason — a bad verdict is rejected TRACED: the reason is
// recorded verbatim on both the record and the idea (append-only; never a silent
// drop, KRD §118).
func TestRejectKeepsTracedReason(t *testing.T) {
	rec, err := grillingloop.Route(ideas.ProposesPolicy, sampleIntention(),
		exploration.VerdictBad, "", "out of scope for this app")
	if err != nil {
		t.Fatalf("Route(bad): %v", err)
	}
	if rec.Reason != "out of scope for this app" {
		t.Fatalf("record reason = %q", rec.Reason)
	}
	if rec.Idea.RejectReason != "out of scope for this app" {
		t.Fatalf("idea reject reason = %q", rec.Idea.RejectReason)
	}
}

// TestIntentionBoundedToFiveScenarios — the ≤ 5 scenarios surface contract: a sixth
// scenario is REFUSED (not silently truncated); exactly five is accepted.
func TestIntentionBoundedToFiveScenarios(t *testing.T) {
	six := grillingloop.Intention{Intent: "x", Scenarios: []string{"a", "b", "c", "d", "e", "f"}}
	if _, err := grillingloop.Route(ideas.ProposesPolicy, six, exploration.VerdictSharp, "", ""); !errors.Is(err, grillingloop.ErrTooManyScenarios) {
		t.Fatalf("six scenarios: err = %v, want ErrTooManyScenarios", err)
	}

	five := grillingloop.Intention{Intent: "x", Scenarios: []string{"a", "b", "c", "d", "e"}}
	if _, err := grillingloop.Route(ideas.ProposesPolicy, five, exploration.VerdictSharp, "", ""); err != nil {
		t.Fatalf("five scenarios: unexpected error %v", err)
	}
}

// TestEmptyIntentRefused — an intention with no intent prose is refused.
func TestEmptyIntentRefused(t *testing.T) {
	empty := grillingloop.Intention{Intent: "   "}
	if _, err := grillingloop.Route(ideas.ProposesPolicy, empty, exploration.VerdictSharp, "", ""); !errors.Is(err, grillingloop.ErrIntentEmpty) {
		t.Fatalf("empty intent: err = %v, want ErrIntentEmpty", err)
	}
}

// TestUnknownVerdictRefused — the verdict set is closed; an invented fourth verdict
// is refused, the loop routes nothing.
func TestUnknownVerdictRefused(t *testing.T) {
	if _, err := grillingloop.Route(ideas.ProposesPolicy, sampleIntention(),
		exploration.GrillVerdict("approved"), "", ""); !errors.Is(err, exploration.ErrUnknownVerdict) {
		t.Fatalf("unknown verdict: err = %v, want ErrUnknownVerdict", err)
	}
}

// TestLLMSuggestionReverifiedAgainstSchema — the barricaded LLM exception: a
// model-suggested verdict is accepted ONLY if it validates against the closed
// schema; an off-schema suggestion is refused, never coerced.
func TestLLMSuggestionReverifiedAgainstSchema(t *testing.T) {
	for _, raw := range []string{"sharp", "fuzzy", "bad"} {
		v, err := grillingloop.VerifyLLMVerdict(raw)
		if err != nil {
			t.Fatalf("VerifyLLMVerdict(%q): %v", raw, err)
		}
		if string(v) != raw {
			t.Fatalf("VerifyLLMVerdict(%q) = %q", raw, v)
		}
	}
	for _, raw := range []string{"Sharp", "approved", "yes", "", "good idea"} {
		if _, err := grillingloop.VerifyLLMVerdict(raw); !errors.Is(err, grillingloop.ErrOffSchemaVerdict) {
			t.Fatalf("VerifyLLMVerdict(%q): err = %v, want ErrOffSchemaVerdict", raw, err)
		}
	}
}

// TestVerifiedLLMVerdictDrivesRouting — the end-to-end barricade: a verified LLM
// suggestion drives the SAME deterministic routing as a human-named verdict (the
// code is authoritative; the LLM only proposes a value the schema then re-checks).
func TestVerifiedLLMVerdictDrivesRouting(t *testing.T) {
	v, err := grillingloop.VerifyLLMVerdict("fuzzy")
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	rec, err := grillingloop.Route(ideas.ProposesPolicy, sampleIntention(), v, "", "")
	if err != nil {
		t.Fatalf("route: %v", err)
	}
	if rec.Idea.Status != ideas.StatusSpiking {
		t.Fatalf("verified fuzzy → status %q, want spiking", rec.Idea.Status)
	}
	if !strings.EqualFold(string(rec.Verdict), "fuzzy") {
		t.Fatalf("verdict = %q", rec.Verdict)
	}
}
