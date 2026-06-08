// Property mirror (rapid, ∀, below the line, computational) for the S83 build-loop service.
// reflects: runtime.buildloop.{Terminate,NoProgress,Drive} · test_kind: property ·
// cert_language: rapid · authority: below.
//
// It pins the two NON-NEGOTIABLE invariants of the step plus the reproducibility mirror:
//
//   - ∀ TERMINATION IS A PURE FUNCTION OF THE HISTORY (§6/§8): same TerminationInput ⇒ the
//     byte-identical Decision. Termination is NEVER an LLM judgment; the judge is the mirror
//     verdict (goal.IsClosed) + the pure no-progress detector + the declared budget.
//   - ∀ THE AGENT WRITES NOTHING ABOVE THE WATERLINE (the wall §2): for EVERY drawn agent
//     spec and EVERY drawn LLM target, a write whose target resolves above the line lands
//     Autorisee=false with AGENT_WRITE_ABOVE_WATERLINE and is NEVER applied to the sandbox.
//   - ∀ GREEN ⇒ goal.IsClosed (the non-gameable Stop): the loop can only declare green when
//     the Stop passes — it cannot fabricate a pass.
//   - ∀ TOTALITY: Terminate / NoProgress / Drive never panic on any drawn input.
package buildloop_test

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/buildloop"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// genHistory draws an arbitrary iteration history — diff-hashes from a tiny alphabet (so
// repeats are likely) and green sets from a small mirror pool (so oscillation is likely).
func genHistory(t *rapid.T) buildloop.History {
	mirrorPool := []string{"m1", "m2", "m3"}
	n := rapid.IntRange(0, 6).Draw(t, "history_len")
	h := make(buildloop.History, 0, n)
	for i := 0; i < n; i++ {
		diff := rapid.SampledFrom([]string{"a", "b", "c"}).Draw(t, "diff")
		var green []string
		for _, m := range mirrorPool {
			if rapid.Bool().Draw(t, "green_"+m) {
				green = append(green, m)
			}
		}
		h = append(h, buildloop.Iteration{DiffHash: diff, GreenMirrors: green})
	}
	return h
}

// genTerminationInput draws a complete, arbitrary TerminationInput.
func genTerminationInput(t *rapid.T) buildloop.TerminationInput {
	redSet := rapid.SliceOfN(rapid.SampledFrom([]string{"m1", "m2", "m3"}), 1, 3).Draw(t, "red_set")
	g := goal.Goal{ID: "g-" + rapid.StringMatching(`[a-z]{3}`).Draw(t, "gid"), RedSet: redSet, Status: goal.StatusOpen}

	sensors := map[string]goal.SensorState{}
	for _, m := range redSet {
		if rapid.Bool().Draw(t, "sens_"+m) {
			sensors[m] = goal.SensorGreen
		} else {
			sensors[m] = goal.SensorRed
		}
	}
	prior := goal.PriorIntact
	if rapid.Bool().Draw(t, "prior_broken") {
		prior = goal.PriorBroken
	}
	stop := goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    prior,
		Mutation:      rapid.Float64Range(0, 1).Draw(t, "mut"),
		MutationFloor: rapid.Float64Range(0, 1).Draw(t, "floor"),
	}
	if rapid.Bool().Draw(t, "monster") {
		stop.Monsters = []string{"x"}
	}

	return buildloop.TerminationInput{
		Goal:    g,
		Stop:    stop,
		History: genHistory(t),
		Policy: buildloop.Policy{
			MaxIterations:    rapid.IntRange(0, 8).Draw(t, "max_iter"),
			StagnationWindow: rapid.IntRange(0, 4).Draw(t, "window"),
		},
		Budget: economics.HarnessCostBudget{
			CellRef:             "cell",
			MaxLLMTokensPerGoal: rapid.IntRange(0, 5000).Draw(t, "cap"),
		},
		Cost: economics.MeasuredCost{LLMTokens: rapid.IntRange(0, 10000).Draw(t, "tokens")},
	}
}

// TestTerminationIsPureFunctionOfHistory — ∀ same input ⇒ byte-identical Decision (the
// termination is a pure function of the history, never an LLM judgment; same history → same
// verdict d'arrêt). This is the reproducibility mirror.
func TestTerminationIsPureFunctionOfHistory(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genTerminationInput(t)
		d1 := buildloop.Terminate(in)
		d2 := buildloop.Terminate(in)
		if d1.Verdict != d2.Verdict {
			t.Fatalf("non-deterministic verdict: %q vs %q", d1.Verdict, d2.Verdict)
		}
		if (d1.BlockReason == nil) != (d2.BlockReason == nil) {
			t.Fatalf("non-deterministic BlockReason presence")
		}
		if d1.BlockReason != nil && d1.BlockReason.Code != d2.BlockReason.Code {
			t.Fatalf("non-deterministic BlockReason code")
		}
		if !buildloop.IsKnownVerdict(d1.Verdict) {
			t.Fatalf("verdict not in the closed enum: %q", d1.Verdict)
		}
	})
}

