package besoin

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"pgregory.net/rapid"
)

// emit_ideas_property_test.go — the EL16 reproducibility mirror (∀ invariant, property form, rapid).
// EmitIdeas(graph) → []Idea is a PURE TOTAL function governed by the closed table LevelToProposes
// (EL05). It must be:
//   - DETERMINISTIC : same graph → byte-identical []Idea (same ids, same order). (idempotence)
//   - GOVERNED      : every emitted Idea's Proposes == LevelToProposes(level).Proposes — never a cast.
//   - NoEmit-SAFE   : no Idea is ever emitted for a NoEmit rung (journey/view/invariant).
//   - RESOLVED-ONLY : only resolved rungs emit — empty/drafting rungs never emit.
//   - WALL          : every emitted Idea is a draft (no freeze) and carries no version/mirror key.
//   - COUNT-EXACT   : len(EmitIdeas(g)) == EmitCount(g) (the count authority matches the emission).

// randomGraph draws a BesoinGraph with a random subset of levels, each at a random status. The body is
// a minimal canonical marker; the utterance is deterministic from the level so the address is stable.
func randomGraph(rt *rapid.T) BesoinGraph {
	all := AllLevels()
	g := NewGraph("prop-" + rapid.StringMatching(`[a-z]{3}`).Draw(rt, "proj"))
	for _, l := range all {
		if !rapid.Bool().Draw(rt, "include-"+string(l)) {
			continue
		}
		statuses := NodeStatuses()
		s := statuses[rapid.IntRange(0, len(statuses)-1).Draw(rt, "status-"+string(l))]
		body, _ := json.Marshal(map[string]any{"marker": string(l)})
		ng, err := g.AddNode(LevelNode{
			Level:      l,
			Body:       body,
			Status:     s,
			Provenance: Provenance{Source: "human", Detail: "je veux " + string(l)},
		})
		if err == nil {
			g = ng
		}
	}
	return g
}

// Property: EmitIdeas is DETERMINISTIC — the same graph yields byte-identical []Idea on every call.
func TestEmitIdeas_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := randomGraph(rt)
		a, errA := EmitIdeas(g)
		b, errB := EmitIdeas(g)
		if errA != nil || errB != nil {
			rt.Fatalf("emit errors: %v / %v", errA, errB)
		}
		ja, _ := json.Marshal(a)
		jb, _ := json.Marshal(b)
		if string(ja) != string(jb) {
			rt.Fatalf("non-deterministic emission:\n  %s\n  %s", ja, jb)
		}
	})
}

// Property: every emitted Idea is GOVERNED by the closed table — its Proposes is the table verdict for
// SOME resolved level, and it is never for a NoEmit level.
func TestEmitIdeas_GovernedByTable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := randomGraph(rt)
		out, err := EmitIdeas(g)
		if err != nil {
			rt.Fatalf("emit error: %v", err)
		}
		// Build the set of (proposes) the resolved mapping rungs SHOULD emit.
		want := map[ideas.Proposes]bool{}
		for i := range g.Nodes {
			n := g.Nodes[i]
			if n.Status != NodeResolved {
				continue
			}
			m := LevelToProposes(n.Level)
			if m.Kind == MappingEmit {
				want[m.Proposes] = true
			}
		}
		for _, idea := range out {
			if !want[idea.Proposes] {
				rt.Fatalf("emitted Idea proposes %q but no resolved mapping rung backs it", idea.Proposes)
			}
			if idea.Status != ideas.StatusDraft {
				rt.Fatalf("emitted Idea status = %q, want draft (the wall: no freeze)", idea.Status)
			}
		}
	})
}

// Property: no Idea is ever emitted for a NoEmit rung (journey/view/invariant), even when resolved.
func TestEmitIdeas_NoEmitNeverEmits(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := randomGraph(rt)
		out, err := EmitIdeas(g)
		if err != nil {
			rt.Fatalf("emit error: %v", err)
		}
		for _, idea := range out {
			// No emitted Proposes may be journey/view (they are not in ideas.ProposesKinds() anyway) —
			// assert that every emitted proposes is a real ProposesKind.
			ok := false
			for _, k := range ideas.ProposesKinds() {
				if idea.Proposes == k {
					ok = true
					break
				}
			}
			if !ok {
				rt.Fatalf("emitted Idea proposes %q which is not a closed ProposesKind", idea.Proposes)
			}
		}
	})
}

// Property: the emission count matches the count authority EmitCount (no drift between the two).
func TestEmitIdeas_CountMatchesAuthority(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := randomGraph(rt)
		out, err := EmitIdeas(g)
		if err != nil {
			rt.Fatalf("emit error: %v", err)
		}
		if len(out) != EmitCount(g) {
			rt.Fatalf("len(EmitIdeas)=%d != EmitCount=%d", len(out), EmitCount(g))
		}
	})
}

// Property: every emitted Idea carries NO version and NO mirror key in its canonical body (the wall —
// the double absence is by construction; this pins it on the projected output).
func TestEmitIdeas_NoMirrorNoVersion(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		g := randomGraph(rt)
		out, err := EmitIdeas(g)
		if err != nil {
			rt.Fatalf("emit error: %v", err)
		}
		for _, idea := range out {
			b, err := ideas.Canonicalize(idea)
			if err != nil {
				rt.Fatalf("canonicalize: %v", err)
			}
			var m map[string]any
			if err := json.Unmarshal(b, &m); err != nil {
				rt.Fatalf("unmarshal: %v", err)
			}
			if _, ok := m["mirror"]; ok {
				rt.Fatalf("emitted Idea carries a mirror key: %s", b)
			}
			if _, ok := m["version"]; ok {
				rt.Fatalf("emitted Idea carries a version key: %s", b)
			}
		}
	})
}
