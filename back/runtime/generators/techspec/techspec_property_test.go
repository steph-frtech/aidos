package techspec

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// FK15 part (b) reproducibility mirror (CLAUDE.md §6/§8 determinism-first): the two
// assembled projections are a PURE TOTAL function of the TechKernel — same kernel ⇒
// byte-identical files, invariant under input ordering, and assembling EXACTLY the
// declared technical elements (zero new truth). No clock, no rng, no LLM.

// genDecl generates a declaration with a non-empty ref drawn from a small alphabet so
// collisions (and thus the sort/dedup paths) are exercised.
func genDecl(prefix string) *rapid.Generator[Decl] {
	return rapid.Custom(func(t *rapid.T) Decl {
		id := rapid.SampledFrom([]string{"a", "b", "c", "d", "e"}).Draw(t, "id")
		return Decl{
			Ref:   prefix + ":" + id,
			Title: rapid.SampledFrom([]string{"T1", "T2", "T3"}).Draw(t, "title"),
			Body:  rapid.SampledFrom([]string{"corps un", "corps deux"}).Draw(t, "body"),
		}
	})
}

// genKernel generates a VALID TechKernel (Validate passes): a non-empty id, OSI only when
// networked, every facet/test-kind drawn from the closed sets, every decl ref non-empty.
func genKernel() *rapid.Generator[TechKernel] {
	return rapid.Custom(func(t *rapid.T) TechKernel {
		networked := rapid.Bool().Draw(t, "networked")
		k := TechKernel{
			KernelID:  rapid.SampledFrom([]string{"K1", "K2", "K3"}).Draw(t, "kernel_id"),
			Networked: networked,
		}
		if rapid.Bool().Draw(t, "has_contract") {
			k.Contract = genDecl("contract").Draw(t, "contract")
		}
		if rapid.Bool().Draw(t, "has_model") {
			k.Model = genDecl("model").Draw(t, "model")
		}
		if networked {
			layers := rapid.SliceOfDistinct(rapid.SampledFrom(OSILayers()), func(l OSILayer) OSILayer { return l }).Draw(t, "layers")
			for _, l := range layers {
				k.OSI = append(k.OSI, OSISpec{
					Layer: l,
					Specs: rapid.SliceOfN(genDecl("osi"), 0, 3).Draw(t, "osi_specs"),
					Tests: rapid.SliceOfN(genDecl("otest"), 0, 3).Draw(t, "osi_tests"),
				})
			}
		}
		facets := rapid.SliceOfDistinct(rapid.SampledFrom(SpecFacets()), func(f SpecFacet) SpecFacet { return f }).Draw(t, "facets")
		for _, f := range facets {
			k.Facets = append(k.Facets, FacetSpec{
				Facet: f,
				Specs: rapid.SliceOfN(genDecl("fspec"), 0, 3).Draw(t, "facet_specs"),
				Tests: rapid.SliceOfN(genDecl("ftest"), 0, 3).Draw(t, "facet_tests"),
			})
		}
		k.ADRs = rapid.SliceOfN(genDecl("adr"), 0, 3).Draw(t, "adrs")
		kinds := rapid.SliceOfDistinct(rapid.SampledFrom(TestKinds()), func(tk TestKind) TestKind { return tk }).Draw(t, "kinds")
		for _, tk := range kinds {
			k.TestGroups = append(k.TestGroups, TestGroup{
				Kind:  tk,
				Tests: rapid.SliceOfN(genDecl("group"), 0, 3).Draw(t, "group_tests"),
			})
		}
		return k
	})
}

// shuffle reverses every slice in a kernel — a maximal input-order perturbation that must
// not change a single output byte.
func shuffle(k TechKernel) TechKernel {
	rev := func(d []Decl) []Decl {
		out := make([]Decl, len(d))
		for i := range d {
			out[len(d)-1-i] = d[i]
		}
		return out
	}
	for i := range k.OSI {
		k.OSI[i].Specs = rev(k.OSI[i].Specs)
		k.OSI[i].Tests = rev(k.OSI[i].Tests)
	}
	for i, j := 0, len(k.OSI)-1; i < j; i, j = i+1, j-1 {
		k.OSI[i], k.OSI[j] = k.OSI[j], k.OSI[i]
	}
	for i := range k.Facets {
		k.Facets[i].Specs = rev(k.Facets[i].Specs)
		k.Facets[i].Tests = rev(k.Facets[i].Tests)
	}
	for i, j := 0, len(k.Facets)-1; i < j; i, j = i+1, j-1 {
		k.Facets[i], k.Facets[j] = k.Facets[j], k.Facets[i]
	}
	k.ADRs = rev(k.ADRs)
	for i := range k.TestGroups {
		k.TestGroups[i].Tests = rev(k.TestGroups[i].Tests)
	}
	for i, j := 0, len(k.TestGroups)-1; i < j; i, j = i+1, j-1 {
		k.TestGroups[i], k.TestGroups[j] = k.TestGroups[j], k.TestGroups[i]
	}
	return k
}

