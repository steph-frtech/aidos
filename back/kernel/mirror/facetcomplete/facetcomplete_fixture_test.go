package facetcomplete_test

// Fixture mirror for FK04 — the completeness law made FACET-AWARE (FKE-1.3 conséquence 5).
// reflects=kernel.mirror.facetcomplete, test_kind=fixture, cert_language=go-fixture,
// liveness=live, authority=below (a means-test over ComputeFacetCompleteness — CLAUDE.md §8).
//
// The cases ARE the FK04 done-criteria, written before the code (red→green):
//
//   - FAULT-INJECTION — retirer une paire d'une facette instanciée → MONSTRE détecté.
//   - un kernel EFFONDRÉ légal (F seul, sa paire vivante) PASSE (anti-explosion).
//   - aucun kernel conforme existant invalidé — ADDITIF (la verticale S06 inchangée).
//   - divergence : une paire DÉCLARÉE mais MORTE/non-exécutable = monstre (la preuve ne court pas).
//   - X (soft) : sa paire manquante est ADVISORY (informe, ne bloque jamais — §13.6).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetcomplete"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// livingMirror builds a LIVING mirror reflecting a layer @version, proving a given facet.
func livingMirror(id, layerID, version string, tk records.TestKind, cl records.CertLanguage, f facets.Facet) facetcomplete.FacetMirror {
	return facetcomplete.FacetMirror{
		Mirror: records.Mirror{
			MirrorID:     id,
			Reflects:     records.LayerRef{LayerID: layerID, Version: version},
			TestKind:     tk,
			CertLanguage: cl,
			Authority:    records.AuthorityAbove,
			Liveness:     records.LivenessAlive,
		},
		Facet: f,
	}
}

// inst declares an instantiated facet (intent present).
func inst(f facets.Facet) facets.Instance {
	return facets.Instance{Facet: f, HasIntent: true, HasProofPair: true}
}

// ── FAULT-INJECTION — remove a pair of an instantiated facet → monster ──

func TestFaultInjection_RemovingAFacetPairProducesAMonster(t *testing.T) {
	// A layer instantiating F + S. Both pairs living → COMPLETE.
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "op1", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetSecurity)}},
	}
	full := []facetcomplete.FacetMirror{
		livingMirror("m-f", "op1", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
		livingMirror("m-s", "op1", "v1", records.TestKindProperty, records.CertRapid, facets.FacetSecurity),
	}
	if got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, full); got.Verdict != facetcomplete.VerdictComplete {
		t.Fatalf("with both pairs living, want COMPLETE, got %s (%+v)", got.Verdict, got)
	}

	// FAULT: remove the SECURITY pair (drop m-s) → the S facet has no living mirror = monster.
	injured := []facetcomplete.FacetMirror{full[0]}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, injured)
	if got.Verdict != facetcomplete.VerdictRedMonster {
		t.Fatalf("after removing the S pair, want RED_MONSTER, got %s", got.Verdict)
	}
	if len(got.Facet) != 1 {
		t.Fatalf("want exactly 1 facet monster, got %d (%+v)", len(got.Facet), got.Facet)
	}
	m := got.Facet[0]
	if m.Reason != facetcomplete.ReasonNoFacetPair || m.Facet != facets.FacetSecurity || m.LayerID != "op1" {
		t.Fatalf("monster mis-identified: %+v", m)
	}
	if m.Advisory {
		t.Fatalf("S is a HARD facet, its missing pair must not be advisory")
	}
}

// ── COLLAPSED legal kernel — F alone, its pair living → PASSES ──

func TestCollapsedKernel_FunctionalOnlyWithLivingPair_Passes(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "sort", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional)}},
	}
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "sort", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictComplete {
		t.Fatalf("a collapsed kernel (F only, pair living) must PASS, got %s (%+v)", got.Verdict, got)
	}
	if len(got.Facet) != 0 {
		t.Fatalf("a collapsed legal kernel must produce no facet monster, got %+v", got.Facet)
	}
}

// FK04 NEVER demands a pair for a facet the kernel did NOT instantiate (symmetric error §13.4).
func TestCollapsedKernel_UndeclaredFacetsDemandNoPair(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "pure", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetInvariants)}},
	}
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "pure", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
		livingMirror("m-i", "pure", "v1", records.TestKindProperty, records.CertRapid, facets.FacetInvariants),
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictComplete || len(got.Facet) != 0 {
		t.Fatalf("undeclared S/B/V/R must demand no pair; want COMPLETE+no monster, got %s %+v", got.Verdict, got.Facet)
	}
}

// ── ADDITIVE — the S06 test_kind plane is preserved, never weakened ──

func TestAdditive_S06TestKindMonsterStillSurfaces(t *testing.T) {
	// An operation kind REQUIRES a fixture test_kind (records.requiredTestKinds). Give it a
	// living F pair of the WRONG test_kind (property, not fixture) → S06 must still flag it.
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "op2", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional)}},
	}
	mirrors := []facetcomplete.FacetMirror{
		// F facet IS proven (so FK04's facet plane is happy) but the test_kind is property,
		// while operation requires fixture → S06 must still report a test_kind monster.
		livingMirror("m-f", "op2", "v1", records.TestKindProperty, records.CertRapid, facets.FacetFunctional),
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictRedMonster {
		t.Fatalf("the S06 test_kind law must still bite (additive), want RED_MONSTER, got %s", got.Verdict)
	}
	if len(got.TestKind) == 0 {
		t.Fatalf("the S06 test_kind monster must surface unchanged, got none")
	}
}

