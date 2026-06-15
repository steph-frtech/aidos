package harness_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=adr-0082-harness-fragment-substrate · test_kind=property ·
// cert_language=rapid · liveness=live ·
// authority=above-the-line-artefact(harness_fragment) projected below.
//
// ADR 0082 T1 — the HarnessFragment substrate + the CLOSED §48 topology enum +
// the PURE constructor. The laws:
//
//   L1 enum fermé : Topologies() = EXACTEMENT {crud, workflow, event-processor,
//      dashboard}, sans doublon ; IsKnown vrai sur ces quatre, faux ailleurs.
//   L2 fail-closed : NewFragment REFUSE une topologie hors enum, un set de guides
//      vide, un set de sensors vide, un golden path vide, un sensor à Check nil
//      (capteur mort), un sensor sans guide (détecteur orphelin) — jamais un
//      squelette par défaut.
//   L3 content-address déterministe : ∀ fragment légal, Hash() est STABLE (même
//      fragment ⇒ même adresse, ×N) et INDÉPENDANT de la closure Check (deux
//      fragments d'identité déclarée identique hashent pareil).
//   L4 Inspect pur : un capteur tire (Red) ssi la capacité attendue manque de la
//      cellule ; même (fragment, cell) ⇒ même set de tirs.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/harness"
	"pgregory.net/rapid"
)

// genKnownTopology draws one of the four closed families.
func genKnownTopology(rt *rapid.T) harness.Topology {
	ts := harness.Topologies()
	return ts[rapid.IntRange(0, len(ts)-1).Draw(rt, "topology")]
}

// --- L1 closed enum ----------------------------------------------------------

func TestL1EnumClosed(t *testing.T) {
	got := harness.Topologies()
	want := []harness.Topology{
		harness.TopologyCRUD,
		harness.TopologyWorkflow,
		harness.TopologyEventProcessor,
		harness.TopologyDashboard,
	}
	if len(got) != len(want) {
		t.Fatalf("Topologies() len = %d, want %d", len(got), len(want))
	}
	seen := map[harness.Topology]bool{}
	for i, tp := range got {
		if tp != want[i] {
			t.Fatalf("Topologies()[%d] = %q, want %q", i, tp, want[i])
		}
		if seen[tp] {
			t.Fatalf("Topologies() has a duplicate: %q", tp)
		}
		seen[tp] = true
		if !tp.IsKnown() {
			t.Fatalf("IsKnown(%q) = false, want true", tp)
		}
	}
}

func TestL1UnknownTopologyNotKnown(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		raw := rapid.String().Draw(rt, "raw")
		tp := harness.Topology(raw)
		known := false
		for _, k := range harness.Topologies() {
			if tp == k {
				known = true
				break
			}
		}
		if tp.IsKnown() != known {
			rt.Fatalf("IsKnown(%q) = %v, want %v", raw, tp.IsKnown(), known)
		}
	})
}

// --- L2 fail-closed constructor ---------------------------------------------

func TestL2UnknownTopologyRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		raw := rapid.String().Draw(rt, "raw")
		tp := harness.Topology(raw)
		if tp.IsKnown() {
			return // only exercise out-of-enum values
		}
		_, err := harness.NewFragment(tp,
			[]harness.Guide{{Invariant: "x", Expect: "x"}},
			[]harness.Sensor{{Invariant: "x", Check: func(harness.ObservedCell) harness.Verdict { return harness.Green }}},
			harness.GoldenPath{Name: "p", Steps: []string{"s"}},
		)
		if err == nil {
			rt.Fatalf("NewFragment(%q,...) returned no error for an unknown topology", raw)
		}
	})
}

func TestL2EmptyGuidesRefused(t *testing.T) {
	_, err := harness.NewFragment(harness.TopologyCRUD, nil,
		[]harness.Sensor{{Invariant: "x", Check: func(harness.ObservedCell) harness.Verdict { return harness.Green }}},
		harness.GoldenPath{Name: "p", Steps: []string{"s"}})
	if err == nil {
		t.Fatal("NewFragment with no guides must be refused")
	}
}

func TestL2EmptySensorsRefused(t *testing.T) {
	_, err := harness.NewFragment(harness.TopologyCRUD,
		[]harness.Guide{{Invariant: "x", Expect: "x"}}, nil,
		harness.GoldenPath{Name: "p", Steps: []string{"s"}})
	if err == nil {
		t.Fatal("NewFragment with no sensors must be refused")
	}
}

func TestL2EmptyGoldenPathRefused(t *testing.T) {
	_, err := harness.NewFragment(harness.TopologyCRUD,
		[]harness.Guide{{Invariant: "x", Expect: "x"}},
		[]harness.Sensor{{Invariant: "x", Check: func(harness.ObservedCell) harness.Verdict { return harness.Green }}},
		harness.GoldenPath{Name: "p"})
	if err == nil {
		t.Fatal("NewFragment with an empty golden path must be refused")
	}
}

