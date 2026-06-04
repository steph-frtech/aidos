// drive_property_test.go — the BA15 reproducibility mirror (determinism-first, CLAUDE.md
// §6/§8). Drive is a PURE, TOTAL function of its DriveInput: no DB, no clock (timestamps
// SUPPLIED), no rng (the script is the only action source), no I/O, no live LLM. These
// rapid properties pin:
//   - reproducibility: identical input ⇒ identical AgentRun (same actions, same Result,
//     same content-addressed id) — twice;
//   - totality: never panics on an arbitrary script;
//   - the wall: NO above-the-line write ever lands Autorisee:true (the interceptor holds
//     for every script);
//   - result is computed: the Result is ALWAYS one of the four closed agentrun results
//     and matches goal.IsClosed over the FINAL sensor world (never self-reported).
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"pgregory.net/rapid"
)

// genTurn draws an arbitrary scripted turn: a target drawn from a mix of legal (app/) and
// above-the-line (back/kernel/, back/migrations/) paths, a small cost, and a sensor flip.
func genTurn(t *rapid.T) ScriptedTurn {
	targets := []string{"app/a.go", "app/b.go", "back/kernel/x.go", "back/migrations/m.sql", "app/c.go"}
	mirrors := []string{"mirror.a", "mirror.b"}
	tgt := rapid.SampledFrom(targets).Draw(t, "tgt")
	return ScriptedTurn{
		Action: agentimpl.Action{
			Target:      tgt,
			AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{tgt}},
		},
		Body: agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: tgt},
		Cost: agentimpl.RunDelta{
			Tokens:        rapid.IntRange(0, 50).Draw(t, "tok"),
			Turns:         1,
			WallClockSecs: rapid.IntRange(0, 3).Draw(t, "wc"),
		},
		Effects: []SensorEffect{{
			Mirror: rapid.SampledFrom(mirrors).Draw(t, "mir"),
			State:  goal.SensorGreen,
		}},
	}
}

func genInput(t *rapid.T) DriveInput {
	g := goal.Goal{
		ID:      "goal-prop",
		RedSet:  []string{"mirror.a", "mirror.b"},
		Status:  goal.StatusOpen,
		Budgets: goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: rapid.IntRange(0, 2_000).Draw(t, "tok-cap")},
	}
	turns := rapid.SliceOfN(rapid.Custom(genTurn), 0, 6).Draw(t, "turns")
	return DriveInput{
		Impl:          permissiveImpl(),
		Goal:          g,
		RedWorkItem:   "item",
		ContextPack:   "pack",
		Sensors:       allRed(g),
		PriorGreen:    goal.PriorIntact,
		Mutation:      1.0,
		MutationFloor: 0.0,
		HarnessBudget: economics.HarnessCostBudget{CellRef: "c", MaxCIMinutes: 10_000, MaxLLMTokensPerGoal: 1_000_000},
		RatePerToken:  0.0,
		StartedAt:     "2026-06-03T00:00:00Z",
		EndedAt:       "2026-06-03T00:05:00Z",
		Generator:     ScriptedGenerator{Turns: turns},
	}
}

func TestDrive_Property_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genInput(rt)
		r1, e1 := Drive(in)
		r2, e2 := Drive(in)
		if (e1 == nil) != (e2 == nil) {
			rt.Fatalf("error nondeterminism: %v vs %v", e1, e2)
		}
		if !reflect.DeepEqual(r1, r2) {
			rt.Fatalf("Drive not reproducible:\n%+v\nvs\n%+v", r1, r2)
		}
		if e1 == nil && r1.ID == "" {
			rt.Fatalf("recorded run must carry a content-addressed id")
		}
	})
}

func TestDrive_Property_TotalAndWallHolds(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genInput(rt)
		run, err := Drive(in) // must never panic
		if err != nil {
			rt.Fatalf("Drive errored on valid input: %v", err)
		}
		// The wall: NO above-the-line write ever lands Autorisee:true.
		for _, a := range run.Actions {
			if a.Autorisee && agentimpl.IsAboveWaterline(a.Cible) {
				rt.Fatalf("above-the-line write was allowed — wall breached: %+v", a)
			}
		}
		// Result is one of the four closed results (never self-reported / out of enum).
		if !agentrun.IsKnownResult(run.Result) {
			rt.Fatalf("Result out of the closed enum: %q", run.Result)
		}
	})
}

// The Result is COMPUTED: a green Result implies goal.IsClosed held over the run's final
// sensor world (re-derived here from the executed effects), never the agent's claim.
func TestDrive_Property_GreenImpliesClosed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		in := genInput(rt)
		run, err := Drive(in)
		if err != nil {
			rt.Fatalf("Drive errored: %v", err)
		}
		if run.Result != agentrun.ResultGreen {
			return
		}
		// Re-derive the final sensor world by replaying only the ALLOWED effects.
		sensors := copySensors(in.Sensors)
		for i, a := range run.Actions {
			if !a.Autorisee {
				continue
			}
			turn, ok := in.Generator.Next(i)
			if !ok {
				continue
			}
			for _, e := range turn.Effects {
				sensors[e.Mirror] = e.State
			}
		}
		if !goal.IsClosed(in.Goal, in.stopInput(sensors)) {
			rt.Fatalf("green Result but goal.IsClosed false over final sensors %+v", sensors)
		}
	})
}
