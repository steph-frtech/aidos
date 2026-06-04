// postcheck_property_test.go — the BA16 reproducibility + invariance mirror (RED first,
// determinism-first CLAUDE.md §6/§8). It pins the BA16 claim: the deterministic POST-CHECK
// re-checks EVERY action AFTER it runs (not only the code-changing ones), and Drive's
// Result is a PURE function of the verdicts (gate + post-check) + budget + wall — INVARIANT
// to the agent's CLAIMED confidence. The judge is the mirror, never the claim (§8).
//
// The properties:
//   - totality: PostCheck never panics on ANY (turn, decision, sensors) and ALWAYS returns
//     one of the closed kinds; an UNKNOWN nature is ALWAYS refused (the §8 invariant at the
//     action grain — an action without a deterministic post-check is a determinism gap);
//   - the judge, not the claim: a code-changing turn whose CLAIM disagrees with the OBSERVED
//     sensor reading is NEVER accepted (the effect never lands), no matter how confident the
//     claim — and the Result is invariant to swapping the claimed (false) confidence in;
//   - reads/proposes land NO sensor flip: an accepted read/propose never mutates the world;
//   - reproducibility: identical input ⇒ identical PostCheck verdict (twice).
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"pgregory.net/rapid"
)

// knownNatures is the closed set of action natures that DO carry a deterministic post-check.
var knownNatures = []agentrun.ActionType{
	agentrun.ActionWrite, agentrun.ActionRunMirror, agentrun.ActionPropose, agentrun.ActionRead,
}

// genPostCheckTurn draws an arbitrary scripted turn over a MIX of natures (including an
// unknown one) and arbitrary claimed/observed sensor readings.
func genPostCheckTurn(t *rapid.T) ScriptedTurn {
	natures := []agentrun.ActionType{
		agentrun.ActionWrite, agentrun.ActionRunMirror, agentrun.ActionPropose,
		agentrun.ActionRead, agentrun.ActionType("unknown-nature"),
	}
	mirrors := []string{"mirror.a", "mirror.b"}
	states := []goal.SensorState{goal.SensorGreen, goal.SensorRed}
	nat := rapid.SampledFrom(natures).Draw(t, "nature")

	var effects []SensorEffect
	if rapid.Bool().Draw(t, "has-effect") {
		effects = []SensorEffect{{
			Mirror: rapid.SampledFrom(mirrors).Draw(t, "eff-mir"),
			State:  rapid.SampledFrom(states).Draw(t, "eff-state"),
		}}
	}
	var observed []SensorEffect
	if rapid.Bool().Draw(t, "has-obs") {
		observed = []SensorEffect{{
			Mirror: rapid.SampledFrom(mirrors).Draw(t, "obs-mir"),
			State:  rapid.SampledFrom(states).Draw(t, "obs-state"),
		}}
	}
	return ScriptedTurn{
		Body:     agentrun.AgentAction{Type: nat, Cible: rapid.SampledFrom([]string{"", "app/x.go"}).Draw(t, "cible")},
		Effects:  effects,
		Observed: observed,
	}
}

// TestPostCheck_Total_KnownKindOrRefused: PostCheck never panics; its Kind is always one of
// the three real kinds OR the residual gap; an UNKNOWN nature is ALWAYS refused with the
// AGENT_POSTCHECK_FAILED reason (the §8 invariant: no post-check ⇒ a determinism gap).
func TestPostCheck_Total_KnownKindOrRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		turn := genPostCheckTurn(rt)
		live := map[string]goal.SensorState{"mirror.a": goal.SensorRed, "mirror.b": goal.SensorRed}
		observed := observedSensors(turn, live)
		res := PostCheck(turn, PostCheckDecision{Allowed: true}, observed) // must not panic

		known := false
		for _, k := range append(PostCheckKinds(), PostCheckKindNone) {
			if res.Kind == k {
				known = true
			}
		}
		if !known {
			rt.Fatalf("PostCheck Kind out of the closed set: %q", res.Kind)
		}

		// An unknown nature MUST be refused (a determinism gap).
		isKnownNature := false
		for _, n := range knownNatures {
			if turn.Body.Type == n {
				isKnownNature = true
			}
		}
		if !isKnownNature {
			if res.Accepted {
				rt.Fatalf("an action with an UNKNOWN nature must be refused (determinism gap), got accepted: %+v", turn)
			}
			if res.BlockReason == nil || res.BlockReason.Code != blockreason.CodeAgentPostCheckFailed {
				rt.Fatalf("unknown-nature refusal must carry AGENT_POSTCHECK_FAILED, got %+v", res.BlockReason)
			}
		}

		// On a refusal the BlockReason is always present + non-empty how_to_fix.
		if !res.Accepted {
			if res.BlockReason == nil || len(res.BlockReason.HowToFix) == 0 {
				rt.Fatalf("a refused post-check must carry an actionable BlockReason, got %+v", res.BlockReason)
			}
		}
	})
}

