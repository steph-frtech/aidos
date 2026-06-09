package techspec

import (
	"strings"
	"testing"
)

// sampleKernel is a representative NETWORKED TechKernel (a checkout API cell): a Contrat
// (F5), a Modèle (F4), two OSI layers with specs+tests, three facets (S/B/M) with
// specs+tests, two linked ADRs, and N4/N5 test groups. It carries declarations across
// every assembled section so the fixtures exercise the full ranging.
func sampleKernel() TechKernel {
	return TechKernel{
		KernelID:  "CheckoutAPI",
		Networked: true,
		Contract:  Decl{Ref: "contract:CheckoutAPI", Title: "Contrat Checkout", Body: "POST /checkout → 201."},
		Model:     Decl{Ref: "model:Order", Title: "Modèle Order", Body: "order(id, total, status)."},
		OSI: []OSISpec{
			{
				Layer: OSISession,
				Specs: []Decl{{Ref: "osi:L5:oauth", Title: "OAuth bearer", Body: "Bearer token requis."}},
				Tests: []Decl{{Ref: "test:L5:auth-401", Title: "401 sans token", Body: "Refus sans bearer."}},
			},
			{
				Layer: OSIApplication,
				Specs: []Decl{{Ref: "osi:L7:schema", Title: "Schéma OpenAPI", Body: "Schéma de la route."}},
				Tests: []Decl{{Ref: "test:L7:contract", Title: "Contrat d'interface", Body: "Pact provider."}},
			},
		},
		Facets: []FacetSpec{
			{
				Facet: FacetMaintainability,
				Specs: []Decl{{Ref: "facet:M1:layers", Title: "Frontières", Body: "kernel ⊥ runtime."}},
				Tests: []Decl{{Ref: "facet:M3:arch", Title: "go-arch-lint", Body: "Pas de cycle."}},
			},
			{
				Facet: FacetSecurity,
				Specs: []Decl{{Ref: "facet:S1:allowlist", Title: "Field allowlist", Body: "Champs autorisés."}},
				Tests: []Decl{{Ref: "facet:S3:injection", Title: "Injection eval", Body: "Semgrep + gosec."}},
			},
			{
				Facet: FacetBudgets,
				Specs: []Decl{{Ref: "facet:B1:p99", Title: "Budget p99", Body: "p99 < 200ms."}},
				Tests: []Decl{{Ref: "facet:B3:k6", Title: "k6 load", Body: "100 rps."}},
			},
		},
		ADRs: []Decl{
			{Ref: "adr:0010", Title: "Design system", Body: "ccup theme."},
			{Ref: "adr:0009", Title: "MCP per op", Body: "Une op = un outil."},
		},
		TestGroups: []TestGroup{
			{Kind: TestInfra, Tests: []Decl{{Ref: "test:N5:testcontainers", Title: "Postgres réel", Body: "Testcontainers."}}},
			{Kind: TestUnit, Tests: []Decl{{Ref: "test:N4:unit-total", Title: "Total checkout", Body: "go test."}}},
		},
	}
}

// TestFixture_AssembleFiche_RangesByContractModelOSIFacetsADR proves the Fiche assembles
// Contrat + Modèle + OSI + facet specs + ADRs, in the canonical axis order (FKE-20.1).
func TestFixture_AssembleFiche_RangesByContractModelOSIFacetsADR(t *testing.T) {
	out, err := Assemble(sampleKernel(), ProjFiche)
	if err != nil {
		t.Fatalf("Assemble fiche: %v", err)
	}
	for _, want := range []string{
		"# Fiche de Spécification Technique — CheckoutAPI",
		"Contrat (F5)", "contract:CheckoutAPI",
		"Modèle (F4)", "model:Order",
		"Pile de communication (OSI)",
		"Couche L7-application", "osi:L7:schema",
		"Couche L5-session", "osi:L5:oauth",
		"Specs des facettes", "Sécurité (S)", "facet:S1:allowlist",
		"Maintenabilité & Architecture (M)", "facet:M1:layers",
		"ADR liés", "adr:0009", "adr:0010",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("Fiche missing %q\n---\n%s", want, out)
		}
	}
	// OSI ranges TOP-DOWN: L7 before L5.
	if strings.Index(out, "Couche L7-application") > strings.Index(out, "Couche L5-session") {
		t.Errorf("OSI not ranged L7→L5:\n%s", out)
	}
	// Facets range S before B before M (canonical order), regardless of input order.
	si, mi := strings.Index(out, "Sécurité (S)"), strings.Index(out, "Maintenabilité")
	if si < 0 || mi < 0 || si > mi {
		t.Errorf("facets not ranged S…M:\n%s", out)
	}
}

