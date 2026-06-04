// repro_property_test.go — the BA19 REPRODUCIBILITY mirror (determinism-first, CLAUDE.md
// §6/§8). The agentloop MCP server's drive/watch are PURE compositions over agentloop.Drive
// (no LLM, no clock, no rng above what is SUPPLIED). This property pins: for the SAME inputs
// (layer_ref, scenario, work item, timestamps), drive yields byte-for-byte the SAME AgentRun,
// and watch's timeline byte-for-byte matches the recorded run — same input ⇒ same output.
//
// This is the deterministic guarantee that makes the loop SHELL provable without a model: the
// LLM is the gated exception (BA17), isolated behind the ActionGenerator; HERE the action
// source is a declared scenario, so the whole capability is reproducible.
package main

import (
	"context"
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

func driveTwice(t *rapid.T, in driveInput) (driveOutput, driveOutput) {
	s := newServer()
	_, a, errA := s.drive(context.Background(), nil, in)
	if errA != nil {
		t.Fatalf("drive A: %v", errA)
	}
	_, b, errB := s.drive(context.Background(), nil, in)
	if errB != nil {
		t.Fatalf("drive B: %v", errB)
	}
	return a, b
}

func mustJSON(t *rapid.T, v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return string(b)
}

// TestDriveIsReproducible — same input ⇒ same AgentRun (byte-for-byte). The reproducibility
// mirror over every declared scenario + a drawn (but supplied) timestamp/work-item.
func TestDriveIsReproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		scenario := rapid.SampledFrom(scenarioNames()).Draw(rt, "scenario")
		item := rapid.StringMatching(`redset:[a-z]{1,8}#[0-9]{1,3}`).Draw(rt, "item")
		goalID := rapid.StringMatching(`g-[a-z]{1,8}`).Draw(rt, "goal")
		in := driveInput{
			LayerRef:     "agent:builder@v1",
			RedWorkItem:  item,
			ContextPack:  "pack-x",
			Scenario:     scenario,
			GoalID:       goalID,
			TargetServer: "mirror-runner",
			TargetTool:   "run_mirror",
			StartedAt:    "2026-06-03T10:00:00Z",
			EndedAt:      "2026-06-03T10:05:00Z",
		}
		a, b := driveTwice(rt, in)
		if mustJSON(rt, a) != mustJSON(rt, b) {
			rt.Fatalf("drive not reproducible for %q: %s != %s", scenario, mustJSON(rt, a), mustJSON(rt, b))
		}
	})
}

// TestWatchMatchesDrive — watch's timeline + result match the recorded run for every
// scenario (re-driving is pure, so the watched view IS the run).
func TestWatchMatchesDrive(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		scenario := rapid.SampledFrom(scenarioNames()).Draw(rt, "scenario")
		s := newServer()
		di := driveInput{
			LayerRef:     "agent:builder@v1",
			RedWorkItem:  "redset:checkout#1",
			ContextPack:  "pack-x",
			Scenario:     scenario,
			GoalID:       "g-checkout",
			TargetServer: "mirror-runner",
			TargetTool:   "run_mirror",
			StartedAt:    "2026-06-03T10:00:00Z",
			EndedAt:      "2026-06-03T10:05:00Z",
		}
		_, dout, err := s.drive(context.Background(), nil, di)
		if err != nil {
			rt.Fatalf("drive: %v", err)
		}
		_, wout, err := s.watch(context.Background(), nil, watchInput{
			LayerRef: di.LayerRef, RedWorkItem: di.RedWorkItem, ContextPack: di.ContextPack,
			Scenario: di.Scenario, GoalID: di.GoalID, TargetServer: di.TargetServer,
			TargetTool: di.TargetTool, StartedAt: di.StartedAt, EndedAt: di.EndedAt,
		})
		if err != nil {
			rt.Fatalf("watch: %v", err)
		}
		if dout.Run == nil {
			rt.Fatalf("scenario %q recorded no run", scenario)
		}
		if string(dout.Run.Result) != wout.Result {
			rt.Fatalf("watch result %q != run result %q", wout.Result, dout.Run.Result)
		}
		if len(wout.Timeline) != len(dout.Run.Actions) {
			rt.Fatalf("timeline len %d != run actions %d", len(wout.Timeline), len(dout.Run.Actions))
		}
		for i := range wout.Timeline {
			if wout.Timeline[i].Cible != dout.Run.Actions[i].Cible ||
				wout.Timeline[i].Autorisee != dout.Run.Actions[i].Autorisee {
				rt.Fatalf("timeline entry %d diverges from run action", i)
			}
		}
	})
}

// TestDriveNeverWritesTruth — across every scenario, no AUTHORISED action targets an
// above-waterline zone (the wall, on the capability door). A refused kernel write is fine.
func TestDriveNeverWritesTruth(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		scenario := rapid.SampledFrom(scenarioNames()).Draw(rt, "scenario")
		s := newServer()
		_, out, err := s.drive(context.Background(), nil, driveInput{
			LayerRef: "agent:builder@v1", RedWorkItem: "redset:checkout#1", ContextPack: "pack-x",
			Scenario: scenario, GoalID: "g-checkout", TargetServer: "mirror-runner",
			TargetTool: "run_mirror", StartedAt: "2026-06-03T10:00:00Z", EndedAt: "2026-06-03T10:05:00Z",
		})
		if err != nil {
			rt.Fatalf("drive: %v", err)
		}
		if out.Run == nil {
			rt.Fatalf("scenario %q recorded no run", scenario)
		}
		for i, a := range out.Run.Actions {
			if a.Autorisee && isAboveWaterline(a.Cible) {
				rt.Fatalf("scenario %q action %d wrote truth above the waterline: %q", scenario, i, a.Cible)
			}
		}
	})
}
