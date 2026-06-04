// scenario.go — the DETERMINISTIC scenario library the agentloop MCP server drives.
//
// The MCP server is the capability door over agentloop.Drive (BA15) — the runnable loop
// SHELL. A real run is driven by a live LLM behind provider.Provider (BA17); HERE, for the
// governed, reproducible MCP surface, the action source is a DECLARED scripted scenario (a
// ScriptedGenerator). The server selects one scenario by name, projects the requested
// governed layer into its AgentImplementation, builds a pure agentloop.DriveInput, and runs
// Drive. Same (layer_ref, scenario, work item) ⇒ same AgentRun (the reproducibility mirror
// pins it). The LLM is NOT here — this server proves the SHELL + the wall on the call path,
// not generation (BA17 swaps the ScriptedGenerator for a provider-backed one).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): scenario selection + DriveInput assembly are pure,
// total functions; no clock, rng, or I/O. Timestamps are SUPPLIED (the determinism rule).
package main

import (
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentloop"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// The declared scenario names (a CLOSED set — the server rejects any other). Each is a
// deterministic ScriptedGenerator the journey mirror exercises.
const (
	// ScenarioHappy — write the allowed projection, then run the red mirror green ⇒ green.
	ScenarioHappy = "happy"
	// ScenarioKernelWrite — the first turn attempts a write to the kernel schema; the wall
	// refuses it in place (Autorisee:false, AGENT_WRITE_ABOVE_WATERLINE), the run continues.
	ScenarioKernelWrite = "kernel-write"
	// ScenarioOverBudget — the first turn's cost exceeds the declared budget ⇒ abandoned.
	ScenarioOverBudget = "over-budget"
)

// scenarioNames is the deterministic, sorted enumeration (for the list tool / panel).
func scenarioNames() []string {
	ns := []string{ScenarioHappy, ScenarioKernelWrite, ScenarioOverBudget}
	sort.Strings(ns)
	return ns
}

// isKnownScenario reports whether name is one of the declared scenarios.
func isKnownScenario(name string) bool {
	for _, n := range scenarioNames() {
		if n == name {
			return true
		}
	}
	return false
}

// theMirror is the single red-set mirror every scenario works (one red mirror, per the
// journey feature). Kept here so the goal + the scripted flip name the SAME ref.
const theMirror = "redset:checkout.mirror"

// scenarioGoal is the /goal a driven run serves: one red mirror, a generous budget so only
// the SCRIPTED terminal fires when intended. Pure.
func scenarioGoal(goalID string) goal.Goal {
	return goal.Goal{
		ID:      goalID,
		RedSet:  []string{theMirror},
		Status:  goal.StatusOpen,
		Budgets: goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000},
	}
}

// roomyBudget keeps the harness caps well clear for happy/kernel-write; over-budget uses a
// tight cap (tightBudget) so the breach fires deterministically.
func roomyBudget() (economics.HarnessCostBudget, float64) {
	return economics.HarnessCostBudget{
		CellRef: "cell-ba19", MaxCIMinutes: 10_000, MaxLLMTokensPerGoal: 1_000_000,
	}, 0.000001
}

// tightBudget caps tokens below the over-budget scenario's first-turn cost so CheckBudget
// trips on the first tick (the abandon terminal).
func tightBudget() (economics.HarnessCostBudget, float64) {
	return economics.HarnessCostBudget{
		CellRef: "cell-ba19", MaxCIMinutes: 10_000, MaxLLMTokensPerGoal: 5,
	}, 0.000001
}

// writeTurn is an allowed write into the app tree that flips the red mirror green on
// execution. Tool "write", RequestedLLM false ⇒ not a determinism gap.
func writeTurn(target, flip string) agentloop.ScriptedTurn {
	return agentloop.ScriptedTurn{
		Action: agentimpl.Action{
			Target:      target,
			AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{target}},
		},
		Body:    agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target},
		Cost:    agentimpl.RunDelta{Tokens: 10, Turns: 1, WallClockSecs: 1},
		Effects: []agentloop.SensorEffect{{Mirror: flip, State: goal.SensorGreen}},
	}
}

