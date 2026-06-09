package main

import (
	"context"
	"testing"
)

// FK16 MCP smoke: the three tools derive the E-typed re-labelling, lose nothing, and write nothing.

func TestMirrorE_Tool(t *testing.T) {
	_, out, err := mirrorE(context.Background(), nil, mirrorEInput{TestKind: "property", CertLanguage: "rapid"})
	if err != nil {
		t.Fatalf("mirror_e: %v", err)
	}
	if !out.OK || out.Level != 5 {
		t.Fatalf("mirror_e(property,rapid)=%d %q, want E5", out.Level, out.Name)
	}
	_, prose, _ := mirrorE(context.Background(), nil, mirrorEInput{TestKind: "unit", CertLanguage: "prose"})
	if prose.Level != 0 {
		t.Fatalf("mirror_e(unit,prose)=%d, want E0 (non-executable)", prose.Level)
	}
}

func TestRelabel_Tool_NoLoss(t *testing.T) {
	_, out, err := relabel(context.Background(), nil, relabelInput{Corpus: []mirrorInDTO{
		{MirrorID: "m1", TestKind: "acceptance", CertLanguage: "gherkin", N: "N0"},
		{MirrorID: "m2", TestKind: "property", CertLanguage: "rapid", N: "N1"},
	}})
	if err != nil {
		t.Fatalf("relabel: %v", err)
	}
	if !out.NoLoss || len(out.Tags) != 2 {
		t.Fatalf("relabel lost something: no_loss=%v tags=%d", out.NoLoss, len(out.Tags))
	}
	for _, tg := range out.Tags {
		if tg.N == "" || tg.NLifecycle != "deprecated" {
			t.Fatalf("tag %s: N=%q lifecycle=%q — N must be preserved + deprecated", tg.MirrorID, tg.N, tg.NLifecycle)
		}
	}
}

func TestHistogram_Tool(t *testing.T) {
	_, out, err := histogram(context.Background(), nil, histInput{Corpus: []mirrorInDTO{
		{MirrorID: "m1", TestKind: "property", CertLanguage: "rapid", N: "N1"},
	}})
	if err != nil {
		t.Fatalf("histogram: %v", err)
	}
	if len(out.Buckets) != 8 {
		t.Fatalf("want 8 E-buckets, got %d", len(out.Buckets))
	}
	for _, b := range out.Buckets {
		if b.Level == 5 && b.Count != 1 {
			t.Fatalf("E5 bucket count=%d, want 1", b.Count)
		}
	}
}

func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("nil server")
	}
}
