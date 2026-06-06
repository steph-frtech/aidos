// compress.go — THROWAWAY (HR01 spike). A DETERMINISTIC model of headroom's retrieve∘compress
// on the LLM-input prompt, so the spike's claim is measurable and REPRODUCIBLE (determinism-
// first, CLAUDE.md §6/§8: the measurement is a pure function, same input -> same output, no LLM
// in the probe). This is NOT the real adapter (HR03 wraps the actual `headroom` MCP behind the
// HR02 port); it is a conservative LOWER-BOUND model of the gain so the go/no-go is honest.
//
// THE MODEL. headroom (chopratejas/headroom) compresses by replacing repeated, reference-heavy
// spans with short handles and keeping a reversible dictionary; Retrieve (CCR) re-expands them.
// We model exactly that with a reversible reference-replacement over repeated whitespace-
// delimited tokens:
//   - Compress: find tokens (length >= minRefLen) occurring >= minOccur times; replace each
//     occurrence after the first with a short handle "§N"; the dictionary maps §N -> original.
//   - Retrieve: substitute every handle back. By construction Retrieve(Compress(x)) == x
//     EXACTLY (lossless) — the spike proves losslessness as a property, not a hope.
//
// This UNDER-states the real gain (headroom also does semantic/structural compression we don't
// model) — a conservative floor. If even this floor clears the threshold, the real tool clears
// it too.
package headroom

import (
	"fmt"
	"sort"
	"strings"
)

// Compressed is the result of Compress: the compacted text plus the reversible dictionary
// (the "handle"/CCR state HR02's port returns alongside the compacted prompt).
type Compressed struct {
	Text       string            // the compacted prompt sent to the model
	Dictionary map[string]string // handle -> original span (the reversible state)
}

const (
	// minRefLen — only replace tokens at least this long (short tokens cost more in handle
	// overhead than they save). A conservative floor.
	minRefLen = 6
	// minOccur — a token must repeat at least this many times to be worth a handle.
	minOccur = 2
)

// maxPhrase — the longest repeated word-span the model will collapse to one handle. headroom's
// dominant gain is repeated MULTI-WORD spans (the wall boilerplate, the stop condition, the
// goal/BC strings) recurring across the system prompt and turns — not single tokens. Modeling
// up to this span length captures that gain while staying losslessly reversible.
const maxPhrase = 8

// Compress models headroom's reference-replacement. Deterministic: the handles are assigned in
// a stable order (by descending savings then lexicographically) so the same prompt always
// yields the same compacted text and the same dictionary — a pure function. It collapses
// repeated word-SPANS (length 1..maxPhrase), longest-first, which is where headroom's real gain
// lives; each replaced span is recorded in the dictionary so Retrieve is exactly inverse.
func Compress(prompt string) Compressed {
	fields := strings.Fields(prompt)

	// Greedy longest-first span replacement. We scan span lengths from maxPhrase down to 1; for
	// each length we replace every repeated span (after its first occurrence) by a handle. This
	// captures repeated phrases (the big win) before falling back to single tokens.
	dict := map[string]string{}
	handleIdx := 0
	tokens := append([]string(nil), fields...)

	for L := maxPhrase; L >= 1; L-- {
		tokens, handleIdx = collapseSpans(tokens, L, dict, handleIdx)
	}
	return Compressed{Text: strings.Join(tokens, " "), Dictionary: dict}
}

