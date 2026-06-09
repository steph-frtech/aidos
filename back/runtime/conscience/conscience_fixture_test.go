package conscience

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
)

// alignedSkeleton builds the FK08 facet skeleton for a kernel whose five non-functional columns
// are all green — the conscience's aligned baseline.
func alignedSkeleton() *facetwire.SkeletonReport {
	var cols []facetwire.Column
	for _, f := range facetwire.NonFunctionalColumns() {
		rungs := make([]facetwire.RungState, 0, 6)
		for _, r := range facetwire.Rungs() {
			rungs = append(rungs, facetwire.RungState{Rung: r, Declared: true, Proven: true})
		}
		cols = append(cols, facetwire.Column{KernelID: "checkout", Facet: f, Rungs: rungs})
	}
	rep := facetwire.WireSkeleton(facetwire.Skeleton{KernelID: "checkout", Columns: cols})
	return &rep
}

// brokenSkeleton breaks the 6-evidence pair of one facet column (a hard column reddens; X stays
// advisory) — the fault-injection the conscience must surface as a red/advisory facet pair.
func brokenSkeleton(broken facets.Facet) *facetwire.SkeletonReport {
	var cols []facetwire.Column
	for _, f := range facetwire.NonFunctionalColumns() {
		rungs := make([]facetwire.RungState, 0, 6)
		for _, r := range facetwire.Rungs() {
			proven := true
			if f == broken && r == facetwire.RungEvidence {
				proven = false // break the sensor verdict rung of the targeted column.
			}
			rungs = append(rungs, facetwire.RungState{Rung: r, Declared: true, Proven: proven})
		}
		cols = append(cols, facetwire.Column{KernelID: "checkout", Facet: f, Rungs: rungs})
	}
	rep := facetwire.WireSkeleton(facetwire.Skeleton{KernelID: "checkout", Columns: cols})
	return &rep
}

// TestReconcile_AllAlignedNoCard: every sourced verdict green ⇒ the report is aligned and emits
// NO decision card (an aligned kernel needs no decision).
func TestReconcile_AllAlignedNoCard(t *testing.T) {
	in := Input{
		KernelID: "checkout",
		Skeleton: alignedSkeleton(),
		Verdicts: []SourcedVerdict{
			{Source: SourceRunner, Facet: facets.FacetFunctional, Pair: "s2↔s9", Verdict: VerdictGreen},
			{Source: SourceCompleteness, Facet: facets.FacetFunctional, Pair: "completeness", Verdict: VerdictGreen},
		},
	}
	rep := Reconcile(in)
	if !rep.Aligned() {
		t.Fatalf("all-green input must be aligned, got %q", rep.Verdict)
	}
	if len(rep.Cards) != 0 {
		t.Fatalf("an aligned kernel emits no decision card, got %d", len(rep.Cards))
	}
	if rep.Hash == "" {
		t.Fatal("the report must carry a content hash")
	}
	if rep.Red != 0 || rep.Advisory != 0 {
		t.Fatalf("aligned report should have 0 red/advisory, got red=%d advisory=%d", rep.Red, rep.Advisory)
	}
}

// TestReconcile_DivergenceProducesCard is the e2e/fixture done-criterion (FKE-6.3 / FKE-31): ONE
// divergence (a runner red on the functional pair) produces ITS actionable decision card.
func TestReconcile_DivergenceProducesCard(t *testing.T) {
	in := Input{
		KernelID: "checkout",
		Skeleton: alignedSkeleton(),
		Verdicts: []SourcedVerdict{
			{
				Source: SourceRunner, Facet: facets.FacetFunctional, Pair: "s2↔s9",
				Verdict: VerdictRed, Drift: DriftSemantic, Detail: "le code accepte 31 jours ; le contrat dit 30",
				Blast: BlastMedium,
			},
		},
	}
	rep := Reconcile(in)
	if rep.Aligned() {
		t.Fatal("a red runner verdict must make the kernel drift, not aligned")
	}
	if len(rep.Cards) != 1 {
		t.Fatalf("one divergence must produce exactly one decision card, got %d", len(rep.Cards))
	}
	c := rep.Cards[0]
	if c.ID == "" {
		t.Fatal("the card must carry a content-addressed ID")
	}
	if c.Source != SourceRunner || c.Drift != DriftSemantic {
		t.Fatalf("the card must be sourced from the divergent verdict, got source=%q drift=%q", c.Source, c.Drift)
	}
	if c.Detail != "le code accepte 31 jours ; le contrat dit 30" {
		t.Fatalf("the card must carry the observed gap verbatim, got %q", c.Detail)
	}
	if len(c.Options) == 0 || c.Recommendation == "" {
		t.Fatal("the card must carry routing options + a recommendation (FKE-31)")
	}
	if c.Advisory {
		t.Fatal("a hard divergence card must not be advisory")
	}
}

// TestReconcile_OnlySourcedVerdicts proves the anti-fabrication rule (FKE-6.3): the conscience
// composes ONLY sourced verdicts — an unknown source is dropped, never invented into the report.
func TestReconcile_OnlySourcedVerdicts(t *testing.T) {
	in := Input{
		KernelID: "checkout",
		Verdicts: []SourcedVerdict{
			{Source: Source("made_up_judge"), Facet: facets.FacetFunctional, Pair: "x", Verdict: VerdictRed},
			{Source: SourceLedger, Facet: facets.FacetFunctional, Pair: "audit", Verdict: VerdictGreen},
		},
	}
	rep := Reconcile(in)
	for _, p := range rep.Pairs {
		if p.Source == Source("made_up_judge") {
			t.Fatal("a verdict from an unknown source must be dropped (the conscience composes only sourced verdicts)")
		}
	}
	if len(rep.Pairs) != 1 {
		t.Fatalf("only the sourced (ledger) verdict survives, got %d pairs", len(rep.Pairs))
	}
}

