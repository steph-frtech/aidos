package context

// compressor_property_test.go — the BDD mirror (invariant ∀) for the HR02 ContextCompressor
// port (ADR 0035). Written RED FIRST: it names ContextCompressor / ReferenceCompressor /
// Compacted / Handle before they exist, so the package does not compile — that compile failure
// IS the red of the goal (CLAUDE.md §6 mirror-first). Code is then written to make it green.
//
// The contract proven here (ADR 0035 §2/§5/§6), as an invariant over arbitrary LLM-input text:
//
//   1. Retrieve∘Compress = identity (byte-lossless modulo whitespace normalization) — Retrieve
//      gives back the original. This is the load-bearing contract of the port.
//   2. The Handle is idempotent: recompressing an already-compacted prompt with its handle
//      yields the same compacted text and the same handle (no new reduction to find).
//   3. The empty handle Retrieves to the input unchanged (a total function, no nil panic).
//   4. Determinism / reproducibility (determinism-first mirror): same input → same Compacted
//      and same Handle, replayed many times — a pure function, never an LLM.
//   5. Carrier facts survive: the load-bearing facts of a ContextPack are present after
//      retrieve∘compress (no fact lost — losing one makes the agent invent or breach the wall).

import (
	"testing"

	"pgregory.net/rapid"
)

// genPrompt generates arbitrary, repetition-prone LLM-input text — words drawn from a small
// vocabulary so spans repeat (the shape the compressor targets), plus arbitrary lengths.
func genPrompt(t *rapid.T) string {
	vocab := []string{
		"checkout", "promo-field", "applyPromo", "/kernel/**", "/mirror/**",
		"the", "wall", "red", "mirror", "goal", "stop", "condition", "pack_hash",
		"bounded_context", "allowed_paths", "forbidden_paths", "idea", "/goal",
	}
	n := rapid.IntRange(0, 60).Draw(t, "n")
	words := make([]string, n)
	for i := range words {
		words[i] = vocab[rapid.IntRange(0, len(vocab)-1).Draw(t, "w")]
	}
	out := ""
	for i, w := range words {
		if i > 0 {
			out += " "
		}
		out += w
	}
	return out
}

// TestRetrieveInvertsCompress — the load-bearing invariant: Retrieve(Compress(x)) == Normalize(x)
// for every prompt x. The compacted form is reversible (CCR), never lossy at the byte level.
func TestRetrieveInvertsCompress(t *testing.T) {
	var c ContextCompressor = ReferenceCompressor{}
	rapid.Check(t, func(t *rapid.T) {
		prompt := genPrompt(t)
		compacted, handle := c.Compress(prompt)
		got := c.Retrieve(handle)
		want := Normalize(prompt)
		if got != want {
			t.Fatalf("Retrieve∘Compress not identity:\n  compacted=%q\n  got =%q\n  want=%q", compacted.Text, got, want)
		}
	})
}

// TestHandleIdempotent — the handle is a deterministic FIXED POINT (ADR 0035 §6): compressing
// the retrieved original reproduces the SAME compacted text and the SAME handle. Equivalently
// Compress∘Retrieve∘Compress == Compress — re-running the port on its own output is stable, so
// the handle is self-sufficient and re-applying compression invents nothing new.
func TestHandleIdempotent(t *testing.T) {
	var c ContextCompressor = ReferenceCompressor{}
	rapid.Check(t, func(t *rapid.T) {
		prompt := genPrompt(t)
		c1, h1 := c.Compress(prompt)
		// Retrieve back to the original, then compress again: must reproduce the same compacted
		// text and the same handle (a fixed point — the compressor is a stable pure function).
		c2, h2 := c.Compress(c.Retrieve(h1))
		if c2.Text != c1.Text {
			t.Fatalf("handle not a fixed point (compacted differs):\n  %q\n  %q", c1.Text, c2.Text)
		}
		if !sameDict(h2.Dictionary, h1.Dictionary) {
			t.Fatalf("handle not a fixed point (dictionary differs):\n  %v\n  %v", h1.Dictionary, h2.Dictionary)
		}
		// And the handle still retrieves the original (lossless).
		if c.Retrieve(h1) != Normalize(prompt) {
			t.Fatalf("handle h1 does not retrieve original")
		}
	})
}

// TestEmptyHandleRetrievesInput — Retrieve of a handle with no entries returns the compacted
// text unchanged; the port is total (no nil-map panic on an empty/zero handle).
func TestEmptyHandleRetrievesInput(t *testing.T) {
	var c ContextCompressor = ReferenceCompressor{}
	// A prompt with no repeated spans compresses to itself with an empty dictionary.
	compacted, handle := c.Compress("a b c d e f g")
	if len(handle.Dictionary) != 0 {
		t.Fatalf("expected empty dictionary for non-repeating prompt, got %v", handle.Dictionary)
	}
	if c.Retrieve(handle) != "a b c d e f g" {
		t.Fatalf("empty-handle Retrieve changed the text: %q", compacted.Text)
	}
	// A zero-value handle (nil dictionary) must not panic.
	var zero Handle
	if got := c.Retrieve(zero); got != "" {
		t.Fatalf("zero handle Retrieve: want empty, got %q", got)
	}
}

// TestReproducible — determinism-first mirror (CLAUDE.md §6/§8): same input → same Compacted
// AND same Handle, replayed 100×. The compressor is a pure function, never an LLM.
func TestReproducible(t *testing.T) {
	var c ContextCompressor = ReferenceCompressor{}
	prompt := exampleContextPack()
	c0, h0 := c.Compress(prompt)
	for i := 0; i < 100; i++ {
		ci, hi := c.Compress(prompt)
		if ci.Text != c0.Text {
			t.Fatalf("compacted not reproducible at replay %d", i)
		}
		if !sameDict(hi.Dictionary, h0.Dictionary) {
			t.Fatalf("handle dictionary not reproducible at replay %d", i)
		}
	}
}

// TestCarrierFactsSurvive — the load-bearing facts of a real ContextPack are present after
// retrieve∘compress. Losing any makes the agent invent or breach the wall (KRD "porteur").
func TestCarrierFactsSurvive(t *testing.T) {
	var c ContextCompressor = ReferenceCompressor{}
	prompt := exampleContextPack()
	compacted, handle := c.Compress(prompt)
	restored := c.Retrieve(handle)
	for _, fact := range carrierFacts() {
		if !contains(restored, fact) {
			t.Fatalf("carrier fact lost after retrieve∘compress: %q\n  compacted=%q", fact, compacted.Text)
		}
	}
}

func sameDict(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func contains(haystack, needle string) bool {
	return len(needle) == 0 || indexOf(haystack, needle) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
