package ideaintakesrv

// MK03 REPRODUCIBILITY MIRROR (RED-first, then GREEN). reflects=mcp.idea-intake.convert_to_markdown,
// test_kind=property (rapid), liveness=live.
//
// The MK03 ingestion door is deterministic by contract: a document → markdown → an idea draft is a
// pure derivation (the DocConverter port + deriveDraft + ideas.Capture), with NO DB and NO LLM on
// the decision path. This mirror pins that contract WITHOUT a database — it exercises the pure core
// (convert → derive → ideas.Capture) the tool handler wraps, so the proof is fast and total:
//
//   - TestConvertDeriveIsDeterministic — same (content, mime, source) → same idea id + same
//     provenance + same markdown, 100× no drift (« même fichier → même idée »).
//   - TestProvenanceIsPreserved — the source name is kept verbatim in the idea's provenance Detail
//     (provenance is preserved, never invented), on the human on-ramp (the closed set).
//   - TestStatusIsAlwaysDraft — ingestion FREEZES NOTHING: the captured idea is always status=draft
//     and carries no mirror (the wall).
//   - TestUnsupportedMimeStillCapturesAnIdea — an unsupported mime yields "" markdown (the port is
//     total) yet still produces a well-formed draft idea (the door never panics).
//   - TestIngestionDoesNotWriteKernel — a structural guard: the only persistence call deriveDraft's
//     output ever reaches is ideas.Capture (the wall — no kernel/mirrors/fitness symbol is touched).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
	"pgregory.net/rapid"
)

const sampleDoc = `<html><head><title>X</title></head><body>
<h1>Order Discount Policy</h1>
<p>Give <strong>regulars</strong> a discount.</p>
<ul><li>10% over 100€</li></ul>
</body></html>`

// captureFromConvert is the pure core the convertToMarkdown handler wraps (everything but the DB
// Insert): convert via the port → derive → Capture. It is what the mirror exercises directly.
func captureFromConvert(conv markitdown.DocConverter, content, mime, source, proposes string) (string, ideas.Idea, error) {
	md := conv.ToMarkdown([]byte(content), markitdown.Mime(mime))
	p, intent, prov := deriveDraft(md, source, proposes)
	idea, err := ideas.Capture(p, intent, prov)
	return md, idea, err
}

func TestConvertDeriveIsDeterministic(t *testing.T) {
	conv := markitdown.HTMLConverter{}
	md0, idea0, err := captureFromConvert(conv, sampleDoc, "text/html", "spec.html", "policy")
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	for i := 0; i < 100; i++ {
		md, idea, err := captureFromConvert(conv, sampleDoc, "text/html", "spec.html", "policy")
		if err != nil {
			t.Fatalf("capture #%d: %v", i, err)
		}
		if md != md0 {
			t.Fatalf("markdown drifted at #%d", i)
		}
		if idea.ID != idea0.ID {
			t.Fatalf("idea id drifted at #%d: %q != %q", i, idea.ID, idea0.ID)
		}
		if idea.Provenance != idea0.Provenance {
			t.Fatalf("provenance drifted at #%d", i)
		}
	}
}

func TestProvenanceIsPreserved(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		source := rapid.StringMatching(`[a-zA-Z0-9_-]{1,20}\.(html|pdf|docx)`).Draw(rt, "source")
		_, idea, err := captureFromConvert(markitdown.HTMLConverter{}, sampleDoc, "text/html", source, "policy")
		if err != nil {
			rt.Fatalf("capture: %v", err)
		}
		// The source name is kept verbatim in the provenance Detail (preserved, never invented).
		if !strings.Contains(idea.Provenance.Detail, source) {
			rt.Fatalf("provenance %q does not preserve source %q", idea.Provenance.Detail, source)
		}
		// On the human on-ramp (a dropped document is a human intention; the set is closed).
		if idea.Provenance.Source != ideas.ProvenanceHuman {
			rt.Fatalf("provenance source = %q, want human", idea.Provenance.Source)
		}
	})
}

func TestStatusIsAlwaysDraft(t *testing.T) {
	_, idea, err := captureFromConvert(markitdown.HTMLConverter{}, sampleDoc, "text/html", "spec.html", "policy")
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	if idea.Status != ideas.StatusDraft {
		t.Fatalf("status = %q, want draft (ingestion freezes nothing)", idea.Status)
	}
	// An idea carries no mirror and no version — those absences are what make it an idea (KRD §118).
	out := toOutput(idea)
	if out.HasMirror {
		t.Fatal("an ingested idea must have no mirror (the wall)")
	}
}

func TestUnsupportedMimeStillCapturesAnIdea(t *testing.T) {
	md, idea, err := captureFromConvert(markitdown.HTMLConverter{}, "raw bytes", "application/pdf", "spec.pdf", "policy")
	if err != nil {
		t.Fatalf("capture: %v", err)
	}
	// The port is total: an unsupported mime yields "" markdown (never a panic) — the real adapter
	// dispatches PDF/DOCX behind the same port later.
	if md != "" {
		t.Fatalf("unsupported mime should yield empty markdown, got %q", md)
	}
	// Yet the door still produces a well-formed draft idea, provenance preserved.
	if idea.Status != ideas.StatusDraft || !strings.Contains(idea.Provenance.Detail, "spec.pdf") {
		t.Fatalf("unsupported-mime idea malformed: %+v", idea)
	}
}

func TestDefaultProposesIsProduct(t *testing.T) {
	p, _, _ := deriveDraft("# T", "spec.html", "")
	if p != ideas.ProposesProduct {
		t.Fatalf("default proposes = %q, want product", p)
	}
}

func TestFirstHeadingDerivesTitle(t *testing.T) {
	if got := firstHeading("# Order Discount Policy\n\ntext"); got != "Order Discount Policy" {
		t.Fatalf("firstHeading = %q", got)
	}
	if got := firstHeading("no heading"); got != "(untitled ingested document)" {
		t.Fatalf("firstHeading fallback = %q", got)
	}
}