// A kernel S06 accepts AND whose facets are all proven stays accepted (no invalidation).
func TestAdditive_S06ConformantKernelNotInvalidated(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "op3", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional)}},
	}
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "op3", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictComplete {
		t.Fatalf("an S06-conformant kernel with its facets proven must stay COMPLETE, got %s (%+v)", got.Verdict, got)
	}
}

// ── DIVERGENCE — a declared pair that is DEAD / non-executable is a monster ──

func TestDivergence_DeadPairIsAMonster(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "op4", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetSecurity)}},
	}
	// The S pair NAMES the facet but is DEAD → divergent, does not count.
	dead := facetcomplete.FacetMirror{
		Mirror: records.Mirror{
			MirrorID:     "m-s-dead",
			Reflects:     records.LayerRef{LayerID: "op4", Version: "v1"},
			TestKind:     records.TestKindProperty,
			CertLanguage: records.CertRapid,
			Liveness:     records.LivenessDead, // ← divergent
		},
		Facet: facets.FacetSecurity,
	}
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "op4", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
		dead,
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictRedMonster || len(got.Facet) != 1 || got.Facet[0].Facet != facets.FacetSecurity {
		t.Fatalf("a divergent (dead) S pair must be a monster, got %s %+v", got.Verdict, got.Facet)
	}
}

// A non-EXECUTABLE pair (prose) also diverges (KRD §805 — the proof must run).
func TestDivergence_NonExecutablePairIsAMonster(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "op5", Version: "v1", Kind: "operation"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetBudgets)}},
	}
	prose := facetcomplete.FacetMirror{
		Mirror: records.Mirror{
			MirrorID:     "m-b-prose",
			Reflects:     records.LayerRef{LayerID: "op5", Version: "v1"},
			TestKind:     records.TestKindMeter,
			CertLanguage: records.CertProse, // ← not executable
			Liveness:     records.LivenessAlive,
		},
		Facet: facets.FacetBudgets,
	}
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "op5", "v1", records.TestKindFixture, records.CertFixture, facets.FacetFunctional),
		prose,
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictRedMonster || len(got.Facet) != 1 || got.Facet[0].Facet != facets.FacetBudgets {
		t.Fatalf("a non-executable (prose) B pair must be a monster, got %s %+v", got.Verdict, got.Facet)
	}
}

// ── SOFT X — a missing experience pair is ADVISORY, never a hard block ──

func TestSoftX_MissingExperiencePairIsAdvisoryNotBlocking(t *testing.T) {
	layer := facetcomplete.FacetLayer{
		Layer:  records.Layer{LayerID: "view1", Version: "v1", Kind: "view"},
		Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetExperience)}},
	}
	// F proven, X NOT proven → X is advisory, the verdict stays COMPLETE.
	mirrors := []facetcomplete.FacetMirror{
		livingMirror("m-f", "view1", "v1", records.TestKindE2E, records.CertGherkin, facets.FacetFunctional),
	}
	got := facetcomplete.ComputeFacetCompleteness([]facetcomplete.FacetLayer{layer}, mirrors)
	if got.Verdict != facetcomplete.VerdictComplete {
		t.Fatalf("a missing X pair must NOT hard-block (soft §13.6), got %s", got.Verdict)
	}
	if len(got.Facet) != 0 {
		t.Fatalf("the X miss must not be a HARD facet monster, got %+v", got.Facet)
	}
	if len(got.Advisory) != 1 || got.Advisory[0].Facet != facets.FacetExperience || !got.Advisory[0].Advisory {
		t.Fatalf("the X miss must surface as an advisory finding, got %+v", got.Advisory)
	}
}

// ── DETERMINISM — same cut ⇒ identical Result (sorted) ──

func TestDeterminism_SameCutSameMonsterOrder(t *testing.T) {
	layers := []facetcomplete.FacetLayer{
		{Layer: records.Layer{LayerID: "b", Version: "v1", Kind: "operation"}, Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetSecurity)}}},
		{Layer: records.Layer{LayerID: "a", Version: "v1", Kind: "operation"}, Facets: facets.FacetSet{Instances: []facets.Instance{inst(facets.FacetFunctional), inst(facets.FacetBudgets)}}},
	}
	r1 := facetcomplete.ComputeFacetCompleteness(layers, nil)
	r2 := facetcomplete.ComputeFacetCompleteness(layers, nil)
	if len(r1.Facet) != len(r2.Facet) {
		t.Fatalf("non-deterministic monster count: %d vs %d", len(r1.Facet), len(r2.Facet))
	}
	for i := range r1.Facet {
		if r1.Facet[i] != r2.Facet[i] {
			t.Fatalf("monster order not deterministic at %d: %+v vs %+v", i, r1.Facet[i], r2.Facet[i])
		}
	}
	// Sorted by layer id: "a" before "b".
	if r1.Facet[0].LayerID != "a" {
		t.Fatalf("monsters not sorted by layer id, first is %q", r1.Facet[0].LayerID)
	}
}
