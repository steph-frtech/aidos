// replay.go — BA28: REPLAY-BEARING drive + a RECORDING generator + REDACTED transcript at the
// loop edge. BA15/BA27 built Drive (the deterministic loop shell + the live meter). BA26 widened
// the AgentRun schema with impl/seed/provider_transcript. This file WIRES them together:
//
//   - DriveReplayable runs Drive AND stamps the run with the impl content-hash (agentimpl.Hash),
//     the resolved run seed (agentrun.SeedFor — declared-wins, derive-as-fallback), and a content-
//     addressed ref to the REDACTED provider transcript — a run that carries everything
//     agentrun.Replay needs to re-derive it, model-free.
//   - RecordingGenerator wraps an ActionGenerator and CAPTURES its (REDACTED) replies, so a replay
//     re-feeds the recorded responses instead of a live LLM (the roadmap: "ActionGenerator
//     enregistre ses réponses rédactées pour que le replay n'ait pas besoin d'un LLM vivant").
//
// THE LEDGER IS NOT A SECRET STORE (CLAUDE.md §2, gap H1). The provider transcript persisted with
// a run carries the system prompt + ContextPack — potentially the user-app's secrets. It is
// REDACTED (agentrun.RedactTranscript) BEFORE it lands on the run or is captured by the recorder.
// A live replay re-injects from the confined SOURCE (the ContextPack), not from the log.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). DriveReplayable is pure over its input (Drive is pure; the
// hash/seed/redaction are pure) — same input ⇒ same (run, redacted transcript). No clock, no rng,
// no I/O, no live LLM. The reproducibility mirror (replay_fixture_test.go) pins it.
package agentloop

import (
	"context"
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// DriveReplayInput is DriveInput plus the two replay-record inputs: the run's declared Seed
// (BA01 — empty falls back to the derived Hash(impl‖pack‖item)) and the raw provider Transcript
// (system prompt + turns) that DriveReplayable REDACTS before it persists. Pure data.
type DriveReplayInput struct {
	Drive      DriveInput
	Seed       string // the DECLARED seed (BA01); "" ⇒ derive Hash(impl‖pack‖item) via agentrun.SeedFor
	Transcript agentrun.Transcript
}

// DriveReplayOutput is the run a replayable drive produced PLUS the redacted transcript that was
// persisted alongside it. The run carries Impl/Seed/ProviderTranscript (the BA26 replay fields)
// so agentrun.Replay re-derives it model-free.
type DriveReplayOutput struct {
	Run                agentrun.AgentRun
	RedactedTranscript agentrun.Transcript
}

// transcriptRef is the content-addressed ref the run stores in place of the raw transcript — the
// Hash of the REDACTED transcript (REUSING records.Hash/Canonicalize, the content-address
// authority). The ledger holds only this ref + the redacted form; never the raw secret-bearing
// transcript. Pure, total.
func transcriptRef(tr agentrun.Transcript) (string, error) {
	raw, err := json.Marshal(tr)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// DriveReplayable runs the BA15/BA27 loop and produces a REPLAY-BEARING run (gap A2/H1): it
// records the impl content-hash, the resolved seed, and a ref to the REDACTED transcript onto the
// AgentRun, and returns the redacted transcript that is safe to persist. The run that comes back
// satisfies agentrun.Replay(run).ID == run.ID. Pure, total, deterministic — Drive is pure, the
// hash/seed/redaction are pure; no live LLM. Writes no truth.
func DriveReplayable(in DriveReplayInput) (DriveReplayOutput, error) {
	// 1. Run the deterministic loop (BA27 — meter + pre-call halt). The base run carries no
	//    replay fields yet (Drive produces a below-the-line telemetry record).
	base, _, err := DriveWithEconomics(in.Drive)
	if err != nil {
		return DriveReplayOutput{}, err
	}

	// 2. The impl content-hash (agentimpl.Hash — REUSED) is the run's Impl ref.
	implHash, err := agentimpl.Hash(in.Drive.Impl)
	if err != nil {
		return DriveReplayOutput{}, err
	}

	// 3. The resolved seed: declared-wins, else derive Hash(impl‖pack‖item) (agentrun.SeedFor —
	//    the single seed source; no second seed function, no rng).
	seed := agentrun.SeedFor(in.Seed, implHash, in.Drive.ContextPack, in.Drive.RedWorkItem)

	// 4. REDACT the transcript BEFORE persistence (the ledger is not a secret store), and address
	//    the redacted form.
	redacted := agentrun.RedactTranscript(in.Transcript)
	ref, err := transcriptRef(redacted)
	if err != nil {
		return DriveReplayOutput{}, err
	}

	// 5. Re-record the run WITH the replay fields (a new @version of the content-address, BA26 —
	//    supersede-via-version). We rebuild from the base body and re-Record so the id addresses
	//    the replay-bearing body.
	base.Impl = implHash
	base.Seed = seed
	base.ProviderTranscript = ref
	recorded, err := agentrun.Record(base)
	if err != nil {
		return DriveReplayOutput{}, err
	}
	return DriveReplayOutput{Run: recorded, RedactedTranscript: redacted}, nil
}

// RecordingGenerator wraps an ActionGenerator and CAPTURES each reply (REDACTED) so a replay can
// re-feed the recorded responses instead of a live model (the roadmap discipline). It is the only
// stateful seam in the loop — and it is below the line, recording telemetry. The capture is
// REDACTED at the moment of recording (gap H1): a secret a model emits never lands raw in the
// captured log.
type RecordingGenerator struct {
	inner    agentimpl.ActionGenerator
	captured *[]string
}

// NewRecordingGenerator wraps inner so each generated reply is captured (redacted). The capture
// slice is a pointer so the value receiver GenerateAction (the ActionGenerator contract) can
// append to it.
func NewRecordingGenerator(inner agentimpl.ActionGenerator) RecordingGenerator {
	cap := make([]string, 0)
	return RecordingGenerator{inner: inner, captured: &cap}
}

// GenerateAction delegates to the wrapped generator and captures the REDACTED reply text. The
// redaction happens at capture time so the recorded log never holds a secret verbatim.
func (g RecordingGenerator) GenerateAction(ctx context.Context, impl agentimpl.AgentImplementation, tr agentimpl.Transcript) (agentimpl.Generated, error) {
	out, err := g.inner.GenerateAction(ctx, impl, tr)
	if err != nil {
		return out, err
	}
	*g.captured = append(*g.captured, agentrun.Redact(out.Text))
	return out, nil
}

// Captured returns the recorded (redacted) replies in order — what a replay re-feeds.
func (g RecordingGenerator) Captured() []string {
	out := make([]string, len(*g.captured))
	copy(out, *g.captured)
	return out
}

// statically assert RecordingGenerator satisfies the seam.
var _ agentimpl.ActionGenerator = RecordingGenerator{}
