package sagas_test

// SagaInvariant statechart fixture (state {saga, trace | coherenceTest, heads} → outcome |
// coherence), interpreted in Go. reflects=kernel.saga_invariant "checkout-payment-shipping" ·
// test_kind=fixture · cert_language=statechart · liveness=live · authority=above (the cross-cell
// distributed-transaction rule — when the federation stays coherent under a partial failure — is
// the human's, KRD §49.2).
//
// Materialized source: tests/kernel/checkout-payment-shipping_saga.fixture.md (the human-readable
// fixture, conceptually stored in the `mirrors` schema; persisted to Postgres at S06 — bootstrap
// exception). It is the LIEN PORTEUR: this test loads the checkout-payment-shipping saga + the
// happy / compensation / dangling-money rows + the CoherenceTest rows; if the fixture intention
// disappears the test breaks (no silent rot into a monster).
//
// The saga is the KRD §49.2 canonical example, VERBATIM — the agent invents no participant, event,
// cert_language, or property branch beyond the frozen §49.2 vocabulary.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
)

// checkoutPaymentShipping is the KRD §49.2 saga, verbatim: the three participants order /
// payment / shipping, each commit event, the compensation legs pinned id@version, the cross-cell
// property, the statechart cert_language.
func checkoutPaymentShipping() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-payment-shipping",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{
				Cell:         "order",
				Commits:      []sagas.EventName{"order_confirmed"},
				Compensation: []links.Ref{{ID: "cancelOrder", Version: "v2"}},
			},
			{
				Cell:         "payment",
				Commits:      []sagas.EventName{"payment_captured"},
				Compensation: []links.Ref{{ID: "refundPayment", Version: "v3"}},
			},
			{
				Cell:         "shipping",
				Commits:      []sagas.EventName{"shipping_scheduled"},
				Compensation: []links.Ref{},
			},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
	}
}

// TestSagaValidates — the verbatim §49.2 checkout-payment-shipping saga is well-formed.
func TestSagaValidates(t *testing.T) {
	if err := sagas.Validate(checkoutPaymentShipping()); err != nil {
		t.Fatalf("the §49.2 checkout-payment-shipping saga must validate, got %v", err)
	}
}

// TestEvaluate_HappyPath — every leg commits ⇒ the property holds ⇒ satisfied.
func TestEvaluate_HappyPath(t *testing.T) {
	trace := sagas.Trace{"order_confirmed", "payment_captured", "shipping_scheduled"}
	out := sagas.Evaluate(checkoutPaymentShipping(), trace)
	if out.Outcome != sagas.OutcomeSatisfied {
		t.Fatalf("happy path must be satisfied, got %q (%+v)", out.Outcome, out.BlockReason)
	}
}

// TestEvaluate_FailedLegTriggersCompensation — THE done case. Shipping fails AFTER
// payment_captured; the saga runs the declared compensation (refundPayment@v3, cancelOrder@v2)
// so compensation_executed holds and the property is STILL satisfied (property holds VIA
// compensation). The failed leg triggers compensation; no dangling captured payment.
func TestEvaluate_FailedLegTriggersCompensation(t *testing.T) {
	saga := checkoutPaymentShipping()
	// A leg fails after payment_captured: shipping_failed.
	failed := sagas.Trace{"order_confirmed", "payment_captured", "shipping_failed"}

	// Running the declared compensation appends the participants' compensation events +
	// compensation_executed (the statechart's compensation transitions).
	comp := sagas.RunCompensation(saga, failed)

	// The compensation order is the declared compensation legs, then the terminal marker.
	wantEvents := []string{"refundPayment@v3", "cancelOrder@v2", "compensation_executed"}
	if len(comp.Events) != len(wantEvents) {
		t.Fatalf("compensation must emit %v, got %v", wantEvents, comp.Events)
	}
	for i, e := range wantEvents {
		if comp.Events[i] != e {
			t.Fatalf("compensation event %d: want %q got %q (full %v)", i, e, comp.Events[i], comp.Events)
		}
	}

	// The post-compensation trace is satisfied — the property holds VIA compensation.
	out := sagas.Evaluate(saga, comp.Trace)
	if out.Outcome != sagas.OutcomeSatisfied {
		t.Fatalf("a failed leg whose compensation ran must be satisfied (property holds via compensation), got %q (%+v)", out.Outcome, out.BlockReason)
	}
}