// TestNoProgressIsPureFunctionOfHistory — ∀ same (history, policy) ⇒ same NoProgress verdict.
func TestNoProgressIsPureFunctionOfHistory(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		h := genHistory(t)
		p := buildloop.Policy{
			MaxIterations:    rapid.IntRange(0, 8).Draw(t, "max_iter"),
			StagnationWindow: rapid.IntRange(0, 4).Draw(t, "window"),
		}
		if buildloop.NoProgress(h, p) != buildloop.NoProgress(h, p) {
			t.Fatalf("NoProgress is non-deterministic on the same history")
		}
	})
}

// TestGreenImpliesNonGameableStopPasses — ∀ a green termination ⇒ goal.IsClosed holds. The
// loop CANNOT declare green when the Stop is red (it cannot fabricate a pass).
func TestGreenImpliesNonGameableStopPasses(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genTerminationInput(t)
		d := buildloop.Terminate(in)
		if d.Verdict == buildloop.VerdictGreen && !goal.IsClosed(in.Goal, in.Stop) {
			t.Fatalf("declared green but the non-gameable Stop does NOT pass")
		}
		// And the converse path: if the Stop passes, the verdict is green (green takes precedence).
		if goal.IsClosed(in.Goal, in.Stop) && d.Verdict != buildloop.VerdictGreen {
			t.Fatalf("Stop passes but verdict is %q (green must take precedence)", d.Verdict)
		}
	})
}

// genAgentSpec draws an arbitrary governed agent spec — but kernel/fitness rights are ALWAYS
// false (the wall, §2), exactly as agentlayer enforces. The write zones are drawn freely.
func genAgentSpec(t *rapid.T) agentlayer.AgentSpec {
	return agentlayer.AgentSpec{
		ID:                 "agent-" + rapid.StringMatching(`[a-z]{3}`).Draw(t, "aid"),
		Nom:                "executor",
		Role:               "executor",
		PeutProposerVerite: rapid.Bool().Draw(t, "propose"),
		PeutModifierMiroir: rapid.Bool().Draw(t, "mirror"),
		// The wall constants — never true.
		PeutModifierNoyau:   false,
		PeutModifierFitness: false,
		ZonesEcriture: rapid.SliceOfN(rapid.SampledFrom([]string{
			".aidos/workspaces/proj/src", ".aidos/workspaces/proj/spike",
		}), 0, 2).Draw(t, "zones"),
	}
}

// fakeCompiler / fakeGenerator / fakeSandbox / fakeSensors are scripted, deterministic ports
// so the whole Drive replays byte-identically (no LLM, no real I/O). The sandbox RECORDS what
// it was asked to write so the test can assert the wall blocked above-waterline writes.
type fakeCompiler struct{}

func (fakeCompiler) Compile(_ goal.Goal, _ string) string { return "pack-fixed" }

type fakeGenerator struct{ target, diff string }

func (g fakeGenerator) Generate(_ string, _ goal.Goal) (string, []byte, string) {
	return g.target, []byte("patch"), g.diff
}

type fakeSandbox struct{ applied []string }

func (s *fakeSandbox) Apply(target string, _ []byte) []byte {
	s.applied = append(s.applied, target)
	return []byte(`{"written":true}`)
}

type fakeSensors struct{ green []string }

func (s fakeSensors) Run(_ goal.Goal) []string { return s.green }

// aboveWaterlineTargets are truth-zone targets the wall must always refuse.
var aboveWaterlineTargets = []string{"kernel.entities", "mirrors.records", "fitness.waterline"}

