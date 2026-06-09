// Reproducibility mirror (S104): reflects=S104-strangler-fig, test_kind=property,
// cert_language=rapid, liveness=alive. The determinism-first guarantees (CLAUDE.md §6/§8):
//
//   - DETERMINISM: same legacy ⇒ byte-identical StranglerCell + hash; same StranglerCell ⇒
//     byte-identical characterization mirror set + ids; same (mirrors, observation) ⇒ same
//     refactor verdict. Carve/Freeze/Refactor are PURE total functions.
//   - FREEZE-THEN-REPLAY-IS-GREEN: freezing a cell's OWN observed behaviour and immediately
//     replaying that EXACT behaviour is always ACCEPTED (a no-op refactor never reddens — the
//     net pins the observed behaviour, not more, not less).
//   - ANY-DRIFT-IS-CAUGHT: changing ANY one observed output reddens exactly its mirror and
//     refuses the refactor (the characterization net never lets a behaviour change through).
package strangler

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"pgregory.net/rapid"
)

// genLegacy draws a random observable legacy: a named cell, 1..6 distinct observed traces.
func genLegacy(t *rapid.T) Legacy {
	name := rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "cell")
	n := rapid.IntRange(1, 6).Draw(t, "ntraces")
	traces := make([]Trace, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		tn := fmt.Sprintf("case-%d", i)
		if seen[tn] {
			continue
		}
		seen[tn] = true
		in := rapid.IntRange(0, 1000).Draw(t, "in")
		out := rapid.IntRange(0, 1000).Draw(t, "out")
		traces = append(traces, Trace{
			Name:   tn,
			Input:  json.RawMessage(fmt.Sprintf(`{"v":%d}`, in)),
			Output: json.RawMessage(fmt.Sprintf(`{"r":%d}`, out)),
		})
	}
	pub := ""
	if rapid.Bool().Draw(t, "haspub") {
		pub = name + ".contract.v1"
	}
	return Legacy{Cell: cell.Ref(name), InternalNodes: []string{name + ".a", name + ".b"}, PublishedContract: pub, Observed: traces}
}

// replay builds the OBSERVED behaviour of a refactor that changed NOTHING — it returns each
// frozen output verbatim, contract honored.
func replay(sc StranglerCell) RefactorObservation {
	outs := map[string]json.RawMessage{}
	for _, tr := range sc.Observed {
		outs[tr.Name] = tr.Output
	}
	return RefactorObservation{Outputs: outs, ContractHonored: true}
}

// PROPERTY 1 — Carve is deterministic: same legacy ⇒ byte-identical cell + hash.
func TestProp_CarveDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := genLegacy(t)
		a, ea := Carve(l)
		b, eb := Carve(l)
		if (ea == nil) != (eb == nil) {
			t.Fatalf("Carve non-deterministic error: %v vs %v", ea, eb)
		}
		if ea != nil {
			return
		}
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			t.Fatalf("Carve non-deterministic:\n%s\n%s", ja, jb)
		}
		if a.Hash != b.Hash {
			t.Fatalf("Carve hash non-deterministic: %s vs %s", a.Hash, b.Hash)
		}
	})
}

// PROPERTY 2 — Freeze is deterministic: same cell ⇒ byte-identical mirror set + ids.
func TestProp_FreezeDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sc, err := Carve(genLegacy(t))
		if err != nil {
			return
		}
		a := Freeze(sc)
		b := Freeze(sc)
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			t.Fatalf("Freeze non-deterministic:\n%s\n%s", ja, jb)
		}
		if len(a) != len(sc.Observed) {
			t.Fatalf("Freeze: %d mirrors for %d observed traces", len(a), len(sc.Observed))
		}
	})
}

// PROPERTY 3 — FREEZE-THEN-REPLAY-IS-GREEN: a no-op refactor is always ACCEPTED.
func TestProp_ReplayIsAlwaysAccepted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sc, err := Carve(genLegacy(t))
		if err != nil {
			return
		}
		mirrors := Freeze(sc)
		v := Refactor(sc, mirrors, replay(sc))
		if !v.Accepted {
			t.Fatalf("replay not accepted: %+v", v)
		}
		if !v.AllGreen || !v.ContractHonored {
			t.Fatalf("replay not all-green/contract-honored: %+v", v)
		}
		if v.Block != nil {
			t.Fatalf("replay produced a block: %+v", v.Block)
		}
	})
}

// PROPERTY 4 — ANY-DRIFT-IS-CAUGHT: changing one output reddens exactly its mirror and refuses.
func TestProp_AnyDriftIsCaught(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sc, err := Carve(genLegacy(t))
		if err != nil {
			return
		}
		mirrors := Freeze(sc)
		obs := replay(sc)
		// drift exactly one scenario's output.
		idx := rapid.IntRange(0, len(sc.Observed)-1).Draw(t, "drift")
		target := sc.Observed[idx].Name
		obs.Outputs[target] = json.RawMessage(`{"r":-1}`) // an output no frozen trace carries.

		v := Refactor(sc, mirrors, obs)
		if v.Accepted {
			t.Fatalf("drift accepted (should be refused): scenario %q", target)
		}
		if v.AllGreen {
			t.Fatalf("drift left AllGreen=true")
		}
		if v.Block == nil || v.Block.Code != CodeCharacterizationDrift {
			t.Fatalf("drift block = %+v, want drift", v.Block)
		}
		for _, m := range v.Mirrors {
			if m.Scenario == target && m.Green {
				t.Fatalf("drifted scenario %q stayed green", target)
			}
		}
	})
}

// PROPERTY 5 — Refactor is deterministic: same inputs ⇒ same verdict.
func TestProp_RefactorDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		sc, err := Carve(genLegacy(t))
		if err != nil {
			return
		}
		mirrors := Freeze(sc)
		obs := replay(sc)
		a := Refactor(sc, mirrors, obs)
		b := Refactor(sc, mirrors, obs)
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			t.Fatalf("Refactor non-deterministic:\n%s\n%s", ja, jb)
		}
	})
}
