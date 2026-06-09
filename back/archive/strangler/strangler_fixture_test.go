// Mirror record (S104): reflects=S104-strangler-fig, test_kind=fixture, cert_language=fixture,
// liveness=alive. The §50 done-criterion as state→command→events fixtures:
//
//  1. carve→freeze→refactor (NO behaviour change) → the characterization mirrors stay GREEN
//     across the internal refactor AND the published contract is honored → the refactor is
//     ACCEPTED ("les miroirs de caractérisation restent verts à travers un refactor interne ;
//     le contrat publié est honoré").
//  2. a refactor that CHANGES an observable output reddens its characterization mirror and is
//     REFUSED (STRANGLER_CHARACTERIZATION_DRIFT) — the green net catches the behaviour change.
//  3. a refactor that keeps behaviour but BREAKS the published contract is REFUSED
//     (STRANGLER_PUBLISHED_CONTRACT_BROKEN) — the fig must keep honoring the contract.
//  4. carving a legacy with NO observed behaviour is REFUSED (cannot freeze the unobserved).
//
// This fixture is RED until back/archive/strangler/strangler.go exists (mirror-first, §6).
package strangler

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
)

// legacyBilling is the canonical S104 legacy: a "billing" cell carved out of a monolith,
// observed over three (input → output) traces, publishing a contract its neighbours consume.
func legacyBilling() Legacy {
	return Legacy{
		Cell:              cell.Ref("billing"),
		InternalNodes:     []string{"billing.invoice", "billing.tax", "billing.legacy_calc"},
		PublishedContract: "billing.charge.v1",
		Observed: []Trace{
			{Name: "charge in-currency", Input: json.RawMessage(`{"amount":100,"currency":"EUR"}`), Output: json.RawMessage(`{"charged":100,"fee":0}`)},
			{Name: "charge cross-currency", Input: json.RawMessage(`{"amount":100,"currency":"USD"}`), Output: json.RawMessage(`{"charged":92,"fee":3}`)},
			{Name: "charge zero", Input: json.RawMessage(`{"amount":0,"currency":"EUR"}`), Output: json.RawMessage(`{"charged":0,"fee":0}`)},
		},
	}
}

// observationPreserving returns the refactored cell's observed behaviour when the refactor
// changed NOTHING observable (same output for every frozen input, key order shuffled to prove
// canonicalisation), with the published contract still honored.
func observationPreserving() RefactorObservation {
	return RefactorObservation{
		Outputs: map[string]json.RawMessage{
			// same outputs, keys reordered → canonicalisation makes them equal (still green).
			"charge in-currency":    json.RawMessage(`{"fee":0,"charged":100}`),
			"charge cross-currency": json.RawMessage(`{"fee":3,"charged":92}`),
			"charge zero":           json.RawMessage(`{"fee":0,"charged":0}`),
		},
		ContractHonored: true,
	}
}

// Scenario 1 — carve → freeze → refactor with NO behaviour change → ACCEPTED.
func TestStrangler_RefactorPreservingBehaviour_StaysGreen_ContractHonored(t *testing.T) {
	sc, err := Carve(legacyBilling())
	if err != nil {
		t.Fatalf("Carve: unexpected error %v", err)
	}
	if sc.Cell != cell.Ref("billing") {
		t.Fatalf("Carve: cell = %q, want billing", sc.Cell)
	}
	if sc.Hash == "" {
		t.Fatalf("Carve: empty content hash")
	}

	mirrors := Freeze(sc)
	if len(mirrors) != 3 {
		t.Fatalf("Freeze: %d characterization mirrors, want 3", len(mirrors))
	}
	for _, m := range mirrors {
		if !m.Characterization {
			t.Fatalf("Freeze: mirror %q not tagged characterization", m.Scenario)
		}
		if m.TestKind != "fixture" {
			t.Fatalf("Freeze: mirror %q test_kind = %q, want fixture", m.Scenario, m.TestKind)
		}
		if m.ID == "" {
			t.Fatalf("Freeze: mirror %q has empty id", m.Scenario)
		}
	}

	v := Refactor(sc, mirrors, observationPreserving())
	if !v.AllGreen {
		t.Fatalf("Refactor: AllGreen = false, want true (behaviour preserved): %+v", v.Mirrors)
	}
	if !v.ContractHonored {
		t.Fatalf("Refactor: ContractHonored = false, want true")
	}
	if !v.Accepted {
		t.Fatalf("Refactor: Accepted = false, want true (green net intact, contract honored)")
	}
	if v.Block != nil {
		t.Fatalf("Refactor: unexpected block %+v", v.Block)
	}
}

