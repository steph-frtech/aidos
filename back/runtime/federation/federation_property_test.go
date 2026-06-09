package federation_test

// S103 §51 REPRODUCIBILITY MIRROR (rapid) — the federation composition is a PURE function:
// same input ⇒ same output (determinism), the non-affected cell ALWAYS stays green, and a
// non-contracted saga is ALWAYS refused. No LLM, no clock, no rng enters the loop.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/steph-frtech/aidos/back/runtime/federation"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
	"pgregory.net/rapid"
)

// genTrace draws a random subset/order of the saga's three relevant events.
func genTrace(t *rapid.T) sagas.Trace {
	pool := []sagas.EventName{"payment_captured", "order_confirmed", "compensation_executed"}
	n := rapid.IntRange(0, 3).Draw(t, "n")
	tr := sagas.Trace{}
	for i := 0; i < n; i++ {
		tr = append(tr, rapid.SampledFrom(pool).Draw(t, "ev"))
	}
	return tr
}

func sagaFixture() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-order-payment",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{Cell: "order", Commits: []sagas.EventName{"order_confirmed"}, Compensation: []links.Ref{{ID: "cancelOrder", Version: "v2"}}},
			{Cell: "payment", Commits: []sagas.EventName{"payment_captured"}, Compensation: []links.Ref{{ID: "refundPayment", Version: "v3"}}},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
	}
}

// SagaOverCells is DETERMINISTIC: same (saga, federation, trace) ⇒ identical SagaRun.
func TestProp_SagaOverCells_Deterministic(t *testing.T) {
	saga := sagaFixture()
	fed := cell.Federation{Contracts: []cell.Contract{{A: "order", B: "payment", Honored: true}}}
	rapid.Check(t, func(rt *rapid.T) {
		tr := genTrace(rt)
		a := federation.SagaOverCells(saga, fed, tr)
		b := federation.SagaOverCells(saga, fed, tr)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("non-deterministic SagaRun for trace %v:\n a=%+v\n b=%+v", tr, a, b)
		}
	})
}

// SagaOverCells over a contracted pair, run on the canonical happy trace, is ALWAYS satisfied
// on the happy path; a broken leg (no order_confirmed, no compensation_executed) is ALWAYS
// settled satisfied VIA compensation (the saga never leaves money dangling once compensation runs).
func TestProp_BrokenLegAlwaysSettlesSatisfied(t *testing.T) {
	saga := sagaFixture()
	fed := cell.Federation{Contracts: []cell.Contract{{A: "order", B: "payment", Honored: true}}}
	rapid.Check(t, func(rt *rapid.T) {
		// A trace with payment captured but NOT order_confirmed nor compensation_executed.
		run := federation.SagaOverCells(saga, fed, sagas.Trace{"payment_captured"})
		if run.Outcome.Outcome != sagas.OutcomeSatisfied {
			rt.Fatalf("after compensation the saga must be satisfied, got %q", run.Outcome.Outcome)
		}
		if run.Leg != federation.LegCompensated {
			rt.Fatalf("a captured-then-failed leg must settle compensated, got %q", run.Leg)
		}
	})
}

func policyFixture() gi.GlobalInvariant {
	return gi.GlobalInvariant{
		Name:             "pii-forgettable-federation",
		Scope:            gi.ScopeFederationPolicy,
		Cells:            []gi.CellRef{"order", "payment", "shipping"},
		Predicate:        "every_aggregate_with_pii_implements_forgettable",
		BlastRadius:      gi.BlastRadiusGlobal,
		ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
}

func staleEdgeP(from, to string) redwave.Edge {
	return redwave.Edge{
		Link:        links.Link{Kind: links.KindDerivesFrom, From: links.Ref{ID: from, Version: "v1"}, To: links.Ref{ID: to, Version: "v1"}},
		LoadBearing: true, Layer: redwave.LayerProjection,
	}
}

// FanOut INVARIANT: a cell that does NOT violate the policy is NEVER reddened and ALWAYS has
// an empty queue — "les cellules non affectées restent vertes" (§51), regardless of how many
// other cells violate. And FanOut is DETERMINISTIC.
func TestProp_FanOut_NonViolatingCellStaysGreen_AndDeterministic(t *testing.T) {
	policy := policyFixture()
	rapid.Check(t, func(rt *rapid.T) {
		orderViolates := rapid.Bool().Draw(rt, "orderViolates")
		paymentViolates := rapid.Bool().Draw(rt, "paymentViolates")

		mk := func(c gi.CellRef, v bool, src, db string) federation.CellViolation {
			cv := federation.CellViolation{Cell: c, Violates: v, Heads: links.Heads{}}
			if v {
				cv.Bumped = []string{src}
				cv.Edges = []redwave.Edge{staleEdgeP(db, src)}
				cv.Heads = links.Heads{src: "v2"}
			}
			return cv
		}
		cells := []federation.CellViolation{
			mk("order", orderViolates, "OrderPII", "order-db"),
			mk("payment", paymentViolates, "PaymentPII", "payment-db"),
			mk("shipping", false, "", ""), // shipping NEVER violates
		}

		waves := federation.FanOut(policy, "order", "wave-1", cells)
		w2 := federation.FanOut(policy, "order", "wave-1", cells)
		if !reflect.DeepEqual(waves, w2) {
			rt.Fatalf("FanOut is non-deterministic")
		}

		for _, w := range waves {
			if w.Cell == "shipping" {
				if w.Reddened || len(w.Queue) != 0 {
					rt.Fatalf("non-violating shipping must stay GREEN, got reddened=%v queue=%v", w.Reddened, w.Queue)
				}
			}
			// Whenever a cell is reddened, it MUST be a cell that violates the policy.
			if w.Reddened && w.Cell == "shipping" {
				rt.Fatalf("a non-violating cell was reddened: %q", w.Cell)
			}
		}
	})
}