// TestReconcile_FacetBreakReddensFromSkeleton: a HARD facet column broken in the FK08 skeleton is
// composed as a red facet pair + a security card; the overall verdict drifts.
func TestReconcile_FacetBreakReddensFromSkeleton(t *testing.T) {
	in := Input{KernelID: "checkout", Skeleton: brokenSkeleton(facets.FacetSecurity)}
	rep := Reconcile(in)
	if rep.Aligned() {
		t.Fatal("breaking a hard facet pair must drift the kernel")
	}
	// find the S facet red pair + its card.
	var redS bool
	for _, p := range rep.Pairs {
		if p.Source == SourceFacet && p.Facet == facets.FacetSecurity && p.Verdict == VerdictRed {
			redS = true
		}
	}
	if !redS {
		t.Fatalf("the broken S column must surface a red facet pair: %+v", rep.Pairs)
	}
	var secCard bool
	for _, c := range rep.Cards {
		if c.Facet == facets.FacetSecurity && c.Drift == DriftSecurity {
			secCard = true
			if c.Recommendation != OptBlock {
				t.Fatalf("a security drift card recommends block by default, got %q", c.Recommendation)
			}
		}
	}
	if !secCard {
		t.Fatal("the broken S column must produce a security decision card")
	}
}

// TestReconcile_XAdvisoryNeverBlocks proves the SOFT regime (§13.6): breaking the X facet column
// produces an ADVISORY card and the kernel STAYS aligned — X informs, never clicks the ratchet.
func TestReconcile_XAdvisoryNeverBlocks(t *testing.T) {
	in := Input{KernelID: "checkout", Skeleton: brokenSkeleton(facets.FacetExperience)}
	rep := Reconcile(in)
	if !rep.Aligned() {
		t.Fatalf("a broken SOFT X column must NOT drift the kernel (X never blocks), got %q", rep.Verdict)
	}
	var advCard bool
	for _, c := range rep.Cards {
		if c.Facet == facets.FacetExperience {
			advCard = true
			if !c.Advisory {
				t.Fatal("an X divergence card must be advisory")
			}
			if c.Recommendation == OptBlock {
				t.Fatal("an advisory card must never recommend block")
			}
		}
	}
	if !advCard {
		t.Fatal("the broken X column must surface an advisory card")
	}
	if rep.Advisory == 0 {
		t.Fatal("the advisory tally must count the X divergence")
	}
}

// TestReconcile_SourcedRedOnXDowngradedToAdvisory: a caller handing a RED verdict on the soft
// facet X is downgraded to advisory (§13.6 — X never clicks hard, even via an extra sourced verdict).
func TestReconcile_SourcedRedOnXDowngradedToAdvisory(t *testing.T) {
	in := Input{
		KernelID: "checkout",
		Verdicts: []SourcedVerdict{
			{Source: SourceSensor, Facet: facets.FacetExperience, Pair: "x-claim", Verdict: VerdictRed, Detail: "ux claim unmet"},
		},
	}
	rep := Reconcile(in)
	if !rep.Aligned() {
		t.Fatal("a red on the soft X facet must not drift the kernel")
	}
	if len(rep.Pairs) != 1 || rep.Pairs[0].Verdict != VerdictAdvisory {
		t.Fatalf("a red on X must be downgraded to advisory, got %+v", rep.Pairs)
	}
}

// TestReconcile_EmptyKernelAligned: a kernel with no skeleton and no verdicts is aligned with no
// cards (the conscience invents nothing — empty in, empty/aligned out).
func TestReconcile_EmptyKernelAligned(t *testing.T) {
	rep := Reconcile(Input{KernelID: "empty"})
	if !rep.Aligned() {
		t.Fatalf("an empty kernel is aligned, got %q", rep.Verdict)
	}
	if len(rep.Pairs) != 0 || len(rep.Cards) != 0 {
		t.Fatalf("an empty kernel has no pairs/cards, got %d pairs %d cards", len(rep.Pairs), len(rep.Cards))
	}
	if rep.Hash == "" {
		t.Fatal("even an empty report carries a content hash")
	}
}

// TestReconcile_CardIDContentAddressed proves the card ID is content-addressed (same gap → same
// ID), never a sequence/clock — the determinism-first invariant on the card surface.
func TestReconcile_CardIDContentAddressed(t *testing.T) {
	mk := func() ConsciousnessReport {
		return Reconcile(Input{
			KernelID: "checkout",
			Verdicts: []SourcedVerdict{
				{Source: SourceRunner, Facet: facets.FacetFunctional, Pair: "s2↔s9", Verdict: VerdictRed, Drift: DriftSemantic, Detail: "31 vs 30"},
			},
		})
	}
	a, b := mk(), mk()
	if len(a.Cards) != 1 || len(b.Cards) != 1 {
		t.Fatalf("expected one card each, got %d/%d", len(a.Cards), len(b.Cards))
	}
	if a.Cards[0].ID != b.Cards[0].ID {
		t.Fatalf("same gap must yield same card ID, got %q vs %q", a.Cards[0].ID, b.Cards[0].ID)
	}
}
