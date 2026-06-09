package conscience

import (
	"bytes"
	"math/rand"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
	"pgregory.net/rapid"
)

// allFacetsGen draws any of the eight facets (so the soft X path is exercised too).
func allFacetsGen() *rapid.Generator[facets.Facet] {
	all := facets.Facets()
	return rapid.Custom(func(t *rapid.T) facets.Facet {
		return all[rapid.IntRange(0, len(all)-1).Draw(t, "facetIdx")]
	})
}

func sourceGen() *rapid.Generator[Source] {
	return rapid.Custom(func(t *rapid.T) Source {
		return sourceOrder[rapid.IntRange(0, len(sourceOrder)-1).Draw(t, "srcIdx")]
	})
}

func verdictGen() *rapid.Generator[Verdict] {
	vs := []Verdict{VerdictGreen, VerdictRed, VerdictAdvisory}
	return rapid.Custom(func(t *rapid.T) Verdict {
		return vs[rapid.IntRange(0, len(vs)-1).Draw(t, "vIdx")]
	})
}

// sourcedVerdictGen draws an arbitrary sourced verdict.
func sourcedVerdictGen() *rapid.Generator[SourcedVerdict] {
	return rapid.Custom(func(t *rapid.T) SourcedVerdict {
		return SourcedVerdict{
			Source:  sourceGen().Draw(t, "source"),
			Facet:   allFacetsGen().Draw(t, "facet"),
			Pair:    rapid.StringMatching(`[a-z0-9-]{1,8}`).Draw(t, "pair"),
			Verdict: verdictGen().Draw(t, "verdict"),
			Detail:  rapid.StringMatching(`[a-z ]{0,12}`).Draw(t, "detail"),
		}
	})
}

// skeletonGen draws an arbitrary FK08 facet skeleton (random declared/proven per rung per column).
func skeletonGen() *rapid.Generator[*facetwire.SkeletonReport] {
	return rapid.Custom(func(t *rapid.T) *facetwire.SkeletonReport {
		var cols []facetwire.Column
		for _, f := range facetwire.NonFunctionalColumns() {
			if !rapid.Bool().Draw(t, "instantiate") {
				continue
			}
			var rungs []facetwire.RungState
			for _, r := range facetwire.Rungs() {
				rungs = append(rungs, facetwire.RungState{
					Rung:     r,
					Declared: rapid.Bool().Draw(t, "declared"),
					Proven:   rapid.Bool().Draw(t, "proven"),
				})
			}
			cols = append(cols, facetwire.Column{KernelID: "k", Facet: f, Rungs: rungs})
		}
		rep := facetwire.WireSkeleton(facetwire.Skeleton{KernelID: "k", Columns: cols})
		return &rep
	})
}

func inputGen() *rapid.Generator[Input] {
	return rapid.Custom(func(t *rapid.T) Input {
		n := rapid.IntRange(0, 6).Draw(t, "nVerdicts")
		vs := make([]SourcedVerdict, 0, n)
		for i := 0; i < n; i++ {
			vs = append(vs, sourcedVerdictGen().Draw(t, "sv"))
		}
		in := Input{KernelID: "k", Verdicts: vs}
		if rapid.Bool().Draw(t, "withSkeleton") {
			in.Skeleton = skeletonGen().Draw(t, "skeleton")
		}
		return in
	})
}

// TestProp_Reconcile_Deterministic: same input verdicts ⇒ same report (byte-identical) — the
// FK09 done-criterion ("mêmes verdicts d'entrée → même rapport") and the reproducibility mirror.
func TestProp_Reconcile_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := inputGen().Draw(t, "in")
		a := Reconcile(in)
		b := Reconcile(in)
		if a.Verdict != b.Verdict {
			t.Fatalf("non-deterministic verdict: %s vs %s", a.Verdict, b.Verdict)
		}
		if a.Hash != b.Hash || !bytes.Equal(a.Bytes, b.Bytes) {
			t.Fatalf("non-deterministic report bytes/hash")
		}
		if len(a.Cards) != len(b.Cards) {
			t.Fatalf("non-deterministic card count")
		}
		for i := range a.Cards {
			if a.Cards[i].ID != b.Cards[i].ID || a.Cards[i].Recommendation != b.Cards[i].Recommendation {
				t.Fatalf("card %d differs across runs", i)
			}
		}
	})
}

