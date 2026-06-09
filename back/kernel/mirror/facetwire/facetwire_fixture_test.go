package facetwire

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
)

// fullColumn builds a facet column whose six rungs are ALL declared AND all proven — the green
// baseline the fault-injection fixtures perturb (one broken pair per facet).
func fullColumn(f facets.Facet) Column {
	rungs := make([]RungState, 0, len(Rungs()))
	for _, r := range Rungs() {
		rungs = append(rungs, RungState{Rung: r, Declared: true, Proven: true})
	}
	return Column{KernelID: "checkout", Facet: f, Rungs: rungs}
}

// breakPair turns OFF the Proven flag of one rung — the named fault-injection: a declared pair
// that is no longer proven (the sensor went red / disappeared).
func breakPair(col Column, rung Rung) Column {
	out := Column{KernelID: col.KernelID, Facet: col.Facet}
	out.Rungs = make([]RungState, len(col.Rungs))
	copy(out.Rungs, col.Rungs)
	for i := range out.Rungs {
		if out.Rungs[i].Rung == rung {
			out.Rungs[i].Proven = false
		}
	}
	return out
}

// fullSkeleton builds a kernel that instantiates all five non-functional columns, each green.
func fullSkeleton() Skeleton {
	var cols []Column
	for _, f := range NonFunctionalColumns() {
		cols = append(cols, fullColumn(f))
	}
	return Skeleton{KernelID: "checkout", Columns: cols}
}

// TestSkeleton_AllAlignedIsGreen: every facet column fully declared+proven → the whole skeleton
// is green (the baseline). The byte-identity surface carries a hash even when green.
func TestSkeleton_AllAlignedIsGreen(t *testing.T) {
	rep := WireSkeleton(fullSkeleton())
	if !rep.Green() {
		t.Fatalf("an aligned skeleton must be green, got %s: %+v", rep.Verdict, rep.Columns)
	}
	if rep.Hash == "" {
		t.Fatal("a green skeleton report must carry a content hash")
	}
	if len(rep.Columns) != len(NonFunctionalColumns()) {
		t.Fatalf("expected %d columns, got %d", len(NonFunctionalColumns()), len(rep.Columns))
	}
}

// TestColumn_BreakPairRedensThatColumn is the headline FK08 done-criterion (« par facette,
// fault-injection — casser une paire rougit la bonne colonne »): for EACH hard facet (S/R/V/M),
// breaking one pair turns THAT column red with a PairBroken divergence on the right rung — and
// no other column is affected (orthogonality, FKE-1.4).
func TestColumn_BreakPairRedensThatColumn(t *testing.T) {
	hard := []facets.Facet{
		facets.FacetSecurity,
		facets.FacetReliability,
		facets.FacetEvolvability,
		facets.FacetMaintainability,
	}
	for _, f := range hard {
		broken := breakPair(fullColumn(f), RungEvidence) // break the sensor verdict rung.
		cr := WireColumn(broken)
		if cr.Green() {
			t.Fatalf("facet %s: breaking the evidence pair must redden the column", f)
		}
		found := false
		for _, d := range cr.Divergences {
			if d.Rung == RungEvidence && d.Kind == PairBroken && d.Facet == f {
				found = true
			}
		}
		if !found {
			t.Fatalf("facet %s: the broken pair was not reported as pair_broken on the evidence rung: %+v", f, cr.Divergences)
		}
		if cr.Advisory() {
			t.Fatalf("facet %s: a hard facet divergence must NOT be advisory", f)
		}
	}
}