// kernelWriteTurn is a write to the kernel schema — the wall MUST refuse it in place. It
// claims to flip the mirror but, refused, the effect never lands (the wall holds).
func kernelWriteTurn() agentloop.ScriptedTurn {
	const target = "kernel/order"
	return agentloop.ScriptedTurn{
		Action: agentimpl.Action{
			Target:      target,
			AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{target}},
		},
		Body:    agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target},
		Cost:    agentimpl.RunDelta{Tokens: 10, Turns: 1, WallClockSecs: 1},
		Effects: []agentloop.SensorEffect{{Mirror: theMirror, State: goal.SensorGreen}},
	}
}

// scenarioTurns returns the scripted turns for the named scenario. The happy scenario writes
// the allowed projection then closes; kernel-write attempts a forbidden write first then
// writes the allowed projection; over-budget attempts an expensive write that breaches.
func scenarioTurns(name string) []agentloop.ScriptedTurn {
	switch name {
	case ScenarioHappy:
		return []agentloop.ScriptedTurn{writeTurn("app/checkout.go", theMirror)}
	case ScenarioKernelWrite:
		return []agentloop.ScriptedTurn{kernelWriteTurn(), writeTurn("app/checkout.go", theMirror)}
	case ScenarioOverBudget:
		// One expensive turn; tightBudget caps tokens below its cost ⇒ breach on the tick.
		t := writeTurn("app/checkout.go", theMirror)
		t.Cost = agentimpl.RunDelta{Tokens: 1_000_000, Turns: 1, WallClockSecs: 1}
		return []agentloop.ScriptedTurn{t}
	default:
		return nil
	}
}

// satisfiedHooks builds a GREEN HookVerdict for every MANDATORY hook the impl declares —
// modelling "the mandatory PreToolUse wall hook ran and passed for this turn". The verdict
// is the binary's OWN outcome (never an agent claim — §8); here, deterministically green so
// the journey's hook axis is satisfied. A run whose mandatory hook went red is a separate
// gate fixture (BA13), not this happy journey.
func satisfiedHooks(impl agentimpl.AgentImplementation) []agentimpl.HookVerdict {
	var vs []agentimpl.HookVerdict
	for _, h := range impl.Hooks {
		if h.Mandatory {
			vs = append(vs, agentimpl.HookVerdict{Phase: h.Phase, Hook: h.Hook, Ran: true, Green: true})
		}
	}
	return vs
}

// allRed is the initial sensor world: the red mirror failing.
func allRed(g goal.Goal) map[string]goal.SensorState {
	m := make(map[string]goal.SensorState, len(g.RedSet))
	for _, ref := range g.RedSet {
		m[ref] = goal.SensorRed
	}
	return m
}

// buildDriveInput assembles the PURE DriveInput for a scenario: the projected impl, the
// one-mirror goal, all-red sensors, prior-green intact + a passing mutation floor (so only
// the scripted turns close the goal), the budget (roomy or tight), and SUPPLIED timestamps.
func buildDriveInput(impl agentimpl.AgentImplementation, scenario, goalID, redWorkItem, contextPack, startedAt, endedAt string) agentloop.DriveInput {
	g := scenarioGoal(goalID)
	var h economics.HarnessCostBudget
	var rate float64
	if scenario == ScenarioOverBudget {
		h, rate = tightBudget()
	} else {
		h, rate = roomyBudget()
	}
	return agentloop.DriveInput{
		Impl:          impl,
		Goal:          g,
		RedWorkItem:   redWorkItem,
		ContextPack:   contextPack,
		Sensors:       allRed(g),
		PriorGreen:    goal.PriorIntact,
		Mutation:      1.0,
		MutationFloor: 0.0,
		HarnessBudget: h,
		RatePerToken:  rate,
		HookVerdicts:  satisfiedHooks(impl),
		Generator:     agentloop.ScriptedGenerator{Turns: scenarioTurns(scenario)},
		StartedAt:     startedAt,
		EndedAt:       endedAt,
		MaxTurns:      64,
	}
}
