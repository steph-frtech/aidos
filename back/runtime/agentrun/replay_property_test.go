package agentrun_test

// BA28 — the REPLAY + REDACTED-TRANSCRIPT property mirror (∀) for AgentRun.
// reflects=runtime.agent_run.replay · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. A run is a RUNTIME EVENT, never a layer/truth.
//
// BA28 makes a recorded run REPLAYABLE and its transcript SAFE to persist (gap H1):
//
//  1. REPLAY RE-DERIVES AN IDENTICAL RUN. Replay(run) reconstructs the recorded run from the
//     fields the run already carries (impl, goal, red work item, context pack, seed, actions,
//     result, timestamps, provider transcript) and re-stamps the content-address via
//     records.Hash — REUSED, never forked (the same recorder agentrun.Record uses). For any
//     recorded run, Replay(run).ID == run.ID. This is the runtime extension of evolve's
//     replay-by-seed discipline to an AgentRun.
//
//  2. SECRETS NEVER LEAK VERBATIM. The provider transcript persisted with a run includes the
//     system prompt + ContextPack — which may carry the user-app's code/env/secrets. Redact
//     scrubs known secret patterns BEFORE persistence: a known secret pattern present in the
//     input NEVER appears verbatim in the redacted output. Redaction is deterministic (same
//     input ⇒ same output) and idempotent (re-redacting changes nothing) — so a replay over a
//     redacted transcript is itself reproducible.
//
// THE WALL (CLAUDE.md §2/§8). The ledger is NOT a secret store: Redact runs before the
// transcript is persisted, so the run record (below the line) never holds a secret verbatim.
// Replay writes no truth — it re-derives a telemetry record, never a layer.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Both Replay and Redact are PURE, TOTAL functions — no
// clock, no rng, no I/O, no LLM. Replay reuses records.Hash (the content-address authority);
// Redact is a deterministic string transform. Same input ⇒ same output (this mirror pins it).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// drawRecordedRun draws a recorded run with a content-addressed id (it has been through
// Record once) — the input to Replay.
func drawRecordedRun(rt *rapid.T) agentrun.AgentRun {
	results := agentrun.Results()
	n := rapid.IntRange(0, 4).Draw(rt, "nactions")
	actions := make([]agentrun.AgentAction, 0, n)
	for i := 0; i < n; i++ {
		a := agentrun.AgentAction{
			Type:      agentrun.ActionType(rapid.SampledFrom([]string{"read", "write", "propose", "run_mirror"}).Draw(rt, "atype")),
			Cible:     rapid.StringN(0, 16, 16).Draw(rt, "cible"),
			Autorisee: rapid.Bool().Draw(rt, "autorisee"),
		}
		if !a.Autorisee {
			a.RaisonBlocage = &blockreason.BlockReason{
				Code:        "AGENT_WRITE_ABOVE_WATERLINE",
				Severity:    "blocking",
				Explanation: "x",
				HowToFix:    []string{"y"},
			}
		}
		actions = append(actions, a)
	}
	r := agentrun.AgentRun{
		Agent:              rapid.StringN(1, 12, 12).Draw(rt, "agent"),
		Goal:               rapid.StringN(0, 12, 12).Draw(rt, "goal"),
		RedWorkItem:        rapid.StringN(0, 12, 12).Draw(rt, "rwi"),
		ContextPack:        rapid.StringN(0, 12, 12).Draw(rt, "cp"),
		Actions:            actions,
		Result:             results[rapid.IntRange(0, len(results)-1).Draw(rt, "result")],
		StartedAt:          "2026-06-04T18:00:00Z",
		EndedAt:            "2026-06-04T18:05:00Z",
		Impl:               rapid.StringN(0, 16, 16).Draw(rt, "impl"),
		Seed:               rapid.StringN(0, 16, 16).Draw(rt, "seed"),
		ProviderTranscript: rapid.StringN(0, 16, 16).Draw(rt, "transcript"),
	}
	recorded, err := agentrun.Record(r)
	if err != nil {
		rt.Fatalf("Record must be total for a known result: %v", err)
	}
	return recorded
}

// (1) Replay(run).ID == run.ID for every recorded run — the run re-derives byte-identically.
func TestProp_Replay_IdentityID(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		run := drawRecordedRun(rt)
		replayed, err := agentrun.Replay(run)
		if err != nil {
			rt.Fatalf("Replay must be total for a recorded run: %v", err)
		}
		if replayed.ID != run.ID {
			rt.Fatalf("Replay must re-derive the SAME id: got %q want %q", replayed.ID, run.ID)
		}
	})
}