// TestFixture_AssembleSuite_RangesByTestKindOSIFacets proves the Suite assembles N4/N5 +
// per-OSI tests + facet tests, and does NOT carry the F5 contract spec (it is tests-only).
func TestFixture_AssembleSuite_RangesByTestKindOSIFacets(t *testing.T) {
	out, err := Assemble(sampleKernel(), ProjSuite)
	if err != nil {
		t.Fatalf("Assemble suite: %v", err)
	}
	for _, want := range []string{
		"# Suite de Tests Techniques — CheckoutAPI",
		"Tests unitaires (N4)", "test:N4:unit-total",
		"Tests d'infra (N5)", "test:N5:testcontainers",
		"Tests par couche OSI", "test:L7:contract", "test:L5:auth-401",
		"Tests des facettes", "facet:S3:injection", "facet:B3:k6", "facet:M3:arch",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("Suite missing %q\n---\n%s", want, out)
		}
	}
	// N4 ranges before N5.
	if strings.Index(out, "Tests unitaires (N4)") > strings.Index(out, "Tests d'infra (N5)") {
		t.Errorf("test groups not ranged N4→N5:\n%s", out)
	}
	// The Suite never carries the contract SPEC ref (that lives in the Fiche only).
	if strings.Contains(out, "contract:CheckoutAPI") {
		t.Errorf("Suite leaked the F5 contract spec (double-typing):\n%s", out)
	}
}

// TestFixture_ZeroNewTruth_AssembledRefsEqualsDeclaredRefs is the load-bearing done-
// criterion: the two projections assemble EXACTLY the declared technical elements — no
// fabrication (every assembled ref is declared) and no loss (every declared ref is
// assembled). Set equality between the rendered bytes and the input declarations.
func TestFixture_ZeroNewTruth_AssembledRefsEqualsDeclaredRefs(t *testing.T) {
	k := sampleKernel()
	declared := DeclaredRefs(k)
	assembled, err := AssembledRefs(k)
	if err != nil {
		t.Fatalf("AssembledRefs: %v", err)
	}
	if strings.Join(declared, "|") != strings.Join(assembled, "|") {
		t.Fatalf("zero-new-truth broken:\n declared=%v\nassembled=%v", declared, assembled)
	}
}

// TestFixture_ByteIdentical_SameKernelSameFiles proves re-assembly from the SAME kernel
// yields byte-identical projections (the FK15 done-criterion « mêmes kernels → mêmes
// fichiers byte-identiques »).
func TestFixture_ByteIdentical_SameKernelSameFiles(t *testing.T) {
	k := sampleKernel()
	a, err := AssembleAll(k)
	if err != nil {
		t.Fatalf("AssembleAll a: %v", err)
	}
	b, err := AssembleAll(k)
	if err != nil {
		t.Fatalf("AssembleAll b: %v", err)
	}
	for _, p := range Projections() {
		if a[p] != b[p] {
			t.Errorf("projection %q not byte-identical across calls", p)
		}
	}
}

// TestFixture_InputOrderInvariant proves a kernel whose declaration slices are SHUFFLED
// assembles byte-identical files (the bytes never echo caller slice order).
func TestFixture_InputOrderInvariant(t *testing.T) {
	k := sampleKernel()
	shuffled := sampleKernel()
	// Reverse every slice to maximise the order difference.
	rev := func(d []Decl) []Decl {
		out := make([]Decl, len(d))
		for i := range d {
			out[len(d)-1-i] = d[i]
		}
		return out
	}
	for i := range shuffled.OSI {
		shuffled.OSI[i].Specs = rev(shuffled.OSI[i].Specs)
		shuffled.OSI[i].Tests = rev(shuffled.OSI[i].Tests)
	}
	// Reverse the OSI, facet, ADR, group slices themselves.
	for i, j := 0, len(shuffled.OSI)-1; i < j; i, j = i+1, j-1 {
		shuffled.OSI[i], shuffled.OSI[j] = shuffled.OSI[j], shuffled.OSI[i]
	}
	for i, j := 0, len(shuffled.Facets)-1; i < j; i, j = i+1, j-1 {
		shuffled.Facets[i], shuffled.Facets[j] = shuffled.Facets[j], shuffled.Facets[i]
	}
	shuffled.ADRs = rev(shuffled.ADRs)
	for i, j := 0, len(shuffled.TestGroups)-1; i < j; i, j = i+1, j-1 {
		shuffled.TestGroups[i], shuffled.TestGroups[j] = shuffled.TestGroups[j], shuffled.TestGroups[i]
	}
	ka, _ := AssembleAll(k)
	sa, _ := AssembleAll(shuffled)
	for _, p := range Projections() {
		if ka[p] != sa[p] {
			t.Errorf("projection %q not invariant under input ordering", p)
		}
	}
}

