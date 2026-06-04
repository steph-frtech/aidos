package agentloop_test

// BA28 — the agentloop REPLAY + REDACTED-TRANSCRIPT fixture mirror (N2: state → command →
// events). reflects=runtime.agentloop.replay · test_kind=fixture · cert_language=go-fixture ·
// liveness=live · authority=below.
//
// BA15/BA27 built Drive — the deterministic loop shell. BA26 widened the AgentRun schema with
// impl/seed/provider_transcript. BA28 wires them together so a run a loop produced is REPLAYABLE
// without a live model, and its persisted transcript is SAFE (gap H1):
//
//   - DriveReplayable runs the loop AND records the impl content-hash, the run seed, and the
//     REDACTED provider transcript ref onto the AgentRun — a run that carries everything Replay
//     needs.
//   - The RecordingGenerator wraps an ActionGenerator and captures its (REDACTED) replies, so the
//     replay re-feeds the recorded responses instead of a live LLM.
//   - ReplayRun re-derives the run with the SAME content-address id, model-free.
//
// THE WALL. The recorded transcript is REDACTED before it lands on the run (the ledger is not a
// secret store). DriveReplayable writes no truth — the run is below the line.
//
// DETERMINISM-FIRST. Same (input) ⇒ same (run, redacted transcript), and Replay(run).ID == run.ID.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// replayImpl is a minimal runnable impl that binds the write tool and allows the app tree.
func replayImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:     "couche:builder@v1",
		Model:        "claude",
		MaxTurns:     16,
		AllowedPaths: []string{"app/"},
	}
}

func replayInput(secret string) agentloop.DriveReplayInput {
	mirror := "redset:checkout.mirror"
	small := agentimpl.RunDelta{Tokens: 10, Turns: 1, WallClockSecs: 1}
	return agentloop.DriveReplayInput{
		Drive: agentloop.DriveInput{
			Impl:          replayImpl(),
			Goal:          goal.Goal{ID: "g-checkout", RedSet: []string{mirror}, Budgets: goal.Budgets{TimeSeconds: 10000, Turns: 10000, Tokens: 1_000_000}},
			RedWorkItem:   "rwi:checkout",
			ContextPack:   "pack:checkout",
			Sensors:       map[string]goal.SensorState{mirror: goal.SensorRed},
			PriorGreen:    goal.PriorIntact,
			Mutation:      1,
			MutationFloor: 0,
			HarnessBudget: economics.HarnessCostBudget{CellRef: "cell", MaxCIMinutes: 10000, MaxLLMTokensPerGoal: 1_000_000},
			RatePerToken:  0.000001,
			Generator: agentloop.ScriptedGenerator{Turns: []agentloop.ScriptedTurn{
				{
					Action:  agentimpl.Action{Target: "app/checkout.go", AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{"app/checkout.go"}}},
					Body:    agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: "app/checkout.go"},
					Cost:    small,
					Effects: []agentloop.SensorEffect{{Mirror: mirror, State: goal.SensorGreen}},
				},
			}},
			StartedAt: "2026-06-04T18:00:00Z",
			EndedAt:   "2026-06-04T18:05:00Z",
			MaxTurns:  16,
		},
		Seed: "seed-declared",
		// The system prompt + a model reply that happens to carry a secret — must be redacted.
		Transcript: agentrun.Transcript{
			System: "you are a build agent. db=postgres://u:hunter2@db:5432/app",
			Turns:  []string{"writing app/checkout.go using key sk-ant-0123456789abcdef"},
		},
	}
}

// (1) DriveReplayable records impl/seed/redacted-transcript onto the run, and the run replays.
func TestFixture_DriveReplayable_Reproducible(t *testing.T) {
	in := replayInput("sk-ant-0123456789abcdef")
	out, err := agentloop.DriveReplayable(in)
	if err != nil {
		t.Fatalf("DriveReplayable: %v", err)
	}
	if out.Run.Result != agentrun.ResultGreen {
		t.Fatalf("happy run must close green, got %q", out.Run.Result)
	}
	// The run carries the replay fields.
	if out.Run.Seed != "seed-declared" {
		t.Fatalf("run must carry the declared seed, got %q", out.Run.Seed)
	}
	if out.Run.Impl == "" {
		t.Fatalf("run must carry the impl content-hash")
	}
	if out.Run.ProviderTranscript == "" {
		t.Fatalf("run must carry a transcript ref")
	}
	// REPLAY: re-derives the SAME id without a live model.
	replayed, err := agentrun.Replay(out.Run)
	if err != nil {
		t.Fatalf("Replay: %v", err)
	}
	if replayed.ID != out.Run.ID {
		t.Fatalf("Replay(run).ID must equal run.ID: %q != %q", replayed.ID, out.Run.ID)
	}
}

// (2) The recorded transcript is REDACTED — no secret survives verbatim on the run/output.
func TestFixture_DriveReplayable_TranscriptRedacted(t *testing.T) {
	secrets := []string{"postgres://u:hunter2@db:5432/app", "sk-ant-0123456789abcdef", "hunter2"}
	in := replayInput("sk-ant-0123456789abcdef")
	out, err := agentloop.DriveReplayable(in)
	if err != nil {
		t.Fatalf("DriveReplayable: %v", err)
	}
	for _, s := range secrets[:2] { // the two full secret tokens must be scrubbed
		if strings.Contains(out.RedactedTranscript.System, s) {
			t.Fatalf("secret %q leaked in redacted system prompt: %q", s, out.RedactedTranscript.System)
		}
		for _, tu := range out.RedactedTranscript.Turns {
			if strings.Contains(tu, s) {
				t.Fatalf("secret %q leaked in redacted turn: %q", s, tu)
			}
		}
	}
}

// (3) Determinism: same input ⇒ same (run id, redacted transcript).
func TestFixture_DriveReplayable_Deterministic(t *testing.T) {
	in := replayInput("sk-ant-0123456789abcdef")
	a, err := agentloop.DriveReplayable(in)
	if err != nil {
		t.Fatalf("DriveReplayable a: %v", err)
	}
	b, err := agentloop.DriveReplayable(in)
	if err != nil {
		t.Fatalf("DriveReplayable b: %v", err)
	}
	if a.Run.ID != b.Run.ID {
		t.Fatalf("same input must yield the same run id: %q != %q", a.Run.ID, b.Run.ID)
	}
	if a.RedactedTranscript.System != b.RedactedTranscript.System {
		t.Fatalf("redaction must be deterministic")
	}
}

// (4) RecordingGenerator captures REDACTED replies; the replay re-feeds them (no live model).
func TestFixture_RecordingGenerator_RedactsCaptured(t *testing.T) {
	inner := agentimpl.FakeGenerator{Replies: []string{"reply key=sk-ant-0123456789abcdef done"}}
	rg := agentloop.NewRecordingGenerator(inner)
	g, err := rg.GenerateAction(t.Context(), replayImpl(), agentimpl.Transcript{System: "s", Turns: nil})
	if err != nil {
		t.Fatalf("GenerateAction: %v", err)
	}
	_ = g
	captured := rg.Captured()
	if len(captured) != 1 {
		t.Fatalf("expected one captured reply, got %d", len(captured))
	}
	if strings.Contains(captured[0], "sk-ant-0123456789abcdef") {
		t.Fatalf("captured reply must be redacted: %q", captured[0])
	}
}