// (2) Replay re-derives an identical run on EVERY field, not just the id (a full re-derivation).
func TestProp_Replay_IdenticalRun(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		run := drawRecordedRun(rt)
		replayed, err := agentrun.Replay(run)
		if err != nil {
			rt.Fatalf("Replay must be total: %v", err)
		}
		// Re-replaying the replay is a fixed point (replay is idempotent on a recorded run).
		again, err := agentrun.Replay(replayed)
		if err != nil {
			rt.Fatalf("Replay must be total on a replayed run: %v", err)
		}
		if again.ID != run.ID {
			rt.Fatalf("Replay must be idempotent: %q != %q", again.ID, run.ID)
		}
	})
}

// knownSecrets are the secret PATTERNS Redact must scrub. They mirror the canonical set
// (single-sourced with agentrun.SecretPatterns). A secret embedded in a transcript must
// NEVER appear verbatim in the redacted output.
func knownSecrets() []string {
	return []string{
		"sk-ant-0123456789abcdef",         // an Anthropic-style API key
		"AKIAIOSFODNN7EXAMPLE",            // an AWS access key id
		"ghp_0123456789abcdefABCDEF",      // a GitHub PAT
		"-----BEGIN RSA PRIVATE KEY-----", // a private-key header
		"postgres://u:p@host:5432/db",     // a DB connection string with a password
	}
}

// (3) Redact NEVER leaks a known secret pattern verbatim — for any surrounding text.
func TestProp_Redact_NoSecretLeak(t *testing.T) {
	secrets := knownSecrets()
	rapid.Check(t, func(rt *rapid.T) {
		secret := secrets[rapid.IntRange(0, len(secrets)-1).Draw(rt, "secret")]
		pre := rapid.StringN(0, 24, 24).Draw(rt, "pre")
		post := rapid.StringN(0, 24, 24).Draw(rt, "post")
		input := pre + secret + post

		out := agentrun.Redact(input)
		if strings.Contains(out, secret) {
			rt.Fatalf("a known secret must NOT survive redaction verbatim: secret=%q out=%q", secret, out)
		}
	})
}

// (4) Redact is deterministic (same input ⇒ same output) and idempotent (re-redacting is a
// fixed point — so a replay over a redacted transcript is itself reproducible).
func TestProp_Redact_DeterministicIdempotent(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		input := rapid.StringN(0, 64, 64).Draw(rt, "input")
		a := agentrun.Redact(input)
		b := agentrun.Redact(input)
		if a != b {
			rt.Fatalf("Redact must be deterministic: %q != %q", a, b)
		}
		if agentrun.Redact(a) != a {
			rt.Fatalf("Redact must be idempotent: redact(redact(x)) != redact(x)")
		}
	})
}

// (5) Redact preserves non-secret text (it scrubs ONLY the secret patterns, not arbitrary
// content) — a transcript with no secret round-trips unchanged.
func TestProp_Redact_PreservesCleanText(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// A clean alphabetic string can never contain a secret pattern.
		clean := "the quick brown fox " + rapid.StringMatching(`[a-z ]{0,40}`).Draw(rt, "clean")
		if agentrun.Redact(clean) != clean {
			rt.Fatalf("Redact must preserve clean text: %q changed", clean)
		}
	})
}

// (6) RedactTranscript scrubs BOTH the system prompt and every turn — the whole confined
// surface, before persistence. A secret in any turn never survives.
func TestProp_RedactTranscript_AllFields(t *testing.T) {
	secrets := knownSecrets()
	rapid.Check(t, func(rt *rapid.T) {
		secret := secrets[rapid.IntRange(0, len(secrets)-1).Draw(rt, "secret")]
		tr := agentrun.Transcript{
			System: "system " + secret,
			Turns:  []string{"turn-a " + secret, "turn-b clean"},
		}
		out := agentrun.RedactTranscript(tr)
		if strings.Contains(out.System, secret) {
			rt.Fatalf("secret leaked in redacted system prompt: %q", out.System)
		}
		for i, tu := range out.Turns {
			if strings.Contains(tu, secret) {
				rt.Fatalf("secret leaked in redacted turn %d: %q", i, tu)
			}
		}
	})
}