// TestFixture_HandEditDetected is the FK15 fault-injection: hand-edit a byte of an
// emitted projection → DetectDrift goes RED with HAND_EDITED (the marker still matches the
// source-hash, but the body lies).
func TestFixture_HandEditDetected(t *testing.T) {
	k := sampleKernel()
	clean, err := Assemble(k, ProjFiche)
	if err != nil {
		t.Fatalf("Assemble: %v", err)
	}
	if d, _ := DetectDrift(k, ProjFiche, clean); d != nil {
		t.Fatalf("clean projection flagged: %+v", d)
	}
	tampered := strings.Replace(clean, "POST /checkout → 201.", "POST /checkout → 200 (hand-edited).", 1)
	if tampered == clean {
		t.Fatal("tamper did not change the file")
	}
	d, err := DetectDrift(k, ProjFiche, tampered)
	if err != nil {
		t.Fatalf("DetectDrift: %v", err)
	}
	if d == nil || d.Kind != DriftHandEdited {
		t.Fatalf("hand-edit not detected, got %+v", d)
	}
}

// TestFixture_MissingMarker_AndStaleHash exercises the other two drift kinds.
func TestFixture_MissingMarker_AndStaleHash(t *testing.T) {
	k := sampleKernel()
	d, _ := DetectDrift(k, ProjFiche, "no marker here at all")
	if d == nil || d.Kind != DriftMissingMarker {
		t.Fatalf("missing-marker not detected, got %+v", d)
	}
	// A file emitted from a DIFFERENT kernel carries a stale hash relative to k.
	other := sampleKernel()
	other.KernelID = "OtherKernel"
	staleFile, _ := Assemble(other, ProjFiche)
	d2, _ := DetectDrift(k, ProjFiche, staleFile)
	if d2 == nil || d2.Kind != DriftStaleHash {
		t.Fatalf("stale-hash not detected, got %+v", d2)
	}
}

// TestFixture_OSIOnPureFunctionRejected proves a non-networked kernel may not declare OSI
// specs (a pure function has no OSI layer, FKE-20.1).
func TestFixture_OSIOnPureFunctionRejected(t *testing.T) {
	k := TechKernel{
		KernelID:  "PureFn",
		Networked: false,
		OSI:       []OSISpec{{Layer: OSIApplication, Specs: []Decl{{Ref: "x", Title: "x", Body: "x"}}}},
	}
	if err := Validate(k); err == nil {
		t.Fatal("expected OSI_ON_PURE_FUNCTION, got nil")
	}
}

// TestFixture_PureFunctionKernel_NoOSISection proves a pure-function kernel assembles with
// no OSI section (only Modèle + facets + N4 tests).
func TestFixture_PureFunctionKernel_NoOSISection(t *testing.T) {
	k := TechKernel{
		KernelID:   "Scorer",
		Networked:  false,
		Model:      Decl{Ref: "model:Score", Title: "Modèle Score", Body: "score(value)."},
		Facets:     []FacetSpec{{Facet: FacetBudgets, Specs: []Decl{{Ref: "facet:B1:cpu", Title: "CPU", Body: "O(n)."}}}},
		TestGroups: []TestGroup{{Kind: TestUnit, Tests: []Decl{{Ref: "test:N4:score", Title: "Score unit", Body: "go test."}}}},
	}
	fiche, err := Assemble(k, ProjFiche)
	if err != nil {
		t.Fatalf("Assemble: %v", err)
	}
	if strings.Contains(fiche, "Pile de communication (OSI)") {
		t.Errorf("pure function carried an OSI section:\n%s", fiche)
	}
	if !strings.Contains(fiche, "model:Score") {
		t.Errorf("pure function missing its model:\n%s", fiche)
	}
}

// TestFixture_ContentAddressedRoundTrip proves Record yields id == version == Hash and
// ParseBody recovers the kernel (the storage fork: a techspec rides inside kernel.link).
func TestFixture_ContentAddressedRoundTrip(t *testing.T) {
	k := sampleKernel()
	rec, err := Record(k)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if rec.ID == "" || rec.ID != rec.Version {
		t.Fatalf("not content-addressed: id=%q version=%q", rec.ID, rec.Version)
	}
	got, err := ParseBody(rec.Body)
	if err != nil {
		t.Fatalf("ParseBody: %v", err)
	}
	if got.KernelID != k.KernelID || got.Networked != k.Networked {
		t.Fatalf("round-trip lost shape: %+v", got)
	}
	// A renamed declaration yields a NEW version (KRD §12).
	k2 := sampleKernel()
	k2.Contract.Ref = "contract:CheckoutAPIv2"
	rec2, _ := Record(k2)
	if rec2.Version == rec.Version {
		t.Fatal("a changed source did not yield a new version")
	}
}
