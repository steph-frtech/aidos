// compressor.go — the HR02 ContextCompressor PORT (ADR 0035). The Runtime compresses the
// LLM-INPUT (the rendered ContextPack + transcript) BEFORE the model, to extend the margin
// UNDER the budget cap (HR04) — it never relieves the cap, never touches the deterministic
// inputs nor the truth-store. The port is REPLACEABLE (CLAUDE.md §3): the concrete tool
// (chopratejas/headroom, branched in HR03 behind this same interface) is an adapter, not a
// truth.
//
// THE WALL (CLAUDE.md §2): this port is PURE and below the line. It reads the prompt it is
// handed and returns a Compacted + a Handle; it writes NO truth (kernel/mirrors/fitness), has
// no DB, no clock, no rng, no I/O and NO LLM in the contract. The HR03 adapter does the
// sidecar I/O; the port keeps a DETERMINISTIC reference implementation (ReferenceCompressor)
// that the property mirror certifies.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): compression of the LLM input is the GATED exception —
// it is never authoritative; the gate verdict (HR03) must stay invariant to it. The reference
// implementation itself is a pure, reproducible function (same input → same Compacted + same
// Handle), proven by TestReproducible.
package context

import (
	"fmt"
	"sort"
	"strings"
)

// ContextCompressor is the HR02 port (ADR 0035 §2): two total operations.
//
//	Compress(prompt) → (Compacted, Handle)   // compact the LLM input + the reversible state
//	Retrieve(handle) → original              // re-expand to the original (CCR)
//
// The load-bearing contract (the property mirror): Retrieve(Compress(x)) == Normalize(x) for
// every x — Retrieve gives back the original. The Handle is the reversible state that travels
// alongside the Compacted; it lives nowhere else.
type ContextCompressor interface {
	// Compress compacts the rendered LLM-input prompt and returns the reversible Handle.
	Compress(prompt string) (Compacted, Handle)
	// Retrieve re-expands a Handle back to the original prompt (modulo whitespace
	// normalization). Total: a zero/empty Handle Retrieves to its own (empty) text.
	Retrieve(handle Handle) string
}

// Compacted is the compressed LLM-input prompt the model actually receives.
type Compacted struct {
	// Text is the compacted prompt (handles substituted for repeated spans).
	Text string `json:"text"`
}

// Handle is the reversible state (the CCR dictionary) that, together with the Compacted text,
// lets Retrieve reconstruct the original. It is self-sufficient: Retrieve needs only the
// Handle, and the Handle carries its own compacted text so it can be re-expanded standalone.
type Handle struct {
	// Text is the compacted text this handle expands (so Retrieve(handle) is self-contained).
	Text string `json:"text"`
	// Dictionary maps each handle token ("§N") to the original span it replaced.
	Dictionary map[string]string `json:"dictionary"`
}

const (
	// minRefLen — only collapse spans at least this many chars long; shorter spans cost more
	// in handle overhead than they save (a conservative floor, matching the HR01 spike model).
	minRefLen = 6
	// minOccur — a span must repeat at least this many times to earn a handle.
	minOccur = 2
	// maxPhrase — the longest repeated word-span collapsed to one handle. The dominant gain is
	// repeated MULTI-WORD spans (the wall boilerplate, the stop condition) recurring across the
	// prompt — collapsing up to this length captures that while staying losslessly reversible.
	maxPhrase = 8
)

// ReferenceCompressor is the HR02 default, DETERMINISTIC, BYTE-LOSSLESS implementation of the
// port (ADR 0035 §5): reference-replacement reconstructed cleanly in back/ from the HR01 spike
// model (the spike does not graduate; the code is rebuilt). It replaces repeated word-spans by
// short handles "§N" — longest-first, in a stable order — and records each in the dictionary
// so Retrieve is exactly inverse. The HR03 adapter (headroom sidecar) is a second implementation
// of the SAME interface.
type ReferenceCompressor struct{}

