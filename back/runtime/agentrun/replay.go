// replay.go — BA28: REPLAY + REDACTED transcript. Two pure, total functions extend the
// AgentRun runtime record so a run is REPRODUCIBLE and its persisted transcript is SAFE:
//
//   - Replay(run)               re-derives an IDENTICAL AgentRun (same content-address id) from
//     the fields the recorded run already carries — the runtime
//     extension of evolve's replay-by-seed discipline.
//   - Redact / RedactTranscript scrub known secret PATTERNS out of a provider transcript BEFORE
//     it is persisted, so the ledger (below the line) is NOT a secret
//     store (gap H1).
//
// REPLAY RE-DERIVES, IT DOES NOT RE-RUN (CLAUDE.md §6/§8). Replay does NOT call a live model:
// the recorded run already carries everything the content-address is computed over (impl, goal,
// red work item, context pack, seed, actions, result, timestamps, the redacted transcript ref).
// Replay re-stamps the id via records.Hash through the SAME recorder (Record) — REUSED, never
// forked. For any recorded run, Replay(run).ID == run.ID. A live re-run (re-feeding the
// recorded provider responses through the loop) is BA17's FakeGenerator territory; Replay is the
// cheap, model-free proof that the record is internally consistent and re-derivable.
//
// THE LEDGER IS NOT A SECRET STORE (CLAUDE.md §2, gap H1). The provider transcript persisted
// with a run includes the system prompt + ContextPack — which may carry the user-app's code,
// env and secrets. Redact runs BEFORE persistence: a known secret pattern present in the input
// NEVER appears verbatim in the output. The replay re-injects from the confined SOURCE (the
// live ContextPack), not from the log — the log holds only the redacted form. Redaction is
// deterministic (same input ⇒ same output) and idempotent (re-redacting is a fixed point), so a
// replay over a redacted transcript is itself reproducible.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Both functions are pure, total — no clock, no rng, no
// I/O, no LLM. Redaction is a deterministic regexp substitution over a CLOSED, DECLARED set of
// secret patterns (SecretPatterns); it is code, never a judgment call. The reproducibility mirror
// (replay_property_test.go) pins same-input ⇒ same-output for both.
package agentrun

import "regexp"

// Transcript is the deterministic provider transcript persisted with a run — the system prompt
// (assembled by agentimpl.AssembleSystemPrompt, BA04) plus the ordered turns. It MIRRORS
// agentimpl.Transcript (the loop's transcript shape) at the record edge; agentrun owns the
// REDACTED form that is safe to persist. Pure data.
type Transcript struct {
	System string   `json:"system"`
	Turns  []string `json:"turns"`
}

// REDACTED is the marker every scrubbed secret is replaced by. It is a fixed, non-secret token
// (so redaction is idempotent: REDACTED itself matches no secret pattern) and human-readable in
// the ledger ("a secret was here, scrubbed").
const REDACTED = "[REDACTED]"

// secretPattern pairs a NAME (for auditability) with the compiled regexp that recognises that
// class of secret. The set is CLOSED and DECLARED — redaction is a deterministic substitution
// over these patterns, never an LLM "find the secrets" judgment (determinism-first).
type secretPattern struct {
	Name string
	Re   *regexp.Regexp
}

// secretPatterns is the canonical, closed set of secret classes Redact scrubs. Each pattern is
// anchored to the secret's structural shape (a token prefix + body, a private-key header, a URL
// with embedded credentials) so it matches the secret WHEREVER it appears in surrounding text,
// and so a clean (no-secret) string is never touched. Ordered longest/most-specific first is not
// required — ReplaceAllString over each pattern in turn is order-independent for disjoint shapes,
// and the connection-string pattern is applied before the bare host so the whole URL is scrubbed.
var secretPatterns = []secretPattern{
	// A DB / service connection string carrying an embedded password (scrub the WHOLE URL, so the
	// password never survives). Applied first so the bare-token patterns do not partially match it.
	{Name: "conn_string", Re: regexp.MustCompile(`[a-zA-Z][a-zA-Z0-9+.-]*://[^\s:/@]+:[^\s:/@]+@[^\s]+`)},
	// A PEM private-key header (any -----BEGIN ... PRIVATE KEY----- line).
	{Name: "private_key_header", Re: regexp.MustCompile(`-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----`)},
	// Anthropic-style API keys: sk-ant-… or the generic sk-… secret-key shape.
	{Name: "anthropic_key", Re: regexp.MustCompile(`sk-(?:ant-)?[A-Za-z0-9_-]{8,}`)},
	// GitHub personal-access / app tokens: ghp_ / gho_ / ghs_ / ghu_ / ghr_ + body.
	{Name: "github_token", Re: regexp.MustCompile(`gh[poshru]_[A-Za-z0-9]{12,}`)},
	// AWS access-key ids: AKIA + 16 uppercase-alnum.
	{Name: "aws_access_key", Re: regexp.MustCompile(`AKIA[0-9A-Z]{12,}`)},
}

