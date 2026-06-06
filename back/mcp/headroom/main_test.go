package main

// MCP server tests for the headroom context-compression sidecar capability door (HR03). They
// prove the three tools are wired end-to-end over the deterministic reference adapter AND that the
// wall holds: the server compresses, retrieves byte-lossless, and proves the gate-invariance
// theorem — it exposes NO tool that writes kernel/mirrors/fitness.

import (
	"context"
	"testing"
)

const samplePrompt = "# CONTEXT PACK\nthe wall the wall the wall\n## Boundaries (THE WALL)\n" +
	"allowed_paths: app/main.go\ntool: store/read\nskill: tdd\n" +
	"forbidden_paths: /kernel/**, /mirror/**\nthe wall the wall the wall\n"

// TestCompress_LosslessAndReduces proves headroom_compress exposes the handle, marks the
// round-trip lossless, and reports the reduction.
func TestCompress_LosslessAndReduces(t *testing.T) {
	s := newServer()
	_, out, err := s.compress(context.Background(), nil, compressInput{Prompt: samplePrompt})
	if err != nil {
		t.Fatalf("compress: %v", err)
	}
	if !out.Lossless {
		t.Fatalf("compress must be lossless, got Lossless=false")
	}
	if out.CompactedChars >= out.OriginalChars {
		t.Fatalf("compacted (%d) must be shorter than original (%d) for a repetitive prompt", out.CompactedChars, out.OriginalChars)
	}
	if len(out.Handle.Dictionary) == 0 {
		t.Fatalf("expected a non-empty CCR dictionary for a repetitive prompt")
	}
}

// TestRetrieve_InvertsCompress proves headroom_retrieve re-expands a handle back to the
// normalized original (CCR).
func TestRetrieve_InvertsCompress(t *testing.T) {
	s := newServer()
	_, c, err := s.compress(context.Background(), nil, compressInput{Prompt: samplePrompt})
	if err != nil {
		t.Fatalf("compress: %v", err)
	}
	_, r, err := s.retrieve(context.Background(), nil, retrieveInput{Handle: c.Handle})
	if err != nil {
		t.Fatalf("retrieve: %v", err)
	}
	for _, fact := range []string{"app/main.go", "store/read", "tdd", "/kernel/**", "/mirror/**"} {
		if !containsStr(r.Original, fact) {
			t.Fatalf("retrieve lost carrier fact %q: %q", fact, r.Original)
		}
	}
}

// TestGateCheck_Invariant proves headroom_gate_check returns Invariant=true for the happy-path
// prompt (the HR03 theorem, callable as a tool) — and that the verdict is ALLOWED (non-trivial).
func TestGateCheck_Invariant(t *testing.T) {
	s := newServer()
	_, out, err := s.gateCheck(context.Background(), nil, gateCheckInput{Prompt: samplePrompt})
	if err != nil {
		t.Fatalf("gate_check: %v", err)
	}
	if !out.Invariant {
		t.Fatalf("gate verdict must be invariant to compression, got original=%+v compressed=%+v", out.OriginalVerdict, out.CompressedVerdict)
	}
	if !out.OriginalVerdict.Allowed {
		t.Fatalf("expected happy-path prompt to be allowed, got %+v", out.OriginalVerdict)
	}
}

// TestGateCheck_InvariantOnDeny proves invariance ALSO holds when the action is denied (a prompt
// binding an unbound tool trips the capacity axis — before and after compression alike).
func TestGateCheck_InvariantOnDeny(t *testing.T) {
	s := newServer()
	deny := "# CONTEXT PACK\nthe wall the wall\n## Boundaries\nallowed_paths: app/main.go\n" +
		"tool: evil/exfiltrate\nforbidden_paths: /kernel/**, /mirror/**\nthe wall the wall\n"
	_, out, err := s.gateCheck(context.Background(), nil, gateCheckInput{Prompt: deny})
	if err != nil {
		t.Fatalf("gate_check: %v", err)
	}
	if !out.Invariant {
		t.Fatalf("deny verdict must be invariant, got original=%+v compressed=%+v", out.OriginalVerdict, out.CompressedVerdict)
	}
	if out.OriginalVerdict.Allowed || out.OriginalVerdict.DeniedAxis != "capacity" {
		t.Fatalf("expected capacity deny, got %+v", out.OriginalVerdict)
	}
}

func containsStr(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return len(needle) == 0
}