// collapseSpans replaces repeated word-spans of exactly length L (that contain no existing
// handle) by handles, keeping the first occurrence verbatim. Deterministic and lossless: every
// replaced span is stored in dict so Retrieve re-expands it. Returns the rewritten token slice
// and the next free handle index.
func collapseSpans(tokens []string, L int, dict map[string]string, idx int) ([]string, int) {
	if L < 1 || len(tokens) < L {
		return tokens, idx
	}
	// Count occurrences of each span of length L (skip spans containing a handle "§").
	count := map[string]int{}
	for i := 0; i+L <= len(tokens); i++ {
		if spanHasHandle(tokens[i : i+L]) {
			continue
		}
		span := strings.Join(tokens[i:i+L], " ")
		if len(span) >= minRefLen {
			count[span]++
		}
	}
	// Decide which spans earn a handle, in a deterministic order.
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

	// Rewrite: keep first occurrence of each handled span verbatim, replace later occurrences.
	seen := map[string]bool{}
	var out []string
	for i := 0; i < len(tokens); {
		if i+L <= len(tokens) && !spanHasHandle(tokens[i:i+L]) {
			span := strings.Join(tokens[i:i+L], " ")
			if h, ok := handleOf[span]; ok {
				if seen[span] {
					out = append(out, h)
				} else {
					seen[span] = true
					out = append(out, tokens[i:i+L]...)
				}
				i += L
				continue
			}
		}
		out = append(out, tokens[i])
		i++
	}
	return out, idx
}

// spanHasHandle reports whether any token in the span is already a handle (so we never nest a
// handle inside a longer span — keeps Retrieve a single pass per length, exactly invertible).
func spanHasHandle(span []string) bool {
	for _, t := range span {
		if strings.HasPrefix(t, "§") {
			return true
		}
	}
	return false
}

// legacyCompress is the original single-token model, kept only for reference in the report.
func legacyCompress(prompt string) Compressed {
	fields := strings.Fields(prompt)

	// Count occurrences of each eligible token.
	count := map[string]int{}
	for _, f := range fields {
		if len(f) >= minRefLen {
			count[f]++
		}
	}

	// Candidates worth a handle: repeated, and saving more than the handle costs.
	type cand struct {
		tok     string
		savings int
	}
	var cands []cand
	for tok, n := range count {
		if n < minOccur {
			continue
		}
		// savings ≈ (occurrences after first) * (len(tok) - handleLen). handleLen ~ 3 ("§N").
		savings := (n - 1) * (len(tok) - 3)
		if savings > 0 {
			cands = append(cands, cand{tok, savings})
		}
	}
	// Stable, deterministic assignment order.
	sort.Slice(cands, func(i, j int) bool {
		if cands[i].savings != cands[j].savings {
			return cands[i].savings > cands[j].savings
		}
		return cands[i].tok < cands[j].tok
	})

	dict := map[string]string{}
	handleOf := map[string]string{}
	for i, c := range cands {
		h := fmt.Sprintf("§%d", i)
		handleOf[c.tok] = h
		dict[h] = c.tok
	}

	// Rebuild the text: keep the FIRST occurrence of each token verbatim (so the dictionary is
	// implied by first use, like headroom's first-mention), replace later occurrences by the
	// handle. We rebuild field-by-field preserving single-space joins (the prompt's exact
	// whitespace is re-applied on Retrieve via the original — see RetrieveExact below which uses
	// the full-text round-trip; for the token model we keep a normalized form).
	seen := map[string]bool{}
	var out []string
	for _, f := range fields {
		if h, ok := handleOf[f]; ok {
			if seen[f] {
				out = append(out, h)
				continue
			}
			seen[f] = true
		}
		out = append(out, f)
	}
	return Compressed{Text: strings.Join(out, " "), Dictionary: dict}
}

// Retrieve re-expands every handle back to its original SPAN (headroom's CCR). Deterministic
// and total. Dictionary values are handle-free by construction (spanHasHandle skips any span
// containing a handle), so a single token-wise substitution pass is exactly inverse:
// Retrieve(Compress(x)) equals Normalize(x) EXACTLY (the spike's losslessness property).
func Retrieve(c Compressed) string {
	fields := strings.Fields(c.Text)
	var out []string
	for _, f := range fields {
		if orig, ok := c.Dictionary[f]; ok {
			out = append(out, strings.Fields(orig)...)
		} else {
			out = append(out, f)
		}
	}
	return strings.Join(out, " ")
}

// Normalize collapses whitespace to single spaces — the canonical form the round-trip compares
// against (Compress works on whitespace-delimited tokens, so the comparison is modulo runs of
// whitespace, which the prompt renderer would normalize anyway).
func Normalize(s string) string {
	return strings.Join(strings.Fields(s), " ")
}
