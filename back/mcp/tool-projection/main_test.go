package main

import (
	"context"
	"strings"
	"testing"
)

// The MCP server is the capability door over FK15 — it must build and each tool must
// faithfully relay the pure emitter/drift verdict (the wall: it adds no judgment; the
// judge is the deterministic render + byte comparison in back/kernel/toolproject).

func aidosKernelIn() kernelIn {
	return kernelIn{
		Project: "AIDOS",
		Sources: []sourceIn{
			{Kind: "policy", ID: "the-wall", Title: "Le mur", Body: "L'agent n'écrit jamais la vérité."},
			{Kind: "style", ID: "biome", Title: "Biome", Body: "Tabs, double quotes."},
			{Kind: "memory", ID: "report", Title: "Report", Body: "Toujours StructuredOutput."},
			{Kind: "agent-profile", ID: "executor", Title: "step-executor", Body: "Une étape isolée."},
		},
	}
}

func TestServerBuilds(t *testing.T) {
	if srv := newMCPServer(); srv == nil {
		t.Fatal("newMCPServer returned nil")
	}
}

func TestEmit_Deterministic(t *testing.T) {
	_, a, err := emit(context.Background(), nil, emitIn{Kernel: aidosKernelIn(), Target: "CLAUDE.md"})
	if err != nil {
		t.Fatal(err)
	}
	_, b, _ := emit(context.Background(), nil, emitIn{Kernel: aidosKernelIn(), Target: "CLAUDE.md"})
	if !a.OK || a.File == "" || a.File != b.File {
		t.Fatalf("emit not deterministic: %+v", a)
	}
	if !strings.Contains(a.File, "Le mur") {
		t.Fatalf("CLAUDE.md missing the wall policy:\n%s", a.File)
	}
}

func TestEmitAll_AllTargets(t *testing.T) {
	_, out, err := emitAll(context.Background(), nil, aidosKernelIn())
	if err != nil {
		t.Fatal(err)
	}
	if !out.OK || len(out.Files) != 4 {
		t.Fatalf("expected 4 files, got %+v", out)
	}
}

func TestDetectDrift_CleanAndHandEdit(t *testing.T) {
	_, em, _ := emit(context.Background(), nil, emitIn{Kernel: aidosKernelIn(), Target: "CLAUDE.md"})
	// Clean.
	_, clean, _ := detectDrift(context.Background(), nil, detectIn{Kernel: aidosKernelIn(), Target: "CLAUDE.md", OnDisk: em.File})
	if !clean.OK || !clean.Clean {
		t.Fatalf("expected clean, got %+v", clean)
	}
	// Hand-edit.
	edited := strings.Replace(em.File, "L'agent n'écrit jamais", "L'agent peut écrire", 1)
	_, drift, _ := detectDrift(context.Background(), nil, detectIn{Kernel: aidosKernelIn(), Target: "CLAUDE.md", OnDisk: edited})
	if drift.Clean || drift.DriftKind != "HAND_EDITED" {
		t.Fatalf("expected HAND_EDITED, got %+v", drift)
	}
}

func TestValidate_Refusal(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, kernelIn{Project: ""})
	if out.Valid || out.Error != "NO_PROJECT" {
		t.Fatalf("expected NO_PROJECT, got %+v", out)
	}
}

func TestSerialize_ContentAddressed(t *testing.T) {
	_, out, err := serialize(context.Background(), nil, aidosKernelIn())
	if err != nil {
		t.Fatal(err)
	}
	if !out.OK || out.ID == "" || out.ID != out.Version {
		t.Fatalf("expected content-addressed id==version, got %+v", out)
	}
}