// SecretPatterns returns the NAMES of the closed secret-pattern set (for auditability / the UI
// and the front twin to single-source against). The patterns themselves are unexported (they are
// the deterministic substitution rules, not data to mutate).
func SecretPatterns() []string {
	names := make([]string, 0, len(secretPatterns))
	for _, p := range secretPatterns {
		names = append(names, p.Name)
	}
	return names
}

// Redact scrubs every known secret pattern out of s, replacing each match with REDACTED. PURE,
// TOTAL, DETERMINISTIC (same input ⇒ same output) and IDEMPOTENT (REDACTED matches no pattern, so
// Redact(Redact(s)) == Redact(s)). A clean string with no secret is returned unchanged — only the
// DECLARED secret shapes are touched, never arbitrary content. This is the gate (gap H1) that
// keeps the ledger from becoming a secret store: it runs BEFORE a transcript is persisted.
func Redact(s string) string {
	out := s
	for _, p := range secretPatterns {
		out = p.Re.ReplaceAllString(out, REDACTED)
	}
	return out
}

// RedactTranscript scrubs BOTH the system prompt and EVERY turn of a transcript — the whole
// confined surface — before persistence. It never mutates the input (it builds a fresh slice).
// Pure, total, deterministic, idempotent. The replay re-injects from the confined SOURCE; the
// persisted transcript holds only this redacted form.
func RedactTranscript(tr Transcript) Transcript {
	turns := make([]string, len(tr.Turns))
	for i, t := range tr.Turns {
		turns[i] = Redact(t)
	}
	return Transcript{System: Redact(tr.System), Turns: turns}
}

// Replay re-derives an IDENTICAL AgentRun from a recorded run: it re-stamps the content-address
// via the SAME recorder (Record → records.Hash, REUSED not forked) over the run's already-recorded
// fields. For any recorded run, Replay(run).ID == run.ID — the reproducibility guarantee BA28
// gives the runtime (evolve's replay-by-seed, descended to an AgentRun). It does NOT call a model:
// the record already carries the seed + redacted transcript ref + actions + result, so the
// re-derivation is pure and total. It returns ErrUnknownResult only if the recorded run somehow
// carries an out-of-enum result (Record's own guard, re-asserted). Writes no truth.
func Replay(run AgentRun) (AgentRun, error) {
	// Re-derive from the recorded body. We rebuild the run from its fields (dropping the stored id
	// — the id is the hash, recomputed) and re-Record. A faithfully recorded run re-derives to the
	// same id; a tampered run (a field changed after Record) would re-derive to a DIFFERENT id,
	// which is exactly the integrity signal a replay surfaces.
	rebuilt := AgentRun{
		Agent:              run.Agent,
		Goal:               run.Goal,
		RedWorkItem:        run.RedWorkItem,
		ContextPack:        run.ContextPack,
		Actions:            run.Actions,
		Result:             run.Result,
		StartedAt:          run.StartedAt,
		EndedAt:            run.EndedAt,
		Impl:               run.Impl,
		Seed:               run.Seed,
		ProviderTranscript: run.ProviderTranscript,
	}
	return Record(rebuilt)
}

// ReplayMatches is the deterministic integrity predicate over a recorded run: it reports whether
// the run RE-DERIVES to its own recorded id. true ⇒ the run is internally consistent (faithfully
// recorded); false ⇒ a field was changed after recording (the id no longer addresses the body) —
// the tamper signal. Pure, total. The UI badge and the property mirror both read this.
func ReplayMatches(run AgentRun) bool {
	replayed, err := Replay(run)
	if err != nil {
		return false
	}
	return replayed.ID == run.ID
}
