package main

import (
	"context"
	"strings"
	"testing"
)

// The MCP server is the capability door over FK15 part (b) — it must build and each tool
// must faithfully relay the pure assembler verdict (the wall: it adds no judgment; the
// judge is the deterministic assembly + set/byte comparison in
// back/runtime/generators/techspec).

func sampleKernelIn() kernelIn {
	return kernelIn{
		KernelID:  "CheckoutAPI",
		Networked: true,
		Contract:  declIn{Ref: "contract:CheckoutAPI", Title: "Contrat", Body: "POST /checkout → 201."},
		Model:     declIn{Ref: "model:Order", Title: "Modèle Order", Body: "order(id, total)."},
		OSI: []osiIn{
			{Layer: "L5-session", Specs: []declIn{{Ref: "osi:L5:oauth", Title: "OAuth", Body: "Bearer."}}, Tests: []declIn{{Ref: "test:L5:401", Title: "401", Body: "Refus."}}},
			{Layer: "L7-application", Specs: []declIn{{Ref: "osi:L7:schema", Title: "Schéma", Body: "OpenAPI."}}, Tests: []declIn{{Ref: "test:L7:pact", Title: "Pact", Body: "Provider."}}},
		},
		Facets: []facetIn{
			{Facet: "S", Specs: []declIn{{Ref: "facet:S1:allow", Title: "Allowlist", Body: "Champs."}}, Tests: []declIn{{Ref: "facet:S3:inj", Title: "Injection", Body: "Semgrep."}}},
			{Facet: "M", Specs: []declIn{{Ref: "facet:M1:layers", Title: "Frontières", Body: "kernel ⊥ runtime."}}, Tests: []declIn{{Ref: "facet:M3:arch", Title: "arch", Body: "Pas de cycle."}}},
		},
		ADRs:       []declIn{{Ref: "adr:0010", Title: "Theme", Body: "ccup."}},
		TestGroups: []groupIn{{Kind: "N4-unit", Tests: []declIn{{Ref: "test:N4:total", Title: "Total", Body: "go test."}}}},
	}
}

func TestServerBuilds(t *testing.T) {
	if srv := newMCPServer(); srv == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestAssemble_Deterministic(t *testing.T) {
	_, a, err := assemble(context.Background(), nil, assembleIn{Kernel: sampleKernelIn(), Projection: "fiche-specification-technique"})
	if err != nil {
		t.Fatal(err)
	}
	_, b, _ := assemble(context.Background(), nil, assembleIn{Kernel: sampleKernelIn(), Projection: "fiche-specification-technique"})
	if !a.OK || a.File == "" || a.File != b.File {
		t.Fatalf("assemble not deterministic: %+v", a)
	}
	if !strings.Contains(a.File, "contract:CheckoutAPI") {
		t.Fatalf("Fiche missing the contract:\n%s", a.File)
	}
}

func TestAssembleAll_BothProjections(t *testing.T) {
	_, out, err := assembleAll(context.Background(), nil, sampleKernelIn())
	if err != nil {
		t.Fatal(err)
	}
	if !out.OK || len(out.Files) != 2 {
		t.Fatalf("expected 2 projections, got %+v", out)
	}
}

func TestZeroNewTruth_DeclaredEqualsAssembled(t *testing.T) {
	_, dr, _ := declaredRefs(context.Background(), nil, sampleKernelIn())
	_, ar, _ := assembledRefs(context.Background(), nil, sampleKernelIn())
	if !dr.OK || !ar.OK {
		t.Fatalf("refs not ok: %+v %+v", dr, ar)
	}
	if strings.Join(dr.Refs, "|") != strings.Join(ar.Refs, "|") {
		t.Fatalf("zero-new-truth broken:\n declared=%v\nassembled=%v", dr.Refs, ar.Refs)
	}
}

func TestDetectDrift_CleanAndHandEdit(t *testing.T) {
	_, em, _ := assemble(context.Background(), nil, assembleIn{Kernel: sampleKernelIn(), Projection: "fiche-specification-technique"})
	_, clean, _ := detectDrift(context.Background(), nil, detectIn{Kernel: sampleKernelIn(), Projection: "fiche-specification-technique", OnDisk: em.File})
	if !clean.OK || !clean.Clean {
		t.Fatalf("expected clean, got %+v", clean)
	}
	edited := strings.Replace(em.File, "POST /checkout → 201.", "POST /checkout → 200.", 1)
	_, drift, _ := detectDrift(context.Background(), nil, detectIn{Kernel: sampleKernelIn(), Projection: "fiche-specification-technique", OnDisk: edited})
	if drift.Clean || drift.DriftKind != "HAND_EDITED" {
		t.Fatalf("expected HAND_EDITED, got %+v", drift)
	}
}

func TestValidate_Refusal(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, kernelIn{KernelID: ""})
	if out.Valid || out.Error != "NO_KERNEL_ID" {
		t.Fatalf("expected NO_KERNEL_ID, got %+v", out)
	}
	// OSI on a pure function is refused.
	pure := kernelIn{KernelID: "P", Networked: false, OSI: []osiIn{{Layer: "L7-application", Specs: []declIn{{Ref: "x", Title: "x", Body: "x"}}}}}
	_, o2, _ := validate(context.Background(), nil, pure)
	if o2.Valid || o2.Error != "OSI_ON_PURE_FUNCTION" {
		t.Fatalf("expected OSI_ON_PURE_FUNCTION, got %+v", o2)
	}
}
