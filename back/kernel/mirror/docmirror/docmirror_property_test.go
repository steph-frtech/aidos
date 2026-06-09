package docmirror

import (
	"bytes"
	"math/rand"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// TestCompare_SamePairSameVerdict is the load-bearing reproducibility mirror (FK07
// done-criterion « même paire → même verdict »): Compare is a PURE function — the same
// (human, s9) pair always yields the same Verdict, the same Hash, and byte-identical
// Bytes, AND the verdict is INVARIANT under reordering of either side's input sets (the
// comparator canonicalizes; it never echoes the caller's slice order).
func TestCompare_SamePairSameVerdict(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		human := drawHuman(t)
		derived := drawS9(t, human.KernelID)

		want := Compare(human, derived)

		// Determinism: re-running the same pair gives byte-identical results.
		got := Compare(human, derived)
		if got.Verdict != want.Verdict {
			t.Fatalf("verdict not deterministic: %q vs %q", got.Verdict, want.Verdict)
		}
		if got.Hash != want.Hash {
			t.Fatalf("hash not deterministic: %q vs %q", got.Hash, want.Hash)
		}
		if !bytes.Equal(got.Bytes, want.Bytes) {
			t.Fatalf("bytes not deterministic")
		}

		// Reordering invariance: shuffle both sides; the verdict + hash are unchanged.
		shuffled := Compare(shuffleHuman(t, human), shuffleS9(t, derived))
		if shuffled.Verdict != want.Verdict {
			t.Fatalf("verdict leaked input order: %q vs %q", shuffled.Verdict, want.Verdict)
		}
		if shuffled.Hash != want.Hash {
			t.Fatalf("hash leaked input order: %q vs %q", shuffled.Hash, want.Hash)
		}
	})
}

// TestCompare_ProseNeverBlocks proves the advisory rule (§8, the LLM signals, never
// arbitrates): changing ONLY the prose of behaviours present on both sides never changes
// the structural verdict — it only produces advisories. The structural plane is the judge.
func TestCompare_ProseNeverBlocks(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Build a STRUCTURALLY-IDENTICAL pair (human concepts/errors == derived; behaviour
		// IDs identical) so the structural verdict is green by construction.
		s9 := drawS9(t, "k-prose")
		human := HumanDoc{
			KernelID:  "k-prose",
			Concepts:  append([]string(nil), s9.Concepts...),
			Errors:    append([]string(nil), s9.Errors...),
			Behaviors: make([]derivedoc.Behavior, len(s9.Behaviors)),
		}
		// Same IDs, possibly different prose (drawn freely).
		for i, b := range s9.Behaviors {
			human.Behaviors[i] = derivedoc.Behavior{
				ID:          b.ID,
				Description: rapid.StringMatching(`[a-z ]{0,12}`).Draw(t, "prose"),
			}
		}

		rep := Compare(human, s9)
		if !rep.Green() {
			t.Fatalf("prose-only difference blocked the verdict: %+v", rep.StructuralDivergences)
		}
		if len(rep.StructuralDivergences) != 0 {
			t.Fatalf("prose drift leaked into structural plane: %+v", rep.StructuralDivergences)
		}
		// Every prose advisory must be on the prose plane, never structural.
		for _, d := range rep.ProseAdvisories {
			if d.Plane != PlaneProse {
				t.Fatalf("advisory on wrong plane: %+v", d)
			}
		}
	})
}

// TestCompare_StructuralDivergenceIsRed proves the blocking rule: a concept/behaviour/error
// present on exactly one side ALWAYS makes the verdict red (the doc-mirror is a hard
// cliquet on structure). Generated against an otherwise-identical pair.
func TestCompare_StructuralDivergenceIsRed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s9 := drawS9(t, "k-struct")
		// Inject one extra concept on the human side only (code_missing) — structural.
		extra := "operation:" + rapid.StringMatching(`Z[a-z]{1,6}`).Draw(t, "extra")
		human := HumanDoc{
			KernelID:  "k-struct",
			Concepts:  append(append([]string(nil), s9.Concepts...), extra),
			Errors:    append([]string(nil), s9.Errors...),
			Behaviors: append([]derivedoc.Behavior(nil), s9.Behaviors...),
		}
		rep := Compare(human, s9)
		if rep.Green() {
			t.Fatalf("structural divergence did not turn the verdict red")
		}
		found := false
		for _, d := range rep.StructuralDivergences {
			if d.Key == extra && d.Side == SideCodeMissing && d.Section == SectionConcepts {
				found = true
			}
		}
		if !found {
			t.Fatalf("the injected divergence was not reported: %+v", rep.StructuralDivergences)
		}
	})
}

// --- generators ------------------------------------------------------------------------

func drawHuman(t *rapid.T) HumanDoc {
	id := rapid.SampledFrom([]string{"k1", "k2", "k3"}).Draw(t, "kernel_id")
	return HumanDoc{
		KernelID:  id,
		Concepts:  drawTerms(t, "concepts"),
		Errors:    drawTerms(t, "errors"),
		Behaviors: drawBehaviors(t, "human_beh"),
	}
}

func drawS9(t *rapid.T, id string) derivedoc.S9 {
	return derivedoc.S9{
		KernelID:  id,
		Concepts:  drawTerms(t, "s9_concepts"),
		Errors:    drawTerms(t, "s9_errors"),
		Behaviors: drawBehaviors(t, "s9_beh"),
	}
}

func drawTerms(t *rapid.T, label string) []string {
	return rapid.SliceOfNDistinct(
		rapid.StringMatching(`(operation|entity|event):[a-z]{1,5}`),
		0, 5,
		func(s string) string { return s },
	).Draw(t, label)
}

func drawBehaviors(t *rapid.T, label string) []derivedoc.Behavior {
	ids := rapid.SliceOfNDistinct(
		rapid.StringMatching(`operation:[a-z]{1,5}`),
		0, 4,
		func(s string) string { return s },
	).Draw(t, label+"_ids")
	out := make([]derivedoc.Behavior, len(ids))
	for i, id := range ids {
		out[i] = derivedoc.Behavior{ID: id, Description: rapid.StringMatching(`[a-z]{0,8}`).Draw(t, label+"_desc")}
	}
	return out
}

func shuffleHuman(t *rapid.T, h HumanDoc) HumanDoc {
	seed := rapid.Int64().Draw(t, "shuffle_seed")
	r := rand.New(rand.NewSource(seed))
	out := HumanDoc{KernelID: h.KernelID}
	out.Concepts = shuffleStrings(r, h.Concepts)
	out.Errors = shuffleStrings(r, h.Errors)
	out.Behaviors = shuffleBeh(r, h.Behaviors)
	return out
}

func shuffleS9(t *rapid.T, s derivedoc.S9) derivedoc.S9 {
	seed := rapid.Int64().Draw(t, "shuffle_seed_s9")
	r := rand.New(rand.NewSource(seed))
	return derivedoc.S9{
		KernelID:  s.KernelID,
		Concepts:  shuffleStrings(r, s.Concepts),
		Errors:    shuffleStrings(r, s.Errors),
		Behaviors: shuffleBeh(r, s.Behaviors),
	}
}

func shuffleStrings(r *rand.Rand, xs []string) []string {
	out := append([]string(nil), xs...)
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}

func shuffleBeh(r *rand.Rand, xs []derivedoc.Behavior) []derivedoc.Behavior {
	out := append([]derivedoc.Behavior(nil), xs...)
	r.Shuffle(len(out), func(i, j int) { out[i], out[j] = out[j], out[i] })
	return out
}
