// convert_test.go — THROWAWAY (MK01 spike). The EXECUTABLE falsifiability proof. A spike is exempt
// from mirror-first (KRD §84), but this test IS the falsifiability check — it answers "does
// converting a REAL document to markdown preserve its substance, and is the conversion idempotent?"
// with numbers, not hope. TestReproducible is the determinism-first reproducibility mirror.
package markitdown

import (
	"strings"
	"testing"
)

// TestSpikeVerdict runs the full spike on the real fixture and PRINTS the report. It fails only if
// the spike is internally inconsistent (claims GO while a guard is violated) — the GO/NO-GO verdict
// itself is data the spike reports, not a pass/fail of the test.
func TestSpikeVerdict(t *testing.T) {
	v := Decide()

	t.Logf("=== MK01 SPIKE — markitdown ingestion frontier: real document -> markdown -> idea draft ===")
	t.Logf("[FIDELITY] carriers found=%d/%d (%.1f%%, floor=%.1f%%)  missing=%v",
		v.Fidelity.Found, v.Fidelity.Total, v.Fidelity.Frac*100, v.FidelityFloor*100, v.Fidelity.Missing)
	t.Logf("[IDEMPOTENCE] deterministic=%v  md-hash=%s  reingest-stable=%v (reingest fidelity=%.1f%%)",
		v.Idempotence.Deterministic, v.Idempotence.Hash, v.Idempotence.ReingestStable, v.Idempotence.ReingestFidelity.Frac*100)
	t.Logf("[IDEA DRAFT] title=%q  status=%s  source-hash=%s  md-hash=%s  provenance=%q",
		v.Draft.Title, v.Draft.Status, v.Draft.SourceHash, v.Draft.MarkdownHash, v.Draft.Provenance)
	t.Logf("[WALL] respected=%v (candidate-truth, never a kernel write)  reproducible=%v", v.WallRespected, v.Reproducible)
	t.Logf("VERDICT: GO=%v — %s", v.Go, v.Rationale)

	if v.Go && (v.Fidelity.Frac < v.FidelityFloor || !v.Idempotence.Deterministic || !v.Idempotence.ReingestStable || !v.Reproducible || !v.WallRespected) {
		t.Fatalf("inconsistent verdict: GO but a guard is violated %+v", v)
	}
}

// TestConversionIsFaithful is the central fidelity claim: every declared carrier fact survives the
// conversion of the real document.
func TestConversionIsFaithful(t *testing.T) {
	md := ToMarkdown(fixtureHTML)
	f := MeasureFidelity(md)
	if f.Frac < FidelityFloor {
		t.Errorf("fidelity %.3f < floor %.3f; missing carriers: %v", f.Frac, FidelityFloor, f.Missing)
	}
}

// TestConversionDropsChrome asserts presentation-only noise (script bodies, the analytics line, the
// footer copyright wrapper) does NOT leak into the markdown — the frontier keeps substance, drops chrome.
func TestConversionDropsChrome(t *testing.T) {
	md := ToMarkdown(fixtureHTML)
	for _, noise := range []string{"nav analytics", "console.log", "font-family", "<script", "<style"} {
		if strings.Contains(md, noise) {
			t.Errorf("chrome leaked into markdown: %q", noise)
		}
	}
}

// TestMarkdownStructure asserts the conversion produced real markdown structure (a heading, a
// bulleted list item, an ordered step, a table row, an inline link, a code span) — not flattened text.
func TestMarkdownStructure(t *testing.T) {
	md := ToMarkdown(fixtureHTML)
	wants := []string{
		"# Checkout Service Specification",  // h1
		"## 1. Cart Invariants",             // h2
		"- A cart line quantity",            // ul item
		"1. Validate the cart is non-empty", // ol item
		"| SKU | Unit price",                // table header
		"| --- |",                           // table separator
		"`line.qty * line.unit_price`",      // code span
		"[PaymentGateway contract](https://example.com/payment-gateway)", // link
		"**checkout**",    // strong
		"*authoritative*", // em
	}
	for _, w := range wants {
		if !strings.Contains(md, w) {
			t.Errorf("expected markdown structure %q not found.\n--- got ---\n%s", w, md)
		}
	}
}

// TestDeterministic is one sense of idempotence: same bytes -> same markdown, byte-for-byte.
func TestDeterministic(t *testing.T) {
	a := ToMarkdown(fixtureHTML)
	b := ToMarkdown(fixtureHTML)
	if a != b {
		t.Fatal("ToMarkdown is not deterministic on identical input")
	}
}

// TestReingestionStable is the second sense of idempotence: feeding the produced markdown back
// through the frontier preserves every carrier — no progressive erosion of substance.
func TestReingestionStable(t *testing.T) {
	_, idem := MeasureIdempotence(fixtureHTML)
	if !idem.ReingestStable {
		t.Errorf("re-ingestion eroded carriers: reingest fidelity=%.3f < floor %.3f; missing=%v",
			idem.ReingestFidelity.Frac, FidelityFloor, idem.ReingestFidelity.Missing)
	}
}

// TestIdeaDraftRespectsWall asserts ingestion yields a CANDIDATE-truth (status=draft) with kept
// provenance + content hashes — never a kernel/mirror write. This is the wall, modelled.
func TestIdeaDraftRespectsWall(t *testing.T) {
	d := ToIdeaDraft(fixtureHTML, "checkout-spec.html")
	if d.Status != "draft" {
		t.Errorf("idea draft status %q != draft — ingestion must never freeze a truth", d.Status)
	}
	if d.Provenance == "" || d.SourceHash == "" || d.MarkdownHash == "" {
		t.Errorf("idea draft missing provenance/hashes: %+v", d)
	}
	if d.Title != "Checkout Service Specification" {
		t.Errorf("title not derived from first heading: %q", d.Title)
	}
}

// TestReproducible is the DETERMINISM-FIRST reproducibility mirror: the same source bytes yield the
// SAME markdown, the SAME hashes and the SAME verdict every time — the converter is a pure function,
// no LLM, no clock, no rng. Run 100x; any drift fails.
func TestReproducible(t *testing.T) {
	first := Decide()
	for i := 0; i < 100; i++ {
		v := Decide()
		if v.Go != first.Go ||
			v.Idempotence.Hash != first.Idempotence.Hash ||
			v.Draft.MarkdownHash != first.Draft.MarkdownHash ||
			v.Draft.SourceHash != first.Draft.SourceHash ||
			v.Fidelity.Frac != first.Fidelity.Frac {
			t.Fatalf("verdict not reproducible at iter %d: %+v vs %+v", i, v, first)
		}
	}
}
