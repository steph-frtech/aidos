package harness_test

// Invariant + fault-injection mirror for the concrete CRUD fragment (ADR 0082
// §6 T1 / §25 hook-honesty) — WRITTEN FIRST (RED→GREEN).
// reflects=adr-0082-crud-fragment · test_kind=property+fault-injection ·
// cert_language=rapid · liveness=live.
//
//   L5 fragment CRUD complet : CrudFragment() porte EXACTEMENT les quatre
//      invariants §19 (identity, validation, transitions, audit), un capteur par
//      guide (aucun orphelin, aucun Check nil), un golden path create→read→
//      update→delete, et un Hash stable (déterminisme).
//   L6 conformité : sur une cellule conforme (les 4 capacités déclarées), AUCUN
//      capteur ne tire — Inspect() = ∅.
//   L7 FAULT-INJECTION (le cœur §25, « un capteur qui ne tire jamais est mort ») :
//      ∀ capacité c des 4, retirer c de la cellule ⇒ le capteur de c (et lui seul)
//      tire (Red). Chaque capteur a donc une cassure prouvée qui le rougit.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/harness"
	"pgregory.net/rapid"
)

// --- L5 the CRUD fragment is complete and well-formed ------------------------

func TestL5CrudFragmentShape(t *testing.T) {
	f := harness.CrudFragment()

	if f.Topology != harness.TopologyCRUD {
		t.Fatalf("topology = %q, want crud", f.Topology)
	}

	wantInv := []string{harness.CrudAudit, harness.CrudIdentity, harness.CrudTransitions, harness.CrudValidation} // sorted
	gotInv := f.Invariants()
	if len(gotInv) != len(wantInv) {
		t.Fatalf("invariants = %v, want %v", gotInv, wantInv)
	}
	for i := range wantInv {
		if gotInv[i] != wantInv[i] {
			t.Fatalf("invariants[%d] = %q, want %q", i, gotInv[i], wantInv[i])
		}
	}

	// one sensor per guide, each with a non-nil Check (NewFragment guarantees it,
	// but assert the shape the §19 list demands).
	if len(f.Sensors) != 4 {
		t.Fatalf("sensors = %d, want 4 (identity/validation/transitions/audit)", len(f.Sensors))
	}
	for _, s := range f.Sensors {
		if s.Check == nil {
			t.Fatalf("sensor %q has a nil Check (a dead sensor)", s.Invariant)
		}
	}

	wantSteps := []string{"create", "read", "update", "delete"}
	if f.GoldenPath.Name != "crud-lifecycle" || len(f.GoldenPath.Steps) != len(wantSteps) {
		t.Fatalf("golden path = %+v, want crud-lifecycle %v", f.GoldenPath, wantSteps)
	}
	for i := range wantSteps {
		if f.GoldenPath.Steps[i] != wantSteps[i] {
			t.Fatalf("golden path step[%d] = %q, want %q", i, f.GoldenPath.Steps[i], wantSteps[i])
		}
	}
}

func TestL5CrudFragmentDeterministic(t *testing.T) {
	// Same call ⇒ byte-identical address (the reproducibility mirror).
	h1, err := harness.CrudFragment().Hash()
	if err != nil {
		t.Fatalf("Hash() errored: %v", err)
	}
	for i := 0; i < 10; i++ {
		h, err := harness.CrudFragment().Hash()
		if err != nil {
			t.Fatalf("Hash() errored: %v", err)
		}
		if h != h1 {
			t.Fatalf("CrudFragment() not deterministic: %q vs %q", h1, h)
		}
	}
}

// --- L6 a conformant cell trips nothing --------------------------------------

func TestL6ConformantCellTripsNoSensor(t *testing.T) {
	f := harness.CrudFragment()
	fired := f.Inspect(harness.ConformantCrudCell())
	if len(fired) != 0 {
		t.Fatalf("conformant cell fired sensors %v, want none", fired)
	}
}

// --- L7 FAULT-INJECTION: break the invariant ⇒ the matching sensor reddens ----

// TestL7FaultInjectionEachCapability is the load-bearing §25 test: for EVERY one
// of the four CRUD capabilities, dropping it from an otherwise-conformant cell
// makes EXACTLY the matching sensor fire — proving no sensor is dead.
func TestL7FaultInjectionEachCapability(t *testing.T) {
	f := harness.CrudFragment()
	for _, missing := range harness.CrudCapabilities() {
		t.Run(missing, func(t *testing.T) {
			// build a cell missing exactly `missing`
			broken := harness.ConformantCrudCell()
			delete(broken.Has, missing)

			fired := f.Inspect(broken)
			if len(fired) != 1 {
				t.Fatalf("dropping %q fired %v, want exactly [%q]", missing, fired, missing)
			}
			if fired[0] != missing {
				t.Fatalf("dropping %q fired sensor %q, want %q", missing, fired[0], missing)
			}
		})
	}
}

// TestL7FaultInjectionProperty generalises L7: for any non-empty subset of the
// four capabilities removed, EXACTLY those sensors fire (the firing set equals
// the removed set). A capture broken on N invariants reddens N sensors — never
// silently passes (the anti-dead-sensor frontier).
func TestL7FaultInjectionProperty(t *testing.T) {
	f := harness.CrudFragment()
	caps := harness.CrudCapabilities()
	rapid.Check(t, func(rt *rapid.T) {
		removed := map[string]bool{}
		cell := harness.ConformantCrudCell()
		// draw a non-empty subset to remove
		for _, c := range caps {
			if rapid.Bool().Draw(rt, "drop-"+c) {
				delete(cell.Has, c)
				removed[c] = true
			}
		}
		if len(removed) == 0 {
			// force at least one removal so we always exercise a firing
			delete(cell.Has, caps[0])
			removed[caps[0]] = true
		}

		fired := f.Inspect(cell)
		firedSet := map[string]bool{}
		for _, k := range fired {
			firedSet[k] = true
		}
		if len(firedSet) != len(removed) {
			rt.Fatalf("removed %v fired %v (counts differ)", removed, fired)
		}
		for c := range removed {
			if !firedSet[c] {
				rt.Fatalf("removed %q but its sensor did not fire (fired=%v)", c, fired)
			}
		}
		// and no spurious firing for a present capability
		for c := range firedSet {
			if !removed[c] {
				rt.Fatalf("sensor %q fired but its capability was present", c)
			}
		}
	})
}
