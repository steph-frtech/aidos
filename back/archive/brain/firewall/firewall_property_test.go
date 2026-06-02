// Property mirror (rapid, ∀, below the line, computational) for the MemoryFirewall
// (AIDOS step S30). reflects: archive.brain.firewall.{Capture,Propose,ToKernel,ViaIdea} ·
// test_kind: property · cert_language: rapid · authority: below · liveness: alive.
//
// It is the REPRODUCIBILITY mirror (CLAUDE.md §6 determinism-first): the firewall functions
// are pure, total, deterministic over their inputs (same input ⇒ same verdict) and never
// panic. The invariant: for ANY MemoryItem the direct edge ToKernel ALWAYS blocks with
// MEMORY_CANNOT_DECLARE_TRUTH and NEVER a kernel write — independent of confidence/taint.
package firewall_test

import (
	"strings"
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// genMemory draws an arbitrary MemoryItem: any content/provenance/scope/expiry, any
// confidence (including 1.0), any subset of the closed taint enum (including the empty set).
func genMemory(t *rapid.T) firewall.MemoryItem {
	all := firewall.Taints()
	taint := []firewall.Taint{}
	for _, tt := range all {
		if rapid.Bool().Draw(t, "include-"+string(tt)) {
			taint = append(taint, tt)
		}
	}
	m, err := firewall.Capture(firewall.CaptureInput{
		Content:       rapid.String().Draw(t, "content"),
		Provenance:    rapid.String().Draw(t, "provenance"),
		ValidityScope: rapid.String().Draw(t, "scope"),
		ExpiresAt:     rapid.String().Draw(t, "expires"),
		Confidence:    rapid.Float64Range(0, 1).Draw(t, "confidence"),
		Taint:         taint,
		Branch:        rapid.StringMatching(`[a-z][a-z0-9/-]{0,12}`).Draw(t, "branch"),
	})
	if err != nil {
		t.Fatalf("Capture: %v", err)
	}
	return m
}

// ∀ memory: ToKernel ALWAYS blocks with MEMORY_CANNOT_DECLARE_TRUTH, regardless of
// confidence/taint. Even a clean (taint == []), fully-confident (1.0) memory is still blocked.
func TestProp_ToKernel_AlwaysBlocked(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMemory(t)
		br := firewall.ToKernel(m)
		if br == nil {
			t.Fatalf("ToKernel must ALWAYS block (a kernel write would occur): %+v", m)
		}
		if string(br.Code) != "MEMORY_CANNOT_DECLARE_TRUTH" {
			t.Fatalf("code: got %q want MEMORY_CANNOT_DECLARE_TRUTH", br.Code)
		}
		if len(br.HowToFix) == 0 {
			t.Fatal("how_to_fix must be non-empty (no prison)")
		}
	})
}

// A clean, fully-confident, untainted memory is STILL not truth — explicitly pinned.
func TestProp_CleanConfidentMemory_StillBlocked(t *testing.T) {
	m, err := firewall.Capture(firewall.CaptureInput{
		Content:    "the canonical truth, surely",
		Provenance: "external_source:the spec itself",
		Confidence: 1.0,
		Taint:      nil,
		Branch:     "main",
	})
	if err != nil {
		t.Fatalf("Capture: %v", err)
	}
	if br := firewall.ToKernel(m); br == nil || string(br.Code) != "MEMORY_CANNOT_DECLARE_TRUTH" {
		t.Fatalf("a clean, confident memory must STILL be blocked: %v", br)
	}
}

// ∀ memory: id == content hash of the canonical body (S01 content-addressing), and the body
// carries neither a version nor a mirror key (the type makes them unrepresentable).
func TestProp_ContentAddressed_NoVersionNoMirror(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMemory(t)
		canon, err := m.CanonicalBody()
		if err != nil {
			t.Fatalf("CanonicalBody: %v", err)
		}
		if want := records.Hash(canon); m.ID != want {
			t.Fatalf("id != content hash: got %q want %q", m.ID, want)
		}
		body := string(canon)
		if strings.Contains(body, `"version"`) || strings.Contains(body, `"mirror"`) {
			t.Fatalf("a memory must carry no version and no mirror; body=%s", body)
		}
	})
}

// ∀ memory: Propose carries the taint forward — taint never silently drops.
func TestProp_Propose_TaintNeverDrops(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMemory(t)
		entry := firewall.Propose(m, rapid.String().Draw(t, "goal"))
		if len(entry.Taint) != len(m.Taint) {
			t.Fatalf("taint count changed: entry=%v memory=%v", entry.Taint, m.Taint)
		}
		for i, tt := range m.Taint {
			if entry.Taint[i] != tt {
				t.Fatalf("taint reordered/dropped at %d: %v vs %v", i, entry.Taint, m.Taint)
			}
		}
		if entry.MemoryID != m.ID {
			t.Fatalf("entry must reference the memory id")
		}
	})
}

// ∀ memory: ViaIdea yields a DRAFT idea whose provenance points back to the memory id, with
// no kernel write. The idea (ideas.Idea) carries no version and no mirror by construction.
func TestProp_ViaIdea_DraftNoKernelWrite(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMemory(t)
		cand, err := firewall.ViaIdea(m)
		if err != nil {
			t.Fatalf("ViaIdea: %v", err)
		}
		if cand.Idea.Status != ideas.StatusDraft {
			t.Fatalf("idea must be draft: %q", cand.Idea.Status)
		}
		if cand.Idea.Provenance.Detail != "memory:"+m.ID {
			t.Fatalf("provenance must point back to the memory: %q", cand.Idea.Provenance.Detail)
		}
		if cand.WroteKernel {
			t.Fatal("ViaIdea must perform no kernel write")
		}
	})
}

// ToKernel is deterministic: same memory ⇒ same verdict code.
func TestProp_ToKernel_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genMemory(t)
		a := firewall.ToKernel(m)
		b := firewall.ToKernel(m)
		if (a == nil) != (b == nil) {
			t.Fatal("non-deterministic block decision")
		}
		if a != nil && b != nil && a.Code != b.Code {
			t.Fatalf("non-deterministic code: %q vs %q", a.Code, b.Code)
		}
	})
}
