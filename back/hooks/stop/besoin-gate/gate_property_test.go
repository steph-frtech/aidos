package main

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"pgregory.net/rapid"
)

// mustBodyRT marshals a body for the property draw (rapid.T variant of mustBody).
func mustBodyRT(rt *rapid.T, m map[string]any) json.RawMessage {
	raw, err := json.Marshal(m)
	if err != nil {
		rt.Fatalf("marshal body: %v", err)
	}
	return raw
}

// fullMetaRT is the four-metadata set for the property draw (rapid.T variant of fullMeta).
func fullMetaRT(_ *rapid.T) besoin.Metadata {
	return besoin.Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

// gate_property_test.go — the EL11 REPRODUCIBILITY mirror (determinism-first, CLAUDE.md §6/§8):
// the gate verdict is a PURE function of the event — same event → same Decision, byte-for-byte.
// No clock/rng/IO/LLM enters Decide. This pins that the verdict is COMPUTED, never declared.

// TestDecide_Deterministic — for any event drawn from the closed shape space, Decide is stable
// across repeated calls (same verdict, same disjunct flags, same number of reasons).
func TestDecide_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ev := drawEvent(rt)
		a := Decide(ev)
		b := Decide(ev)
		if a.Verdict != b.Verdict || a.NotEnough != b.NotEnough || a.HasMonster != b.HasMonster {
			rt.Fatalf("Decide is not deterministic: %+v vs %+v", a, b)
		}
		if len(a.BlockReasons) != len(b.BlockReasons) {
			rt.Fatalf("Decide reason count not deterministic: %d vs %d", len(a.BlockReasons), len(b.BlockReasons))
		}
		// The OR invariant: a Block fires iff a disjunct fired; an Allow/NoOp fires iff neither.
		switch a.Verdict {
		case VerdictBlock:
			if !a.NotEnough && !a.HasMonster {
				rt.Fatalf("Block with neither disjunct set violates the OR")
			}
		case VerdictAllow:
			if a.NotEnough || a.HasMonster {
				rt.Fatalf("Allow with a disjunct set violates the OR")
			}
		case VerdictNoOp:
			if ev.Besoin != nil {
				rt.Fatalf("NoOp only when there is no besoin session")
			}
		}
	})
}

// drawEvent draws a structurally-valid Stop event: sometimes a no-op (nil session), sometimes a
// session over a random valid grammar level with a random body and a random mirror set.
func drawEvent(rt *rapid.T) StopEvent {
	if rapid.Bool().Draw(rt, "no_session") {
		return StopEvent{Ref: rapid.String().Draw(rt, "ref")}
	}
	levels := besoin.Levels()
	lvl := levels[rapid.IntRange(0, len(levels)-1).Draw(rt, "level")]

	body := mustBodyRT(rt, map[string]any{
		"intent":    rapid.String().Draw(rt, "intent"),
		"scenarios": []string{"a", "b"},
		"selects":   drawSelects(rt),
		"gherkin":   "Given x When y Then z",
		"goal":      "g",
		"zones":     []string{"z1"},
		"data":      []string{"d1"},
	})
	status := []besoin.NodeStatus{besoin.NodeEmpty, besoin.NodeDrafting, besoin.NodeResolved}[rapid.IntRange(0, 2).Draw(rt, "status")]
	node := besoin.LevelNode{
		Level:      lvl,
		Body:       body,
		Provenance: besoin.Provenance{Source: "human", Detail: "x"},
		Status:     status,
	}
	g, err := besoin.NewGraph("p").AddNode(node)
	if err != nil {
		// An invalid node shape is not part of the event-space the gate gates; skip the draw.
		rt.Skip("node not addable")
	}

	var mirrors []besoin.BesoinLevelMirror
	if rapid.Bool().Draw(rt, "with_mirror") {
		if form, ok := besoin.LevelMirrorForm(lvl); ok {
			mirrors = append(mirrors, besoin.BesoinLevelMirror{Reflects: lvl, Form: form})
		}
	}

	return StopEvent{Besoin: &BesoinSession{
		Project:  "p",
		Level:    lvl,
		Graph:    g,
		Metadata: fullMetaRT(rt),
		Mirrors:  mirrors,
	}}
}

func drawSelects(rt *rapid.T) []string {
	n := rapid.IntRange(0, 3).Draw(rt, "nselects")
	out := make([]string, 0, n)
	pool := []string{"onboarding", "core-task", "list", "detail"}
	for i := 0; i < n; i++ {
		out = append(out, pool[rapid.IntRange(0, len(pool)-1).Draw(rt, "sel")])
	}
	return out
}
