package federation_test

// S103 §51 FIXTURE MIRROR — the federation composition done-criteria, written first (red),
// the code drives it green. Two scenarios from the ROADMAP:
//
//   (1) A saga (payment_captured ⇒ order_confirmed ∨ compensation) holds on TWO REAL CELLS
//       (order + payment, a contracted pair); breaking a leg triggers compensation.
//   (2) A global policy change fans out to a RedWorkQueue PER CELL; the cells NOT affected
//       stay GREEN.
//
// The mirror REUSES the prior steps' fixtures verbatim (sagas, globalinvariant, redwave, cell)
// — it asserts the COMPOSITION, never re-tests the parts.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	gi "github.com/steph-frtech/aidos/back/kernel/globalinvariant"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/sagas"
	"github.com/steph-frtech/aidos/back/kernel/temporal"
	"github.com/steph-frtech/aidos/back/runtime/federation"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// Scenario 3: S50 TemporalInvariant wired onto two REAL cells — a `within 5m` deadline across
// payment + order holds when the confirmation lands inside the band, and a non-contracted pair
// is refused.
func TestTemporalOverTwoCells(t *testing.T) {
	inv := temporal.TemporalInvariant{
		Property:   "payment_captured implies order_confirmed within 5 minutes",
		Antecedent: "payment_captured",
		Consequent: "order_confirmed",
		Relation:   temporal.RelationWithin,
		Bound:      "5m",
		Clock:      temporal.ClockSystem,
		Tolerance:  "10s",
		Mirror:     temporal.MirrorStatechart,
	}
	if err := temporal.Validate(inv); err != nil {
		t.Fatalf("temporal invariant must validate: %v", err)
	}
	obs := temporal.Observation{
		EventOrder: []temporal.EventName{"payment_captured", "order_confirmed"},
		Elapsed:    4 * 60 * 1e9, // 4m, inside the 5m+10s band
	}

	// Contracted pair, inside the band ⇒ held.
	run := federation.TemporalOverCells(inv, "payment", "order", contractedFederation(), obs)
	if run.AccessBlock != nil {
		t.Fatalf("contracted pair must not be blocked, got %+v", run.AccessBlock)
	}
	if run.Verdict.Verdict != temporal.VerdictHeld {
		t.Fatalf("inside the band ⇒ held, got %q", run.Verdict.Verdict)
	}

	// Non-contracted pair ⇒ refused before evaluation.
	blocked := federation.TemporalOverCells(inv, "payment", "order", cell.Federation{}, obs)
	if blocked.AccessBlock == nil || blocked.AccessBlock.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("non-contracted temporal pair must be refused with CROSS_CELL_NO_CONTRACT, got %+v", blocked.AccessBlock)
	}
}

// twoCellSaga is the canonical checkout saga over the two REAL cells `order` and `payment`.
func twoCellSaga() sagas.SagaInvariant {
	return sagas.SagaInvariant{
		Name:  "checkout-order-payment",
		Scope: sagas.ScopeFederationPolicy,
		Participants: []sagas.SagaParticipant{
			{
				Cell:    "order",
				Commits: []sagas.EventName{"order_confirmed"},
				Compensation: []links.Ref{
					{ID: "cancelOrder", Version: "v2"},
				},
			},
			{
				Cell:    "payment",
				Commits: []sagas.EventName{"payment_captured"},
				Compensation: []links.Ref{
					{ID: "refundPayment", Version: "v3"},
				},
			},
		},
		Property: "payment_captured implies (order_confirmed or compensation_executed)",
		Mirror:   sagas.MirrorSpec{CertLanguage: sagas.CertStatechart},
	}
}

// contractedFederation links order ↔ payment with an HONORED contract (a real pair).
func contractedFederation() cell.Federation {
	return cell.Federation{Contracts: []cell.Contract{
		{A: "order", B: "payment", Honored: true},
	}}
}

