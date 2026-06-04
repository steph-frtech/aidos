// generate.go — BA17: the LLM as the SINGLE GATED EXCEPTION, isolated to ONE function behind
// the ActionGenerator seam.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The ENTIRE build-agent loop is deterministic code —
// the gate (BA13), the post-check (BA16), the sandbox boundaries (this step), the budget
// meter (BA11), the role-matching, the conflict resolution. The ONLY irreducible
// non-determinism is the model's generation of the next action; it is confined to ONE method
// — GenerateAction(impl, transcript) — behind ONE interface, ActionGenerator. Everything else
// is code and the code WINS: the generator only PROPOSES the next action; the gate decides
// before, the post-check decides after, the sandbox confines, the budget caps. The agent
// defers to the function, never the reverse.
//
// THE RENAME (gap K1). The seam is ActionGenerator, NOT "Provider": agentlayer.Provider is
// the closed ENUM of model vendors (anthropic/openai/google). Naming the seam Provider would
// collide. ActionGenerator is the BEHAVIOUR (generate the next action); agentlayer.Provider is
// the DECLARED vendor the production generator dispatches on.
//
// THE ARCH-FITNESS RULE (BA14) keeps any concrete LLM SDK out of every package but
// back/runtime/agentloop/provider. The production ActionGenerator wraps a provider.Provider
// (the one place an SDK is imported); this package declares only the SEAM + a deterministic
// FAKE, so it imports NO SDK. The fake makes the loop provable without a live model.
//
// THE STREAMING HARD-STOP (gap G3). The provider cooperates to CANCEL the stream the instant
// the emitted token count crosses the declared cap — HardStop(emitted, cap) is the pure
// predicate the streaming loop consults per chunk. A runaway generation can never exceed the
// budget by streaming forever: the hard-stop truncates at the boundary.
package agentimpl

import (
	"context"
	"strings"
)

// Transcript is the deterministic INPUT to GenerateAction — the system prompt (assembled by
// AssembleSystemPrompt, BA04) plus the ordered turns so far. It is the ONLY context the LLM
// exception receives; nothing else from the layer leaks in (the prompt is the confined
// surface). Pure data: same Transcript ⇒ the deterministic fake returns the same reply.
type Transcript struct {
	System string   `json:"system"`
	Turns  []string `json:"turns"`
}

// Generated is one reply from the LLM exception: the generated text, the token count emitted
// (after any hard-stop), and whether the stream was TRUNCATED at the token cap (the G3
// hard-stop fired). Truncated:true means the model would have emitted more but the cap cut it.
type Generated struct {
	Text      string `json:"text"`
	Tokens    int    `json:"tokens"`
	Truncated bool   `json:"truncated"`
}

// ActionGenerator is the SINGLE seam the LLM hides behind (renamed from "Provider" to avoid
// the agentlayer.Provider enum collision, gap K1). GenerateAction is the ONLY function in all
// of AIDOS permitted to consult a live model; everything else is deterministic code. The
// production implementation wraps a provider.Provider (the one SDK-importing package, kept
// isolated by the BA14 arch-fitness rule); the tests pass a deterministic FakeGenerator.
type ActionGenerator interface {
	// GenerateAction asks the model for the next action given the resolved impl (its declared
	// knobs — temperature/seed/token cap) and the transcript so far. It is the gated exception:
	// the gate decided BEFORE, the post-check decides AFTER — this only PROPOSES.
	GenerateAction(ctx context.Context, impl AgentImplementation, tr Transcript) (Generated, error)
}

// HardStop is the PURE streaming hard-stop predicate (gap G3): given the tokens emitted so
// far and the declared cap, should the stream be CANCELLED now? A zero (or negative) cap
// means "no cap declared" — never stop. A positive cap stops the instant emitted >= cap.
// Pure, total, deterministic — the streaming loop consults it per chunk so a runaway
// generation can never exceed the budget by streaming forever.
func HardStop(emitted, cap int) bool {
	if cap <= 0 {
		return false
	}
	return emitted >= cap
}

// FakeGenerator is the DETERMINISTIC mock ActionGenerator — the stand-in for a live model so
// the loop + sandbox are provable without an SDK (the keystone of the BA17 fixture). It is a
// PURE FUNCTION of its input: the reply index is the number of turns already in the transcript
// (so the SAME transcript always yields the SAME reply — replay-deterministic, never a hidden
// call-counter). When TokenCap > 0 it streams the reply token by token and HARD-STOPS at the
// cap (proving the G3 seam), truncating and marking Truncated. It imports no SDK — it is pure
// data + a loop, so a VALUE FakeGenerator satisfies ActionGenerator (no mutable state).
type FakeGenerator struct {
	Replies []string
	// TokenCap caps the streamed tokens of each reply (the G3 hard-stop). 0 ⇒ no cap.
	TokenCap int
}

// GenerateAction returns the scripted reply at index len(transcript.Turns) (so the same
// transcript ⇒ the same reply — deterministic, replay-safe, no hidden counter), streaming it
// token by token under the declared token cap (hard-stopping at the boundary). An exhausted
// script returns an empty reply (the agent has nothing more to say). The fake never touches a
// network or a model — it is the gated exception's deterministic double.
func (f FakeGenerator) GenerateAction(_ context.Context, _ AgentImplementation, tr Transcript) (Generated, error) {
	idx := len(tr.Turns)
	if idx < 0 || idx >= len(f.Replies) {
		return Generated{}, nil
	}
	reply := f.Replies[idx]

	// The effective cap is the fake's TokenCap if set, else the impl's declared cap proxy
	// (MaxTurns is NOT a token cap; the fake's own TokenCap is authoritative for the stream).
	cap := f.TokenCap

	// Stream token by token (whitespace-delimited — a deterministic, SDK-free tokenizer), and
	// HARD-STOP at the cap. The pure HardStop predicate decides per token.
	toks := strings.Fields(reply)
	emitted := make([]string, 0, len(toks))
	truncated := false
	for _, tok := range toks {
		if HardStop(len(emitted), cap) {
			truncated = true
			break
		}
		emitted = append(emitted, tok)
	}
	// A single-token (no-whitespace) reply with cap 0 keeps its text verbatim.
	text := strings.Join(emitted, " ")
	if cap <= 0 {
		text = reply
		emitted = toks
	}
	return Generated{Text: text, Tokens: len(emitted), Truncated: truncated}, nil
}

// statically assert a VALUE FakeGenerator satisfies the seam (it is pure — no mutable state —
// so it implements ActionGenerator by value, the form the fixture passes).
var _ ActionGenerator = FakeGenerator{}