func TestL2NilCheckSensorRefused(t *testing.T) {
	_, err := harness.NewFragment(harness.TopologyCRUD,
		[]harness.Guide{{Invariant: "x", Expect: "x"}},
		[]harness.Sensor{{Invariant: "x", Check: nil}},
		harness.GoldenPath{Name: "p", Steps: []string{"s"}})
	if err == nil {
		t.Fatal("NewFragment with a nil-Check sensor (a dead sensor) must be refused")
	}
}

func TestL2UnguidedSensorRefused(t *testing.T) {
	_, err := harness.NewFragment(harness.TopologyCRUD,
		[]harness.Guide{{Invariant: "x", Expect: "x"}},
		[]harness.Sensor{{Invariant: "orphan", Check: func(harness.ObservedCell) harness.Verdict { return harness.Green }}},
		harness.GoldenPath{Name: "p", Steps: []string{"s"}})
	if err == nil {
		t.Fatal("NewFragment with an orphan sensor (no matching guide) must be refused")
	}
}

// --- L3 deterministic content-address ----------------------------------------

// buildFragment constructs a small but legal fragment for a drawn topology, with
// a randomised invariant set — the same draw must always hash identically.
func buildFragment(rt *rapid.T) harness.HarnessFragment {
	tp := genKnownTopology(rt)
	n := rapid.IntRange(1, 4).Draw(rt, "ninv")
	var guides []harness.Guide
	var sensors []harness.Sensor
	for i := 0; i < n; i++ {
		inv := rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "inv")
		guides = append(guides, harness.Guide{Invariant: inv, Expect: "expect-" + inv})
		// the closure value differs run-to-run but must NOT affect the address
		sensors = append(sensors, harness.Sensor{
			Invariant: inv,
			Watches:   "watch-" + inv,
			Check:     func(harness.ObservedCell) harness.Verdict { return harness.Green },
		})
	}
	gp := harness.GoldenPath{Name: "gp", Steps: []string{"a", "b"}}
	f, err := harness.NewFragment(tp, guides, sensors, gp)
	if err != nil {
		rt.Fatalf("buildFragment: NewFragment errored on a legal input: %v", err)
	}
	return f
}

func TestL3HashStable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		f := buildFragment(rt)
		h1, err := f.Hash()
		if err != nil {
			rt.Fatalf("Hash() #1 errored: %v", err)
		}
		for i := 0; i < 8; i++ {
			h, err := f.Hash()
			if err != nil {
				rt.Fatalf("Hash() #%d errored: %v", i+2, err)
			}
			if h != h1 {
				rt.Fatalf("Hash() not stable: #1=%q #%d=%q", h1, i+2, h)
			}
		}
		if h1 == "" {
			rt.Fatalf("Hash() is empty")
		}
	})
}

func TestL3HashIgnoresCheckClosure(t *testing.T) {
	// Two fragments with byte-identical declared bodies but DIFFERENT Check
	// closures must hash equally — the func is not part of the content address.
	mk := func(verdict harness.Verdict) harness.HarnessFragment {
		f, err := harness.NewFragment(harness.TopologyCRUD,
			[]harness.Guide{{Invariant: "x", Expect: "x"}},
			[]harness.Sensor{{Invariant: "x", Watches: "w", Check: func(harness.ObservedCell) harness.Verdict { return verdict }}},
			harness.GoldenPath{Name: "p", Steps: []string{"s"}})
		if err != nil {
			t.Fatalf("NewFragment errored: %v", err)
		}
		return f
	}
	a, b := mk(harness.Green), mk(harness.Red)
	ha, err := a.Hash()
	if err != nil {
		t.Fatalf("a.Hash() errored: %v", err)
	}
	hb, err := b.Hash()
	if err != nil {
		t.Fatalf("b.Hash() errored: %v", err)
	}
	if ha != hb {
		t.Fatalf("Hash must ignore the Check closure: a=%q b=%q", ha, hb)
	}
}

// --- L4 Inspect purity -------------------------------------------------------

func TestL4InspectDeterministic(t *testing.T) {
	f := harness.CrudFragment()
	cell := harness.ConformantCrudCell()
	first := f.Inspect(cell)
	for i := 0; i < 5; i++ {
		again := f.Inspect(cell)
		if len(again) != len(first) {
			t.Fatalf("Inspect not deterministic: %v vs %v", first, again)
		}
		for j := range again {
			if again[j] != first[j] {
				t.Fatalf("Inspect not deterministic: %v vs %v", first, again)
			}
		}
	}
}