// Scenario 1a: the happy path on two real cells — both legs commit ⇒ satisfied, leg=happy.
func TestSagaOverTwoCells_HappyPath(t *testing.T) {
	saga := twoCellSaga()
	if err := sagas.Validate(saga); err != nil {
		t.Fatalf("saga must validate: %v", err)
	}
	run := federation.SagaOverCells(saga, contractedFederation(),
		sagas.Trace{"payment_captured", "order_confirmed"})

	if run.AccessBlock != nil {
		t.Fatalf("contracted pair must not be blocked, got %+v", run.AccessBlock)
	}
	if run.Leg != federation.LegHappy {
		t.Fatalf("happy path: want leg=happy, got %q", run.Leg)
	}
	if run.Outcome.Outcome != sagas.OutcomeSatisfied {
		t.Fatalf("happy path: want satisfied, got %q", run.Outcome.Outcome)
	}
	if len(run.Compensation) != 0 {
		t.Fatalf("happy path runs no compensation, got %v", run.Compensation)
	}
}

// Scenario 1b: BREAK A LEG — payment captured, order never confirmed ⇒ compensation runs,
// and AFTER compensation the saga is satisfied VIA compensation (leg=compensated). This is
// the §51 done case: "casser une jambe déclenche compensation".
func TestSagaOverTwoCells_BrokenLegTriggersCompensation(t *testing.T) {
	saga := twoCellSaga()
	run := federation.SagaOverCells(saga, contractedFederation(),
		sagas.Trace{"payment_captured"}) // the order leg failed: no order_confirmed

	if run.Leg != federation.LegCompensated {
		t.Fatalf("broken leg: want leg=compensated, got %q (outcome=%q)", run.Leg, run.Outcome.Outcome)
	}
	if run.Outcome.Outcome != sagas.OutcomeSatisfied {
		t.Fatalf("after compensation the saga must be satisfied, got %q", run.Outcome.Outcome)
	}
	// The compensation ran the payment leg's declared compensation (refundPayment@v3) and
	// terminated with the compensation_executed marker.
	if len(run.Compensation) == 0 || run.Compensation[len(run.Compensation)-1] != "compensation_executed" {
		t.Fatalf("compensation must terminate with compensation_executed, got %v", run.Compensation)
	}
	foundRefund := false
	for _, e := range run.Compensation {
		if e == "refundPayment@v3" {
			foundRefund = true
		}
	}
	if !foundRefund {
		t.Fatalf("compensation must include the failed leg's declared compensation refundPayment@v3, got %v", run.Compensation)
	}
}

// Scenario 1c: a saga over two NON-contracted cells is REFUSED before any evaluation — a
// federation has no implicit channel between strangers (S100 wall).
func TestSagaOverTwoCells_NonContractedPairRefused(t *testing.T) {
	saga := twoCellSaga()
	run := federation.SagaOverCells(saga, cell.Federation{ /* no contracts */ },
		sagas.Trace{"payment_captured", "order_confirmed"})

	if run.AccessBlock == nil {
		t.Fatalf("a saga over two non-contracted cells must be refused")
	}
	if run.AccessBlock.Code != cell.CodeCrossCellNoContract {
		t.Fatalf("want CROSS_CELL_NO_CONTRACT, got %q", run.AccessBlock.Code)
	}
	if run.Leg != federation.LegViolated {
		t.Fatalf("a refused saga is not run, want leg=violated, got %q", run.Leg)
	}
}

// piiPolicy is the §51 federation-wide GlobalInvariant ("tout PII oubliable") expressed ONCE
// over three cells. Reused by S116.
func piiPolicy() gi.GlobalInvariant {
	return gi.GlobalInvariant{
		Name:             "pii-forgettable-federation",
		Scope:            gi.ScopeFederationPolicy,
		Cells:            []gi.CellRef{"order", "payment", "shipping"},
		Predicate:        "every_aggregate_with_pii_implements_forgettable",
		BlastRadius:      gi.BlastRadiusGlobal,
		ApprovalRequired: gi.AuthorityArchitectureOwner,
	}
}

