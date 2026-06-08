package grillingloop_test

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
	"github.com/steph-frtech/aidos/back/runtime/grillingloop"
	"pgregory.net/rapid"
)

// Reproducibility / invariant mirror (rapid, N1): reflects=runtime.grillingloop ·
// test_kind=invariant · cert_language=rapid · liveness=live · authority=below.
//
// The S65 invariants (KRD §75/§118):
//
//   - the routing is DETERMINISTIC: same intention + verdict → byte-identical
//     VerdictRecord (the routing is the authority, not the LLM);
//   - any valid verdict over a valid intention yields a status in the closed set
//     {grilled, spiking, rejected} — no invented status;
//   - the human provenance is FORCED and preserved (the product surface is a human
//     grilling); the intent is carried verbatim, never rewritten;
//   - the verdict schema gate is closed: VerifyLLMVerdict accepts EXACTLY the three
//     verdict literals and refuses everything else (the LLM cannot invent a fourth).

var routedStatusSet = map[ideas.Status]bool{
	ideas.StatusGrilled:  true,
	ideas.StatusSpiking:  true,
	ideas.StatusRejected: true,
}

func genIntention() *rapid.Generator[grillingloop.Intention] {
	return rapid.Custom(func(t *rapid.T) grillingloop.Intention {
		// A valid intention carries non-blank intent prose: at least one
		// non-space char so Validate never rejects it as empty (the property
		// here is "VALID intention → status in the closed set"; whitespace-only
		// intents are covered by TestEmptyIntentRefused).
		intent := rapid.StringMatching(`[a-z][a-z ]{0,39}`).Draw(t, "intent")
		n := rapid.IntRange(0, grillingloop.MaxScenarios).Draw(t, "nScenarios")
		scn := make([]string, n)
		for i := range scn {
			scn[i] = rapid.StringMatching(`[a-z ]{1,20}`).Draw(t, "scenario")
		}
		return grillingloop.Intention{Intent: intent, Scenarios: scn}
	})
}

// TestRouteIsDeterministic — same intention + verdict → identical record.
func TestRouteIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genIntention().Draw(t, "intention")
		verdict := rapid.SampledFrom(exploration.Verdicts()).Draw(t, "verdict")
		reason := rapid.StringMatching(`[a-z ]{0,20}`).Draw(t, "reason")

		a, errA := grillingloop.Route(ideas.ProposesPolicy, in, verdict, "", reason)
		b, errB := grillingloop.Route(ideas.ProposesPolicy, in, verdict, "", reason)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("non-deterministic error: %v vs %v", errA, errB)
		}
		if errA != nil {
			return
		}
		if a.Idea.ID != b.Idea.ID || a.Idea.Status != b.Idea.Status || a.Verdict != b.Verdict || a.Reason != b.Reason {
			t.Fatalf("non-deterministic record:\n %+v\n %+v", a, b)
		}
	})
}

// TestRoutedStatusInClosedSet — a valid verdict over a valid intention yields a
// status in {grilled, spiking, rejected}; provenance is human; intent is verbatim.
func TestRoutedStatusInClosedSet(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genIntention().Draw(t, "intention")
		verdict := rapid.SampledFrom(exploration.Verdicts()).Draw(t, "verdict")

		rec, err := grillingloop.Route(ideas.ProposesPolicy, in, verdict, "", "traced")
		if err != nil {
			t.Fatalf("Route(%s): %v", verdict, err)
		}
		if !routedStatusSet[rec.Idea.Status] {
			t.Fatalf("status %q not in closed set", rec.Idea.Status)
		}
		if rec.Idea.Provenance.Source != ideas.ProvenanceHuman {
			t.Fatalf("provenance source = %q, want human", rec.Idea.Provenance.Source)
		}
		if rec.Idea.Intent != in.Intent {
			t.Fatalf("intent rewritten: %q != %q", rec.Idea.Intent, in.Intent)
		}
		if rec.Verdict != verdict {
			t.Fatalf("verdict = %q, want %q", rec.Verdict, verdict)
		}
	})
}

// TestVerdictSchemaGateIsClosed — VerifyLLMVerdict accepts exactly the three
// literals and refuses every other string (the barricade against a fourth verdict).
func TestVerdictSchemaGateIsClosed(t *testing.T) {
	valid := map[string]bool{"sharp": true, "fuzzy": true, "bad": true}
	rapid.Check(t, func(t *rapid.T) {
		raw := rapid.OneOf(
			rapid.SampledFrom([]string{"sharp", "fuzzy", "bad"}),
			rapid.StringMatching(`[A-Za-z ]{0,12}`),
		).Draw(t, "raw")
		_, err := grillingloop.VerifyLLMVerdict(raw)
		if valid[raw] && err != nil {
			t.Fatalf("VerifyLLMVerdict(%q) refused a valid verdict: %v", raw, err)
		}
		if !valid[raw] && err == nil {
			t.Fatalf("VerifyLLMVerdict(%q) accepted an off-schema verdict", raw)
		}
	})
}