// TestAgentWritesNothingAboveTheWaterline — ∀ agent spec, ∀ LLM target: a write above the
// waterline lands Autorisee=false with AGENT_WRITE_ABOVE_WATERLINE and is NEVER applied to the
// sandbox (the wall held). Below-the-line writes are applied.
func TestAgentWritesNothingAboveTheWaterline(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genAgentSpec(t)
		aboveTarget := rapid.SampledFrom(aboveWaterlineTargets).Draw(t, "above_target")

		sb := &fakeSandbox{}
		out, err := buildloop.Drive(buildloop.TurnInput{
			Spec:        spec,
			Goal:        redGoal(),
			Branch:      "main",
			RedWorkItem: redGoal().RedSet[0],
			Policy:      buildloop.Policy{MaxIterations: 50, StagnationWindow: 3},
			History:     nil,
			StartedAt:   "2026-06-08T00:00:00Z",
			EndedAt:     "2026-06-08T00:01:00Z",
		}, fakeCompiler{}, fakeGenerator{target: aboveTarget, diff: "d"}, sb, fakeSensors{green: nil})
		if err != nil {
			t.Fatalf("Drive errored: %v", err)
		}

		// The write action against an above-waterline target must be refused for EVERY role.
		var write *agentrun.AgentAction
		for i := range out.Run.Actions {
			if out.Run.Actions[i].Type == agentrun.ActionWrite {
				write = &out.Run.Actions[i]
			}
		}
		if write == nil {
			t.Fatalf("no write action recorded")
		}
		if write.Autorisee {
			t.Fatalf("write to above-waterline target %q was AUTHORISED — the wall failed", aboveTarget)
		}
		if write.RaisonBlocage == nil || write.RaisonBlocage.Code != blockreason.CodeAgentWriteAboveWaterline {
			t.Fatalf("expected AGENT_WRITE_ABOVE_WATERLINE, got %v", write.RaisonBlocage)
		}
		// And the sandbox was NEVER touched (the patch was not applied above the line).
		for _, a := range sb.applied {
			if a == aboveTarget {
				t.Fatalf("the sandbox APPLIED a patch to an above-waterline target %q", aboveTarget)
			}
		}
	})
}

// TestBelowWaterlineWriteIsApplied — a below-the-line sandbox write is authorised and applied.
func TestBelowWaterlineWriteIsApplied(t *testing.T) {
	sb := &fakeSandbox{}
	below := ".aidos/workspaces/proj/src/order.go"
	spec := agentlayer.AgentSpec{
		ID: "agent-x", Nom: "executor", Role: "executor",
		ZonesEcriture: []string{".aidos/workspaces/proj/src"},
	}
	out, err := buildloop.Drive(buildloop.TurnInput{
		Spec:        spec,
		Goal:        redGoal(),
		Branch:      "main",
		RedWorkItem: redGoal().RedSet[0],
		Policy:      buildloop.Policy{MaxIterations: 50, StagnationWindow: 3},
		StartedAt:   "2026-06-08T00:00:00Z",
		EndedAt:     "2026-06-08T00:01:00Z",
	}, fakeCompiler{}, fakeGenerator{target: below, diff: "d"}, sb, fakeSensors{green: nil})
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if len(sb.applied) != 1 || sb.applied[0] != below {
		t.Fatalf("below-waterline write should be applied once to %q, got %v", below, sb.applied)
	}
	// The run is content-addressed (non-empty id) and replays to the same id.
	if out.Run.ID == "" {
		t.Fatalf("recorded run has no content-address")
	}
}

// TestDriveReplaysDeterministically — ∀ same TurnInput + same scripted ports ⇒ the same run id
// and the same decision (the reproducibility mirror over the orchestration).
func TestDriveReplaysDeterministically(t *testing.T) {
	mk := func() (buildloop.TurnOutput, error) {
		return buildloop.Drive(buildloop.TurnInput{
			Spec:        agentlayer.AgentSpec{ID: "a", Nom: "e", Role: "e", ZonesEcriture: []string{".aidos/workspaces/proj/src"}},
			Goal:        redGoal(),
			Branch:      "main",
			RedWorkItem: redGoal().RedSet[0],
			Policy:      buildloop.Policy{MaxIterations: 50, StagnationWindow: 3},
			StartedAt:   "2026-06-08T00:00:00Z",
			EndedAt:     "2026-06-08T00:01:00Z",
		}, fakeCompiler{}, fakeGenerator{target: ".aidos/workspaces/proj/src/x.go", diff: "d"}, &fakeSandbox{}, fakeSensors{green: redGoal().RedSet})
	}
	o1, err1 := mk()
	o2, err2 := mk()
	if err1 != nil || err2 != nil {
		t.Fatalf("Drive errored: %v / %v", err1, err2)
	}
	if o1.Run.ID != o2.Run.ID {
		t.Fatalf("non-deterministic run id: %q vs %q", o1.Run.ID, o2.Run.ID)
	}
	if o1.Decision.Verdict != o2.Decision.Verdict {
		t.Fatalf("non-deterministic decision: %q vs %q", o1.Decision.Verdict, o2.Decision.Verdict)
	}
	// Sensors reported the full red set green ⇒ the loop terminates GREEN.
	if o1.Decision.Verdict != buildloop.VerdictGreen {
		t.Fatalf("full red set green should terminate green, got %q", o1.Decision.Verdict)
	}
}
