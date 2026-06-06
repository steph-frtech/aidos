// compression.go — HR04: the ContextCompressor wired in FRONT of GenerateAction inside the
// loop, and its budget integration (S51/BA11/BA27). The Runtime compresses the LLM-INPUT
// (the rendered ContextPack + transcript) BEFORE the model, to extend the margin UNDER the
// budget cap — it never relieves the cap, never touches the deterministic inputs nor the
// truth-store (ADR 0035, HR02 port).
//
// WHAT HR04 ADDS over BA27 (the live meter + pre-call halt). BA27 charged the meter the turn's
// DECLARED Cost.Tokens. HR04 makes the token cost MEASURED from the actual LLM-input the turn
// feeds to generation: when a Compressor is wired AND the turn carries a Prompt, the loop
// compresses the prompt and charges the meter MeasureTokens(compacted) — strictly ≤ the raw
// token count (compression only removes tokens). Everything downstream (the pre-call halt, the
// gate's budget axis, CheckBudget, the economics feed) is unchanged: it simply sees a LOWER
// meter, so the run sits FURTHER below the SAME cap. The cap (EffectiveTokensCap, the min() of
// S29/S51, BA11) is byte-identical with and without compression — it is NEVER raised.
//
// THE GATE IS INVARIANT (HR03, the theorem). Compression changes the tokens MEASURED, never
// what the gate DECIDES: the action the loop derives from the prompt survives retrieve∘compress
// because the carrier facts survive (HR02). So an AgentRun replayed with and without compression
// records the SAME sequence of action verdicts (proven in compression_loop_fixture_test.go).
// Compression is the determinism-first GATED exception (CLAUDE.md §6/§8): never authoritative.
//
// DETERMINISM-FIRST. Token measurement is a PURE deterministic function (MeasureTokens — a
// whitespace token count, NOT an LLM tokenizer call: a count is a count, never an agent). The
// ReferenceCompressor is itself pure and reproducible (HR02). Same input ⇒ same (run, meter),
// pinned by the reproducibility mirror. No clock, no rng, no I/O, no live LLM on this path.
package agentloop

import (
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
)

// MeasureTokens is the PURE, DETERMINISTIC token measurer the loop charges to the meter: the
// count of whitespace-delimited tokens in the LLM-input. It is a COUNT, not an LLM tokenizer
// call (determinism-first, CLAUDE.md §6/§8): same input ⇒ same count, no I/O, no model. It is
// monotone under compression — the reference compressor only removes tokens (collapses repeated
// spans to a single handle), so MeasureTokens(Compress(x)) ≤ MeasureTokens(x) for every x. This
// is the unit the HR04 fixture proves drops with compression while the cap stays put.
func MeasureTokens(s string) int {
	return len(strings.Fields(s))
}

// turnTokenCost resolves the TOKEN cost the loop charges to the meter for one turn. The token
// cost is MEASURED from the actual LLM-input the turn feeds to generation whenever the turn
// carries a Prompt; HR04 compression simply decides whether that measurement is taken on the
// COMPRESSED or the RAW prompt:
//
//   - an EMPTY Prompt ⇒ the turn's DECLARED Cost.Tokens (the pre-HR04 path, every existing
//     fixture that scripts a flat token cost preserved unchanged);
//   - a non-empty Prompt, NO Compressor ⇒ MeasureTokens(Prompt): the honest "without
//     compression" baseline — the loop measures the raw LLM-input it would feed the model;
//   - a non-empty Prompt, a Compressor ⇒ MeasureTokens(Compress(Prompt)): the compressor runs
//     in FRONT of generation and the meter is charged the SMALLER compacted token count, so the
//     run sits FURTHER below the SAME cap. The gate verdict is invariant to this (HR03).
//
// MeasureTokens(Compress(p)) ≤ MeasureTokens(p) for every p (compression only removes tokens),
// so the compressed cost is never higher than the baseline — the cap is never relieved, only
// the margin under it grows. Pure: a function of (compressor, turn), no clock/rng/I/O beyond
// the (pure) compressor.
func turnTokenCost(c rctx.ContextCompressor, turn ScriptedTurn) int {
	if turn.Prompt == "" {
		return turn.Cost.Tokens
	}
	if c == nil {
		return MeasureTokens(turn.Prompt)
	}
	compacted, _ := c.Compress(turn.Prompt)
	return MeasureTokens(compacted.Text)
}

// turnDelta returns the turn's full cost delta with the TOKEN axis resolved through HR04
// compression (turnTokenCost); the other axes (turns, ci-minutes, wall-clock) are the declared
// deltas unchanged — compression touches only the LLM-input token count. This is the delta the
// loop projects onto the meter for the pre-call budget halt and then commits (BA27).
func turnDelta(c rctx.ContextCompressor, turn ScriptedTurn) agentimpl.RunDelta {
	d := turn.Cost
	d.Tokens = turnTokenCost(c, turn)
	return d
}