// TestPostCheck_TheJudgeNotTheClaim: a code-changing turn whose CLAIM (Effects) disagrees
// with the OBSERVED sensor reading is NEVER accepted — the mirror is the judge, not the
// agent's confidence (§8).
func TestPostCheck_TheJudgeNotTheClaim(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// A code-changing action claiming mirror.a → green.
		turn := ScriptedTurn{
			Body:    agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: "app/x.go"},
			Effects: []SensorEffect{{Mirror: "mirror.a", State: goal.SensorGreen}},
		}
		// The OBSERVED reading the (lying) agent cannot control: the sensor still reads red.
		observed := map[string]goal.SensorState{"mirror.a": goal.SensorRed}
		res := PostCheck(turn, PostCheckDecision{Allowed: true}, observed)
		if res.Accepted {
			rt.Fatalf("a claimed green the sensor reads red must be REJECTED — the mirror is the judge")
		}
		// When the sensor AGREES, the same claim is accepted (the post-check is not a blanket no).
		agree := map[string]goal.SensorState{"mirror.a": goal.SensorGreen}
		if r2 := PostCheck(turn, PostCheckDecision{Allowed: true}, agree); !r2.Accepted {
			rt.Fatalf("a claimed green the sensor confirms green must be ACCEPTED, got %+v", r2)
		}
	})
}

// TestPostCheck_Reproducible: identical input ⇒ identical verdict.
func TestPostCheck_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		turn := genPostCheckTurn(rt)
		live := map[string]goal.SensorState{"mirror.a": goal.SensorRed, "mirror.b": goal.SensorGreen}
		obs := observedSensors(turn, live)
		r1 := PostCheck(turn, PostCheckDecision{Allowed: true}, obs)
		r2 := PostCheck(turn, PostCheckDecision{Allowed: true}, obs)
		if !reflect.DeepEqual(r1, r2) {
			rt.Fatalf("PostCheck not reproducible:\n%+v\nvs\n%+v", r1, r2)
		}
	})
}

// confidenceInput builds a Drive input where two code-changing turns claim a flip the sensor
// MAY OR MAY NOT confirm — the claimed confidence is fixed, only the observed reading (the
// judge) varies between the two runs.
func confidenceInput(observedAgrees bool) DriveInput {
	g := goal.Goal{
		ID:      "goal-ba16",
		RedSet:  []string{"mirror.a", "mirror.b"},
		Status:  goal.StatusOpen,
		Budgets: goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000},
	}
	mkObserved := func(flip string) []SensorEffect {
		if observedAgrees {
			return nil // nil ⇒ the sensor confirms the claim verbatim
		}
		return []SensorEffect{{Mirror: flip, State: goal.SensorRed}} // the sensor disagrees: still red
	}
	mkWrite := func(target, flip string) ScriptedTurn {
		return ScriptedTurn{
			Action: agentimpl.Action{
				Target:      target,
				AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{target}},
			},
			Body:     agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target},
			Cost:     agentimpl.RunDelta{Tokens: 10, Turns: 1, WallClockSecs: 1},
			Effects:  []SensorEffect{{Mirror: flip, State: goal.SensorGreen}},
			Observed: mkObserved(flip),
		}
	}
	turns := []ScriptedTurn{mkWrite("app/a.go", "mirror.a"), mkWrite("app/b.go", "mirror.b")}
	h, rate := roomyBudget()
	return DriveInput{
		Impl:          permissiveImpl(),
		Goal:          g,
		RedWorkItem:   "item",
		ContextPack:   "pack",
		Sensors:       allRed(g),
		PriorGreen:    goal.PriorIntact,
		Mutation:      1.0,
		MutationFloor: 0.0,
		HarnessBudget: h,
		RatePerToken:  rate,
		Generator:     ScriptedGenerator{Turns: turns},
		StartedAt:     "2026-06-03T00:00:00Z",
		EndedAt:       "2026-06-03T00:05:00Z",
	}
}

// TestDrive_Property_ResultInvariantToClaimedConfidence: Drive's Result is computed by the
// VERDICTS (gate + post-check) + the sensor world, NEVER by the agent's claimed confidence.
// Two runs with the SAME claimed flips but OPPOSITE observed readings land OPPOSITE results:
// the one the mirror confirms closes green; the one the agent merely CLAIMS stays red.
func TestDrive_Property_ResultInvariantToClaimedConfidence(t *testing.T) {
	confirmed, err := Drive(confidenceInput(true))
	if err != nil {
		t.Fatalf("Drive errored (confirmed): %v", err)
	}
	if confirmed.Result != agentrun.ResultGreen {
		t.Fatalf("when the mirror CONFIRMS both flips, the run must close green, got %q", confirmed.Result)
	}
	claimedOnly, err := Drive(confidenceInput(false))
	if err != nil {
		t.Fatalf("Drive errored (claimed-only): %v", err)
	}
	if claimedOnly.Result != agentrun.ResultStillRed {
		t.Fatalf("when the mirror DISAGREES, the same claimed flips must NOT close the goal, got %q", claimedOnly.Result)
	}
	// And every claimed-only action is recorded NOT authorised (the post-check rejected each).
	for _, a := range claimedOnly.Actions {
		if a.Autorisee {
			t.Fatalf("a claimed-but-unconfirmed flip must be recorded Autorisee:false, got %+v", a)
		}
		if a.RaisonBlocage == nil || a.RaisonBlocage.Code != blockreason.CodeAgentPostCheckFailed {
			t.Fatalf("a post-check refusal must carry AGENT_POSTCHECK_FAILED, got %+v", a.RaisonBlocage)
		}
	}
}