// Scenario 2 — a refactor that CHANGES an observable output → REFUSED (drift caught).
func TestStrangler_RefactorChangingBehaviour_Reddens_Refused(t *testing.T) {
	sc, _ := Carve(legacyBilling())
	mirrors := Freeze(sc)

	obs := observationPreserving()
	// the refactor "simplifies" the cross-currency fee away — an observable behaviour CHANGE.
	obs.Outputs["charge cross-currency"] = json.RawMessage(`{"charged":92,"fee":0}`)

	v := Refactor(sc, mirrors, obs)
	if v.AllGreen {
		t.Fatalf("Refactor: AllGreen = true, want false (behaviour changed)")
	}
	if v.Accepted {
		t.Fatalf("Refactor: Accepted = true, want false (drift must be refused)")
	}
	if v.Block == nil || v.Block.Code != CodeCharacterizationDrift {
		t.Fatalf("Refactor: block = %+v, want STRANGLER_CHARACTERIZATION_DRIFT", v.Block)
	}
	// exactly the cross-currency mirror is red; the other two stay green.
	red := 0
	for _, m := range v.Mirrors {
		if !m.Green {
			red++
			if m.Scenario != "charge cross-currency" {
				t.Fatalf("Refactor: wrong mirror red: %q", m.Scenario)
			}
		}
	}
	if red != 1 {
		t.Fatalf("Refactor: %d red mirrors, want exactly 1", red)
	}
}

// Scenario 2b — a refactor that DROPS a scenario (no output) is also a drift.
func TestStrangler_RefactorDroppingScenario_Reddens_Refused(t *testing.T) {
	sc, _ := Carve(legacyBilling())
	mirrors := Freeze(sc)

	obs := observationPreserving()
	delete(obs.Outputs, "charge zero") // the refactor lost a behaviour entirely.

	v := Refactor(sc, mirrors, obs)
	if v.Accepted {
		t.Fatalf("Refactor: Accepted = true, want false (dropped scenario is a drift)")
	}
	if v.Block == nil || v.Block.Code != CodeCharacterizationDrift {
		t.Fatalf("Refactor: block = %+v, want drift", v.Block)
	}
}

// Scenario 3 — behaviour preserved but the PUBLISHED CONTRACT broken → REFUSED.
func TestStrangler_RefactorBreakingContract_Refused(t *testing.T) {
	sc, _ := Carve(legacyBilling())
	mirrors := Freeze(sc)

	obs := observationPreserving()
	obs.ContractHonored = false // the refactor broke the published surface.

	v := Refactor(sc, mirrors, obs)
	if !v.AllGreen {
		t.Fatalf("Refactor: AllGreen = false, want true (behaviour preserved)")
	}
	if v.ContractHonored {
		t.Fatalf("Refactor: ContractHonored = true, want false")
	}
	if v.Accepted {
		t.Fatalf("Refactor: Accepted = true, want false (broken contract must be refused)")
	}
	if v.Block == nil || v.Block.Code != CodeContractBroken {
		t.Fatalf("Refactor: block = %+v, want STRANGLER_PUBLISHED_CONTRACT_BROKEN", v.Block)
	}
}

// Scenario 4 — carving a legacy with NO observed behaviour is REFUSED.
func TestStrangler_CarveWithoutObservedBehaviour_Refused(t *testing.T) {
	_, err := Carve(Legacy{Cell: cell.Ref("billing"), Observed: nil})
	if err != ErrNoObservedBehaviour {
		t.Fatalf("Carve: err = %v, want ErrNoObservedBehaviour", err)
	}

	_, err = Carve(Legacy{Cell: cell.Ref(""), Observed: []Trace{{Name: "x", Input: json.RawMessage(`1`), Output: json.RawMessage(`1`)}}})
	if err != ErrUnnamedCell {
		t.Fatalf("Carve: err = %v, want ErrUnnamedCell", err)
	}
}