// TestEvaluate_DanglingMoneyViolated — the monster the saga forbids: a captured payment with
// NEITHER order_confirmed NOR compensation_executed ⇒ violated / SAGA_INVARIANT_VIOLATED, and
// how_to_fix names running the compensation.
func TestEvaluate_DanglingMoneyViolated(t *testing.T) {
	trace := sagas.Trace{"payment_captured"} // leg failed, compensation never ran
	out := sagas.Evaluate(checkoutPaymentShipping(), trace)

	if out.Outcome != sagas.OutcomeViolated {
		t.Fatalf("a captured payment with no order and no compensation must be violated, got %q", out.Outcome)
	}
	if out.BlockReason == nil {
		t.Fatalf("a violated outcome must carry a BlockReason")
	}
	if out.BlockReason.Code != sagas.CodeSagaInvariantViolated {
		t.Fatalf("block_reason.code must be SAGA_INVARIANT_VIOLATED, got %q", out.BlockReason.Code)
	}
	found := false
	for _, f := range out.BlockReason.HowToFix {
		if f == "run_compensation_on_failure" {
			found = true
		}
	}
	if !found {
		t.Fatalf("how_to_fix must contain run_compensation_on_failure, got %v", out.BlockReason.HowToFix)
	}
}

// checkoutCoherenceTest is the KRD §49.2 CoherenceTest, verbatim: the pinned consumed contracts
// order.events@v3 and payment.commands@v2.
func checkoutCoherenceTest() sagas.CoherenceTest {
	return sagas.CoherenceTest{
		Contracts: []links.Ref{
			{ID: "order.events", Version: "v3"},
			{ID: "payment.commands", Version: "v2"},
		},
		Property: "aucun événement consommé n'est produit par une version incompatible",
	}
}

// TestCheckCoherence_IncompatibleVersion — a consumed event pinned to a non-head producer
// version ⇒ incompatible / INCOMPATIBLE_CONTRACT_VERSION (composes S17 Resolve staleness).
func TestCheckCoherence_IncompatibleVersion(t *testing.T) {
	heads := links.Heads{"order.events": "v3", "payment.commands": "v4"} // payment.commands moved to v4
	out := sagas.CheckCoherence(checkoutCoherenceTest(), heads)

	if out.Coherence != sagas.CoherenceIncompatible {
		t.Fatalf("a consumed ref pinned to a non-head version must be incompatible, got %q", out.Coherence)
	}
	if out.BlockReason == nil || out.BlockReason.Code != sagas.CodeIncompatibleContractVersion {
		t.Fatalf("must carry INCOMPATIBLE_CONTRACT_VERSION block reason, got %+v", out.BlockReason)
	}
}

// TestCheckCoherence_AtHeadCoherent — every consumed ref pinned exactly at head ⇒ coherent.
func TestCheckCoherence_AtHeadCoherent(t *testing.T) {
	heads := links.Heads{"order.events": "v3", "payment.commands": "v2"}
	out := sagas.CheckCoherence(checkoutCoherenceTest(), heads)
	if out.Coherence != sagas.CoherenceCoherent {
		t.Fatalf("every consumed ref at head must be coherent, got %q (%+v)", out.Coherence, out.BlockReason)
	}
}

// TestValidate_LocalCellRejected — a saga can never be declared cell-local (§49.1): scope
// local_cell is rejected at Validate.
func TestValidate_LocalCellRejected(t *testing.T) {
	saga := checkoutPaymentShipping()
	saga.Scope = sagas.Scope("local_cell")
	if err := sagas.Validate(saga); err == nil {
		t.Fatalf("a scope: local_cell saga must be rejected (a saga is transverse by definition, §49.1)")
	}
}

// TestValidate_SingleParticipantRejected — a single-participant "saga" is a monster.
func TestValidate_SingleParticipantRejected(t *testing.T) {
	saga := checkoutPaymentShipping()
	saga.Participants = saga.Participants[:1]
	if err := sagas.Validate(saga); err == nil {
		t.Fatalf("a single-participant saga must be rejected (≥2 participants required)")
	}
}

// TestValidate_UnpinnedCompensationRejected — a compensation stepRef must be pinned id@version
// (S17); an unpinned ref is a monster.
func TestValidate_UnpinnedCompensationRejected(t *testing.T) {
	saga := checkoutPaymentShipping()
	saga.Participants[1].Compensation = []links.Ref{{ID: "refundPayment"}} // no version
	if err := sagas.Validate(saga); err == nil {
		t.Fatalf("an unpinned compensation stepRef must be rejected")
	}
}