// Compress models reference-replacement. Pure and deterministic: handles are assigned in a
// stable order (descending savings, then lexicographic) so the same prompt always yields the
// same Compacted and the same Handle. Collapses repeated word-spans of length maxPhrase..1,
// longest-first.
func (ReferenceCompressor) Compress(prompt string) (Compacted, Handle) {
	fields := strings.Fields(prompt)
	dict := map[string]string{}
	handleIdx := 0
	tokens := append([]string(nil), fields...)

	for l := maxPhrase; l >= 1; l-- {
		tokens, handleIdx = collapseSpans(tokens, l, dict, handleIdx)
	}
	text := strings.Join(tokens, " ")
	return Compacted{Text: text}, Handle{Text: text, Dictionary: dict}
}

// Retrieve re-expands every handle token in the Handle's text back to its original span (CCR).
// Total and deterministic. Dictionary values are handle-free by construction (collapseSpans
// skips any span containing a handle), so a single token-wise substitution pass is exactly
// inverse: Retrieve(Compress(x)) == Normalize(x).
func (ReferenceCompressor) Retrieve(handle Handle) string {
	fields := strings.Fields(handle.Text)
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if orig, ok := handle.Dictionary[f]; ok {
			out = append(out, strings.Fields(orig)...)
		} else {
			out = append(out, f)
		}
	}
	return strings.Join(out, " ")
}

// Normalize collapses runs of whitespace to single spaces — the canonical form the round-trip
// compares against (Compress works on whitespace-delimited tokens, a normalization the prompt
// renderer applies anyway).
func Normalize(s string) string { return strings.Join(strings.Fields(s), " ") }

// collapseSpans replaces repeated word-spans of exactly length l (containing no existing
// handle) by handles, keeping the first occurrence verbatim. Deterministic and lossless: every
// replaced span is stored in dict so Retrieve re-expands it. Returns the rewritten tokens and
// the next free handle index.
func collapseSpans(tokens []string, l int, dict map[string]string, idx int) ([]string, int) {
	if l < 1 || len(tokens) < l {
		return tokens, idx
	}
	count := map[string]int{}
	for i := 0; i+l <= len(tokens); i++ {
		if spanHasHandle(tokens[i : i+l]) {
			continue
		}
		span := strings.Join(tokens[i:i+l], " ")
		if len(span) >= minRefLen {
			count[span]++
		}
	}
	type cand struct {
		span    string
		savings int
	}
	var cands []cand
	for span, n := range count {
		if n < minOccur {
			continue
		}
		savings := (n - 1) * (len(span) - 3)
		if savings > 0 {
			cands = append(cands, cand{span, savings})
		}
	}
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].savings != cands[j].savings {
			return cands[i].savings > cands[j].savings
		}
		return cands[i].span < cands[j].span
	})

	handleOf := map[string]string{}
	for _, c := range cands {
		h := fmt.Sprintf("§%d", idx)
		idx++
		handleOf[c.span] = h
		dict[h] = c.span
	}
	if len(handleOf) == 0 {
		return tokens, idx
	}

	seen := map[string]bool{}
	var out []string
	for i := 0; i < len(tokens); {
		if i+l <= len(tokens) && !spanHasHandle(tokens[i:i+l]) {
			span := strings.Join(tokens[i:i+l], " ")
			if h, ok := handleOf[span]; ok {
				if seen[span] {
					out = append(out, h)
				} else {
					seen[span] = true
					out = append(out, tokens[i:i+l]...)
				}
				i += l
				continue
			}
		}
		out = append(out, tokens[i])
		i++
	}
	return out, idx
}

// spanHasHandle reports whether any token in the span is already a handle, so we never nest a
// handle inside a longer span (keeps Retrieve a single pass per length, exactly invertible).
func spanHasHandle(span []string) bool {
	for _, t := range span {
		if strings.HasPrefix(t, "§") {
			return true
		}
	}
	return false
}