// staleEdge models one cell's own stale projection link (S22) the policy violation reddens.
func staleEdge(from, to string) redwave.Edge {
	return redwave.Edge{
		Link: links.Link{
			Kind: links.KindDerivesFrom,
			From: links.Ref{ID: from, Version: "v1"},
			To:   links.Ref{ID: to, Version: "v1"},
		},
		LoadBearing: true,
		Layer:       redwave.LayerProjection,
	}
}

// Scenario 2: a global policy change FANS OUT to a RedWorkQueue PER CELL. The two cells that
// VIOLATE the policy (order, payment) each get their OWN queue; the cell that does NOT violate
// it (shipping) stays GREEN with an empty queue (§51).
func TestGlobalPolicyFanOut_PerCellQueue_NonAffectedStayGreen(t *testing.T) {
	policy := piiPolicy()
	if err := gi.Validate(policy); err != nil {
		t.Fatalf("policy must validate: %v", err)
	}

	// `order` and `payment` carry a PII aggregate without Forgettable ⇒ they violate the
	// policy and have a stale projection edge. `shipping` carries no PII ⇒ it does NOT violate.
	cells := []federation.CellViolation{
		{
			Cell:     "order",
			Violates: true,
			Bumped:   []string{"OrderPII"},
			Edges:    []redwave.Edge{staleEdge("order-db", "OrderPII")},
			Heads:    links.Heads{"OrderPII": "v2"}, // bumped v1→v2 ⇒ the edge is stale
		},
		{
			Cell:     "payment",
			Violates: true,
			Bumped:   []string{"PaymentPII"},
			Edges:    []redwave.Edge{staleEdge("payment-db", "PaymentPII")},
			Heads:    links.Heads{"PaymentPII": "v2"},
		},
		{
			Cell:     "shipping",
			Violates: false, // no PII ⇒ no violation ⇒ stays green
			Bumped:   nil,
			Edges:    nil,
			Heads:    links.Heads{},
		},
	}

	// The policy violation is SEEDED at `order`; the fan-out reaches the whole federation span.
	waves := federation.FanOut(policy, "order", "policy-bump-abc123", cells)

	if len(waves) != 3 {
		t.Fatalf("want one wave per supplied cell (3), got %d", len(waves))
	}
	byCell := map[gi.CellRef]federation.CellRedWave{}
	for _, w := range waves {
		byCell[w.Cell] = w
	}

	// order + payment are reddened, each with its OWN non-empty RedWorkQueue stamped with the
	// policy wave id.
	for _, c := range []gi.CellRef{"order", "payment"} {
		w := byCell[c]
		if !w.Reddened {
			t.Fatalf("violating cell %q must be reddened", c)
		}
		if len(w.Queue) == 0 {
			t.Fatalf("reddened cell %q must have its OWN RedWorkQueue rows", c)
		}
		for _, row := range w.Queue {
			if row.WaveID != "policy-bump-abc123" {
				t.Fatalf("cell %q row must be stamped with the policy wave id, got %q", c, row.WaveID)
			}
		}
	}

	// shipping is NOT affected ⇒ stays GREEN with an empty queue (the §51 invariant).
	ship := byCell["shipping"]
	if ship.Reddened {
		t.Fatalf("non-violating cell shipping must stay GREEN (not reddened)")
	}
	if len(ship.Queue) != 0 {
		t.Fatalf("non-affected cell shipping must have an EMPTY queue, got %v", ship.Queue)
	}

	// The affected-cells projection lists exactly order + payment.
	aff := federation.AffectedCells(waves)
	if len(aff) != 2 || aff[0] != "order" || aff[1] != "payment" {
		t.Fatalf("affected cells must be [order payment], got %v", aff)
	}
}