// Prop 1 — DETERMINISM: same kernel ⇒ byte-identical projections across calls.
func TestProp_Determinism(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := genKernel().Draw(rt, "k")
		a, err := AssembleAll(k)
		if err != nil {
			rt.Fatalf("AssembleAll a: %v", err)
		}
		b, err := AssembleAll(k)
		if err != nil {
			rt.Fatalf("AssembleAll b: %v", err)
		}
		for _, p := range Projections() {
			if a[p] != b[p] {
				rt.Fatalf("projection %q not deterministic", p)
			}
		}
	})
}

// Prop 2 — INPUT-ORDER INVARIANCE: a shuffled kernel assembles byte-identical files (the
// load-bearing « mêmes kernels → mêmes fichiers byte-identiques », robust to slice order).
func TestProp_InputOrderInvariant(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := genKernel().Draw(rt, "k")
		a, err := AssembleAll(k)
		if err != nil {
			rt.Fatalf("AssembleAll: %v", err)
		}
		b, err := AssembleAll(shuffle(k))
		if err != nil {
			rt.Fatalf("AssembleAll shuffled: %v", err)
		}
		for _, p := range Projections() {
			if a[p] != b[p] {
				rt.Fatalf("projection %q leaked input ordering", p)
			}
		}
	})
}

// Prop 3 — ZERO NEW TRUTH (the FK15 done-criterion « la fiche assemble exactement les
// déclarations existantes »): AssembledRefs == DeclaredRefs (set equality). No fabrication
// (assembled ⊆ declared) and no loss (declared ⊆ assembled).
func TestProp_ZeroNewTruth(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := genKernel().Draw(rt, "k")
		declared := DeclaredRefs(k)
		assembled, err := AssembledRefs(k)
		if err != nil {
			rt.Fatalf("AssembledRefs: %v", err)
		}
		if strings.Join(declared, "|") != strings.Join(assembled, "|") {
			rt.Fatalf("zero-new-truth broken:\n declared=%v\nassembled=%v", declared, assembled)
		}
	})
}

// Prop 4 — DRIFT ⇔ HAND-EDIT: the clean assembly never drifts; any single-byte change to
// the body is detected (HAND_EDITED, the marker still valid).
func TestProp_DriftDetectsHandEdit(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := genKernel().Draw(rt, "k")
		for _, p := range Projections() {
			clean, err := Assemble(k, p)
			if err != nil {
				rt.Fatalf("Assemble: %v", err)
			}
			if d, _ := DetectDrift(k, p, clean); d != nil {
				rt.Fatalf("clean projection %q flagged: %+v", p, d)
			}
			// Inject a byte before the marker so the marker (hash) stays valid but the
			// body lies ⇒ HAND_EDITED.
			i := strings.Index(clean, markerPrefix)
			if i <= 0 {
				rt.Fatalf("no marker in %q", p)
			}
			tampered := clean[:i] + "X" + clean[i:]
			d, err := DetectDrift(k, p, tampered)
			if err != nil {
				rt.Fatalf("DetectDrift: %v", err)
			}
			if d == nil || d.Kind != DriftHandEdited {
				rt.Fatalf("hand-edit on %q not detected: %+v", p, d)
			}
		}
	})
}

// Prop 5 — CONTENT-ADDRESSED ROUND-TRIP: Record is content-addressed (id == version) and
// ParseBody recovers the kernel id + networked flag (the storage fork holds).
func TestProp_RoundTrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := genKernel().Draw(rt, "k")
		rec, err := Record(k)
		if err != nil {
			rt.Fatalf("Record: %v", err)
		}
		if rec.ID == "" || rec.ID != rec.Version {
			rt.Fatalf("not content-addressed: id=%q version=%q", rec.ID, rec.Version)
		}
		got, err := ParseBody(rec.Body)
		if err != nil {
			rt.Fatalf("ParseBody: %v", err)
		}
		if got.KernelID != k.KernelID || got.Networked != k.Networked {
			rt.Fatalf("round-trip lost shape")
		}
	})
}
