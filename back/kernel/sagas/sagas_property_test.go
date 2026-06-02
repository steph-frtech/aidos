package sagas_test

// Property mirror (∀) for the SagaInvariant + CoherenceTest (KRD §49.2). reflects=
// kernel.saga_invariant · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (the invariants are computational properties of the pure Evaluate /
// CheckCoherence / Validate; the §49.2 RULE itself is the human's, above the line, pinned by the
// fixture). Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §49.2:
//
//  1. Evaluate TOTAL + DETERMINISTIC. For any saga + any trace, Evaluate never panics and the
//     same input always yields the same outcome (satisfied | violated) — the reproducibility
//     mirror (same input ⇒ same output).
//  2. CORE SAFETY PROPERTY. For EVERY trace containing payment_captured, Evaluate == satisfied
//     IFF the trace also contains order_confirmed OR compensation_executed; violated otherwise
//     (a captured payment with neither is ALWAYS SAGA_INVARIANT_VIOLATED — no trace makes the
//     dangling-money monster acceptable). A trace WITHOUT payment_captured is always satisfied
//     (the antecedent is false, the implication holds vacuously).
//  3. CheckCoherence TOTAL + DETERMINISTIC, composing S17 Resolve. incompatible whenever a
//     consumed ref pins a non-head (stale/absent) version; coherent only when every consumed ref
//     pins exactly the producer's head.
//  4. VALIDATE GUARDS. Validate rejects scope local_cell, a single-participant saga, an unpinned
//     compensation/contract ref, and a cert_language outside {statechart, pact, tla+}.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"pgregory.net/rapid"
)

// eventVocab is the saga's event vocabulary (the commit events + the failure / compensation
// markers). The property generator draws traces from it.
var eventVocab = []sagas.EventName{
	"order_confirmed", "payment_captured", "shipping_scheduled",
	"shipping_failed", "compensation_executed", "order_failed",
}

func baseSaga() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-payment-shipping",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{Cell: "order", Commits: []sagas.EventName{"order_confirmed"}, Compensation: []links.Ref{{ID: "cancelOrder", Version: "v2"}}},
			{Cell: "payment", Commits: []sagas.EventName{"payment_captured"}, Compensation: []links.Ref{{ID: "refundPayment", Version: "v3"}}},
			{Cell: "shipping", Commits: []sagas.EventName{"shipping_scheduled"}, Compensation: []links.Ref{}},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
	}
}

func contains(tr sagas.Trace, e sagas.EventName) bool {
	for _, x := range tr {
		if x == e {
			return true
		}
	}
	return false
}

// TestProp_EvaluateTotalDeterministic — Evaluate never panics and is deterministic.
func TestProp_EvaluateTotalDeterministic(t *testing.T) {
	saga := baseSaga()
	rapid.Check(t, func(rt *rapid.T) {
		tr := drawTrace(rt)
		out1 := sagas.Evaluate(saga, tr)
		out2 := sagas.Evaluate(saga, tr)
		if out1.Outcome != out2.Outcome {
			rt.Fatalf("Evaluate not deterministic: %q vs %q on %v", out1.Outcome, out2.Outcome, tr)
		}
		if out1.Outcome != sagas.OutcomeSatisfied && out1.Outcome != sagas.OutcomeViolated {
			rt.Fatalf("Evaluate not total: %q on %v", out1.Outcome, tr)
		}
	})
}

// TestProp_CoreSafety — for every trace, satisfied IFF (no payment_captured) OR (order_confirmed
// OR compensation_executed). The dangling-money monster (payment_captured, neither) is always
// violated with SAGA_INVARIANT_VIOLATED.
func TestProp_CoreSafety(t *testing.T) {
	saga := baseSaga()
	rapid.Check(t, func(rt *rapid.T) {
		tr := drawTrace(rt)
		out := sagas.Evaluate(saga, tr)

		captured := contains(tr, "payment_captured")
		confirmed := contains(tr, "order_confirmed")
		compensated := contains(tr, "compensation_executed")
		wantSatisfied := !captured || confirmed || compensated

		if wantSatisfied && out.Outcome != sagas.OutcomeSatisfied {
			rt.Fatalf("trace %v should be satisfied (captured=%v confirmed=%v compensated=%v), got %q", tr, captured, confirmed, compensated, out.Outcome)
		}
		if !wantSatisfied {
			if out.Outcome != sagas.OutcomeViolated {
				rt.Fatalf("dangling-money trace %v must be violated, got %q", tr, out.Outcome)
			}
			if out.BlockReason == nil || out.BlockReason.Code != sagas.CodeSagaInvariantViolated {
				rt.Fatalf("violated trace %v must carry SAGA_INVARIANT_VIOLATED, got %+v", tr, out.BlockReason)
			}
		}
	})
}