// TestSkeleton_BreakOneColumnLeavesOthersGreen proves ORTHOGONALITY (FKE-1.4): breaking the S
// column reddens the skeleton but does NOT redden the R/V/M columns — the facets do not interact.
func TestSkeleton_BreakOneColumnLeavesOthersGreen(t *testing.T) {
	sk := fullSkeleton()
	// Break a pair in the SECURITY column only.
	for i := range sk.Columns {
		if sk.Columns[i].Facet == facets.FacetSecurity {
			sk.Columns[i] = breakPair(sk.Columns[i], RungContract)
		}
	}
	rep := WireSkeleton(sk)
	if rep.Green() {
		t.Fatal("breaking the S column must redden the overall skeleton")
	}
	for _, cr := range rep.Columns {
		switch cr.Facet {
		case facets.FacetSecurity:
			if cr.Green() {
				t.Fatal("the S column must be red")
			}
		case facets.FacetExperience:
			// soft, always green — checked elsewhere.
		default:
			if !cr.Green() {
				t.Fatalf("column %s must stay green (orthogonality): %+v", cr.Facet, cr.Divergences)
			}
		}
	}
}

// TestColumn_XStaysAdvisory is the load-bearing X asymmetry (« X reste advisory — ne cliquette
// pas dur »): breaking a pair in the experience column produces an ADVISORY divergence and the
// column stays GREEN; the overall skeleton verdict is NOT flipped by X.
func TestColumn_XStaysAdvisory(t *testing.T) {
	broken := breakPair(fullColumn(facets.FacetExperience), RungEvidence)
	cr := WireColumn(broken)
	if !cr.Green() {
		t.Fatalf("the soft X column must NEVER turn red — it informs, never blocks: %+v", cr.Divergences)
	}
	if len(cr.Advisories) == 0 {
		t.Fatal("the X column must SURFACE the broken pair as an advisory")
	}
	found := false
	for _, d := range cr.Advisories {
		if d.Rung == RungEvidence && d.Kind == PairBroken && d.Advisory {
			found = true
		}
	}
	if !found {
		t.Fatalf("the X advisory should carry the broken evidence pair: %+v", cr.Advisories)
	}

	// And a SKELETON whose ONLY broken column is X stays GREEN overall (X never clicks hard).
	sk := fullSkeleton()
	for i := range sk.Columns {
		if sk.Columns[i].Facet == facets.FacetExperience {
			sk.Columns[i] = breakPair(sk.Columns[i], RungScenarios)
		}
	}
	rep := WireSkeleton(sk)
	if !rep.Green() {
		t.Fatalf("a skeleton whose only broken column is the soft X must stay green: %s", rep.Verdict)
	}
}

// TestColumn_ProvenButUndeclaredIsStructural: the symmetric set-difference — a rung proven but
// never declared is a structural PairUndeclared divergence (red for a hard facet).
func TestColumn_ProvenButUndeclaredIsStructural(t *testing.T) {
	col := Column{KernelID: "checkout", Facet: facets.FacetReliability, Rungs: []RungState{
		{Rung: RungSpec, Declared: true, Proven: true},
		{Rung: RungEvidence, Declared: false, Proven: true}, // proven without being declared.
	}}
	cr := WireColumn(col)
	if cr.Green() {
		t.Fatal("a proven-but-undeclared rung is a structural divergence (red for a hard facet)")
	}
	found := false
	for _, d := range cr.Divergences {
		if d.Rung == RungEvidence && d.Kind == PairUndeclared {
			found = true
		}
	}
	if !found {
		t.Fatalf("the undeclared rung was not reported: %+v", cr.Divergences)
	}
}

// TestColumn_EachFacetReusesAnExistingSensor: every non-functional column names the EXISTING
// sensor it reuses (ADR 0007) — no facet invents a new judge.
func TestColumn_EachFacetReusesAnExistingSensor(t *testing.T) {
	for _, f := range NonFunctionalColumns() {
		cr := WireColumn(fullColumn(f))
		if cr.Sensor == "" {
			t.Fatalf("facet %s must reuse a named existing sensor", f)
		}
	}
}

// TestSkeleton_Empty: a kernel that instantiates no non-functional column is green (the totality
// guard — collapsed legal kernel).
func TestSkeleton_Empty(t *testing.T) {
	rep := WireSkeleton(Skeleton{KernelID: "pure-fn"})
	if !rep.Green() {
		t.Fatalf("a kernel with no non-functional columns must be green: %+v", rep.Columns)
	}
}