// shuffleVerdicts returns the input with its extra verdicts reordered.
func shuffleVerdicts(in Input, seed int64) Input {
	out := in
	out.Verdicts = make([]SourcedVerdict, len(in.Verdicts))
	copy(out.Verdicts, in.Verdicts)
	rng := rand.New(rand.NewSource(seed))
	rng.Shuffle(len(out.Verdicts), func(i, j int) { out.Verdicts[i], out.Verdicts[j] = out.Verdicts[j], out.Verdicts[i] })
	return out
}

// TestProp_Reconcile_InvariantUnderInputOrder: the report is invariant under reordering the input
// verdicts (the conscience sorts canonically — order-independent, the byte-identity property).
func TestProp_Reconcile_InvariantUnderInputOrder(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := inputGen().Draw(t, "in")
		seed := rapid.Int64().Draw(t, "seed")
		a := Reconcile(in)
		b := Reconcile(shuffleVerdicts(in, seed))
		if a.Hash != b.Hash {
			t.Fatalf("report not invariant under input reordering: %s vs %s", a.Hash, b.Hash)
		}
	})
}

// TestProp_ReportIsSourcedOnly: every pair in the report carries a KNOWN source — the conscience
// adds no judgment of its own (FKE-6.3: the report contains only sourced verdicts, no new judge).
func TestProp_ReportIsSourcedOnly(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := inputGen().Draw(t, "in")
		rep := Reconcile(in)
		for _, p := range rep.Pairs {
			if _, ok := knownSources[p.Source]; !ok {
				t.Fatalf("a report pair carries an unknown source %q — the conscience invented a verdict", p.Source)
			}
		}
		// Every card is backed by a known source too (a card is never conjured).
		for _, c := range rep.Cards {
			if _, ok := knownSources[c.Source]; !ok {
				t.Fatalf("a card carries an unknown source %q", c.Source)
			}
		}
	})
}

// TestProp_XNeverDrifts: the SOFT facet X NEVER flips the overall verdict (§13.6). A report whose
// ONLY divergences are on X stays aligned; an X verdict is never a hard red.
func TestProp_XNeverDrifts(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Build an input whose every verdict is on the soft X facet.
		n := rapid.IntRange(1, 5).Draw(t, "n")
		var vs []SourcedVerdict
		for i := 0; i < n; i++ {
			vs = append(vs, SourcedVerdict{
				Source:  sourceGen().Draw(t, "src"),
				Facet:   facets.FacetExperience,
				Pair:    rapid.StringMatching(`[a-z]{1,4}`).Draw(t, "pair"),
				Verdict: verdictGen().Draw(t, "verdict"),
			})
		}
		rep := Reconcile(Input{KernelID: "k", Verdicts: vs})
		if rep.Verdict != "aligned" {
			t.Fatalf("X-only divergences must stay aligned (X never blocks), got %q", rep.Verdict)
		}
		for _, p := range rep.Pairs {
			if p.Facet == facets.FacetExperience && p.Verdict == VerdictRed {
				t.Fatal("an X pair must never be a hard red (§13.6)")
			}
		}
	})
}

// TestProp_DivergenceProducesCard: every red OR advisory pair produces exactly one card, and a
// green pair produces none (FKE-6.3/FKE-31 — a divergence, and only a divergence, yields a card).
func TestProp_DivergenceProducesCard(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := inputGen().Draw(t, "in")
		rep := Reconcile(in)
		divergent := 0
		for _, p := range rep.Pairs {
			if p.Verdict == VerdictRed || p.Verdict == VerdictAdvisory {
				divergent++
			}
		}
		if len(rep.Cards) != divergent {
			t.Fatalf("expected one card per divergence: %d divergences, %d cards", divergent, len(rep.Cards))
		}
	})
}