func drawTrace(rt *rapid.T) sagas.Trace {
	n := rapid.IntRange(0, len(eventVocab)).Draw(rt, "n")
	tr := make(sagas.Trace, 0, n)
	for i := 0; i < n; i++ {
		idx := rapid.IntRange(0, len(eventVocab)-1).Draw(rt, "e")
		tr = append(tr, eventVocab[idx])
	}
	return tr
}

// TestProp_CheckCoherenceComposesResolve — CheckCoherence is total, deterministic, and
// incompatible exactly when some consumed ref is not at head (composing S17 Resolve).
func TestProp_CheckCoherenceComposesResolve(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ids := []string{"order.events", "payment.commands", "shipping.events"}
		versions := []string{"v1", "v2", "v3", "v4"}

		ct := sagas.CoherenceTest{Property: "p"}
		heads := links.Heads{}
		anyStale := false
		for _, id := range ids {
			pin := versions[rapid.IntRange(0, len(versions)-1).Draw(rt, "pin")]
			head := versions[rapid.IntRange(0, len(versions)-1).Draw(rt, "head")]
			ct.Contracts = append(ct.Contracts, links.Ref{ID: id, Version: pin})
			heads[id] = head
			if pin != head {
				anyStale = true
			}
		}
		out := sagas.CheckCoherence(ct, heads)
		out2 := sagas.CheckCoherence(ct, heads)
		if out.Coherence != out2.Coherence {
			rt.Fatalf("CheckCoherence not deterministic")
		}
		if out.Coherence != sagas.CoherenceCoherent && out.Coherence != sagas.CoherenceIncompatible {
			rt.Fatalf("CheckCoherence not total: %q", out.Coherence)
		}
		if anyStale && out.Coherence != sagas.CoherenceIncompatible {
			rt.Fatalf("a non-head consumed ref must be incompatible, got %q (%v / %v)", out.Coherence, ct.Contracts, heads)
		}
		if !anyStale && out.Coherence != sagas.CoherenceCoherent {
			rt.Fatalf("all refs at head must be coherent, got %q", out.Coherence)
		}
	})
}

// TestProp_ValidateGuards — Validate rejects local_cell, single-participant, unpinned refs, and
// a cert_language outside the closed three-set.
func TestProp_ValidateGuards(t *testing.T) {
	// local_cell rejected.
	s := baseSaga()
	s.Scope = sagas.Scope("local_cell")
	if sagas.Validate(s) == nil {
		t.Fatalf("local_cell must be rejected")
	}
	// single participant rejected.
	s = baseSaga()
	s.Participants = s.Participants[:1]
	if sagas.Validate(s) == nil {
		t.Fatalf("single-participant must be rejected")
	}
	// unpinned compensation rejected.
	s = baseSaga()
	s.Participants[1].Compensation = []links.Ref{{ID: "refundPayment"}}
	if sagas.Validate(s) == nil {
		t.Fatalf("unpinned compensation must be rejected")
	}
	// bad cert_language rejected.
	s = baseSaga()
	s.Mirror.CertLanguage = sagas.CertLanguage("graphviz")
	if sagas.Validate(s) == nil {
		t.Fatalf("cert_language outside {statechart, pact, tla+} must be rejected")
	}
	// the three valid cert_languages accepted.
	for _, cl := range []sagas.CertLanguage{sagas.CertStatechart, sagas.CertPact, sagas.CertTLAPlus} {
		s = baseSaga()
		s.Mirror.CertLanguage = cl
		if err := sagas.Validate(s); err != nil {
			t.Fatalf("cert_language %q must be accepted, got %v", cl, err)
		}
	}
}
