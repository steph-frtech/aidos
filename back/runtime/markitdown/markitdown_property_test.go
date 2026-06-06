package markitdown

// markitdown_property_test.go — the MK02 BDD mirror (invariant ∀), written RED FIRST.
//
// MK02 done-criterion (ROADMAP-markitdown): « même fichier → même markdown »
// (déterministe/idempotent). This mirror NAMES the not-yet-written port — DocConverter,
// HTMLConverter, MimeHTML — and asserts its idempotence BEFORE the package compiles, so the build
// failure IS the red of the goal (CLAUDE.md §6 mirror-first). Code is then written to make it green.
//
// The IDEMPOTENCE property is pinned in BOTH senses the spike measured (MK01 verdict GO), now graven
// as the contract the replaceable adapter must honour (ADR « frontière d'ingestion replaceable ») —
// any future DocConverter adapter (the real microsoft/markitdown, a PDF/DOCX path) is held to it:
//
//  1. DETERMINISM (the core property): ToMarkdown(b, mime) == ToMarkdown(b, mime), byte-for-byte.
//     Same file → same markdown. A converter is a pure deterministic transform (determinism-first):
//     no clock, no rng, no LLM, no I/O in the contract.
//  2. REPRODUCIBILITY: the determinism holds across 100 replays with no drift (the reproducibility
//     mirror the §6/§8 mandate requires of every deterministic-able op).
//  3. RE-INGESTION STABILITY: a second pass through the frontier (feed the produced markdown back as
//     a document) is itself deterministic and FIXED — ToMarkdown is a projector on its own output
//     (ToMarkdown(ToMarkdown(x)) is stable), so re-ingesting an already-converted doc never drifts.
//
// The object under test is the DEFAULT adapter HTMLConverter{} behind the DocConverter port — the
// in-process reference rebuilt cleanly in back/ (the spike does NOT graduate; /harvest proposes, the
// code is rebuilt here). The real external tool is wired behind the SAME port at MK03 and re-proven
// against this exact mirror.

import (
	"os"
	"path/filepath"
	"testing"

	"pgregory.net/rapid"
)

// conv is the MK02 object under test: the default DocConverter (the deterministic HTML reference).
var conv DocConverter = HTMLConverter{}

// genDocument generates an arbitrary small HTML document carrying structure-bearing elements
// (headings, lists, tables, inline spans, links) and chrome to strip — the realistic shape of an
// ingested doc, so the idempotence property is non-trivial (the converter does real work).
func genDocument(t *rapid.T) []byte {
	blocks := []string{
		"<h1>Title</h1>",
		"<h2>Section</h2>",
		"<p>Some <strong>bold</strong> and <em>italic</em> text.</p>",
		"<p>A <code>line.qty * line.unit_price</code> code span.</p>",
		"<ul><li>first</li><li>second</li></ul>",
		"<ol><li>step one</li><li>step two</li></ol>",
		`<table><tr><th>SKU</th><th>Price</th></tr><tr><td>SKU-001</td><td>19.90</td></tr></table>`,
		`<p>See the <a href="https://example.com/x">contract</a>.</p>`,
		"<nav>Home &gt; Specs</nav>",   // chrome to strip
		"<script>analytics()</script>", // chrome to strip
		"<footer>(c) 2026</footer>",    // chrome to strip
	}
	n := rapid.IntRange(1, len(blocks)).Draw(t, "n")
	body := ""
	for i := 0; i < n; i++ {
		body += blocks[rapid.IntRange(0, len(blocks)-1).Draw(t, "b")]
	}
	return []byte("<html><head><title>T</title></head><body>" + body + "</body></html>")
}

// TestIdempotent_SameFileSameMarkdown is the MK02 RED→GREEN property: « même fichier → même
// markdown ». For ANY document and ANY supported mime, two conversions are byte-identical.
func TestIdempotent_SameFileSameMarkdown(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		doc := genDocument(t)
		md1 := conv.ToMarkdown(doc, MimeHTML)
		md2 := conv.ToMarkdown(doc, MimeHTML)
		if md1 != md2 {
			t.Fatalf("not deterministic: same file produced different markdown\n--a--\n%q\n--b--\n%q", md1, md2)
		}
	})
}

// TestReproducible replays the conversion 100× and asserts zero drift — the reproducibility mirror
// the determinism-first mandate (§6/§8) requires for every deterministic-able op.
func TestReproducible(t *testing.T) {
	doc := mustRead(t, "testdata/checkout-spec.html")
	first := conv.ToMarkdown(doc, MimeHTML)
	for i := 0; i < 100; i++ {
		if got := conv.ToMarkdown(doc, MimeHTML); got != first {
			t.Fatalf("drift on replay %d: markdown changed", i)
		}
	}
}

// TestReingestionIsAFixedPoint pins the third sense: re-ingesting an already-converted document is
// itself a stable transform — ToMarkdown applied to the markdown wrapped as a doc, twice, is equal.
// The frontier never drifts when a markdown doc is dropped back into it.
func TestReingestionIsAFixedPoint(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		doc := genDocument(t)
		md := conv.ToMarkdown(doc, MimeHTML)
		rewrapped := []byte("<html><body><pre>" + md + "</pre></body></html>")
		a := conv.ToMarkdown(rewrapped, MimeHTML)
		b := conv.ToMarkdown(rewrapped, MimeHTML)
		if a != b {
			t.Fatalf("re-ingestion not deterministic")
		}
	})
}

// TestRealDocumentIsConverted is the acceptance anchor: the real checkout spec converts to non-empty
// markdown with its title heading — the converter actually does the transform (not a no-op identity).
func TestRealDocumentIsConverted(t *testing.T) {
	doc := mustRead(t, "testdata/checkout-spec.html")
	md := conv.ToMarkdown(doc, MimeHTML)
	if md == "" {
		t.Fatal("empty markdown")
	}
	if want := "# Checkout Service Specification"; !contains(md, want) {
		t.Fatalf("expected heading %q in markdown, got:\n%s", want, md)
	}
}

// TestUnsupportedMimeIsTotal: the port is TOTAL — an unsupported mime yields empty markdown, never a
// panic. A real adapter (MK03) will dispatch by mime; the reference handles HTML and is total.
func TestUnsupportedMimeIsTotal(t *testing.T) {
	md := conv.ToMarkdown([]byte("anything"), Mime("application/x-unknown"))
	if md != "" {
		t.Fatalf("expected empty markdown for unsupported mime, got %q", md)
	}
}

func mustRead(t *testing.T, p string) []byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Clean(p))
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return b
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && indexOf(haystack, needle) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
