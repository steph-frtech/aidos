// drive_fixture_test.go — the BA15 fixture mirror (state→command→events), RED first.
// It pins Drive, the deterministic loop SHELL, against a MOCK action generator (a
// deterministic scripted sequence — no live LLM). Each fixture is a state→command→event
// triple: a DriveInput (the impl + goal + initial sensors + scripted turns + budget +
// supplied timestamps — the STATE), Drive (the COMMAND), and the expected AgentRun (the
// EVENTS: the ordered actions with their wall verdicts + the computed Result).
//
// THE KEYSTONE FIXTURE (the roadmap, verbatim): a sequence with an above-the-line write
// yields a run whose THAT action is Autorisee:false (the wall holds — gated BEFORE
// execution, effect never lands) and whose Result is COMPUTED by goal.IsClosed, NEVER
// self-reported by the mock (§8: done is computed).
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// permissiveImpl is a governed projection that ALLOWS the canonical happy-path write into
// the app tree: it grants the app/ root, carries the wall in ForbiddenPaths, binds no
// mandatory hook (so the hook axis is satisfied), and declares a generous MaxTurns.
func permissiveImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:       "couche-agent@deadbeef",
		AllowedPaths:   []string{"app/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		Hooks:          nil,
		MaxTurns:       64,
	}
}

// twoMirrorGoal is a /goal whose red set is two mirrors; both must go green for IsClosed.
func twoMirrorGoal() goal.Goal {
	return goal.Goal{
		ID:      "goal-ba15",
		RedSet:  []string{"mirror.a", "mirror.b"},
		Status:  goal.StatusOpen,
		Budgets: goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000},
	}
}

// roomyBudget keeps every cap well clear so only the SCRIPTED terminal (close / breach)
// fires when the fixture intends it.
func roomyBudget() (economics.HarnessCostBudget, float64) {
	return economics.HarnessCostBudget{
		CellRef: "cell-ba15", MaxCIMinutes: 10_000, MaxLLMTokensPerGoal: 1_000_000,
	}, 0.000001
}

// allRed is the initial sensor world: every red-set mirror failing.
func allRed(g goal.Goal) map[string]goal.SensorState {
	m := make(map[string]goal.SensorState, len(g.RedSet))
	for _, ref := range g.RedSet {
		m[ref] = goal.SensorRed
	}
	return m
}

// writeAction is an allowed write into the app tree (not a determinism gap: a write tool,
// RequestedLLM false). target is where it writes; it flips `flip` green on execution.
func writeTurn(target, flip string) ScriptedTurn {
	return ScriptedTurn{
		Action: agentimpl.Action{
			Target:      target,
			AgentAction: agentimpl.AgentAction{Tool: "write", Args: []string{target}},
		},
		Body:    agentrun.AgentAction{Type: agentrun.ActionWrite, Cible: target},
		Cost:    agentimpl.RunDelta{Tokens: 10, Turns: 1, WallClockSecs: 1},
		Effects: []SensorEffect{{Mirror: flip, State: goal.SensorGreen}},
	}
}

// baseInput wires a DriveInput with the permissive impl, the two-mirror goal, all-red
// sensors, the roomy budget, prior-green intact and a passing mutation floor — so the
// ONLY thing that closes the goal is the scripted turns flipping both mirrors green.
func baseInput(g goal.Goal, turns []ScriptedTurn) DriveInput {
	h, rate := roomyBudget()
	return DriveInput{
		Impl:          permissiveImpl(),
		Goal:          g,
		RedWorkItem:   "item-1",
		ContextPack:   "pack-1",
		Sensors:       allRed(g),
		PriorGreen:    goal.PriorIntact,
		Mutation:      1.0,
		MutationFloor: 0.0,
		Monsters:      nil,
		HarnessBudget: h,
		RatePerToken:  rate,
		HookVerdicts:  nil,
		Generator:     ScriptedGenerator{Turns: turns},
		StartedAt:     "2026-06-03T00:00:00Z",
		EndedAt:       "2026-06-03T00:05:00Z",
	}
}

// --- The KEYSTONE: an above-the-line write is Autorisee:false; Result is computed -------

func TestDrive_AboveLineWrite_IsRefused_ResultComputed(t *testing.T) {
	g := twoMirrorGoal()
	// Turn 1: a write ABOVE the line (the kernel schema) — must be refused, effect never
	// lands. Turn 2 & 3: legal writes that flip both red-set mirrors green → IsClosed.
	turns := []ScriptedTurn{
		// above-the-line write: it claims to flip mirror.a, but it is REFUSED so the
		// effect must NOT apply (the wall holds).
		func() ScriptedTurn {
			tn := writeTurn("back/kernel/expr.go", "mirror.a")
			return tn
		}(),
		writeTurn("app/a.go", "mirror.a"),
		writeTurn("app/b.go", "mirror.b"),
	}
	in := baseInput(g, turns)

	run, err := Drive(in)
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}

	// Exactly three actions, in order.
	if len(run.Actions) != 3 {
		t.Fatalf("want 3 recorded actions, got %d: %+v", len(run.Actions), run.Actions)
	}

	// Action 1 — the above-the-line write — MUST be refused, with the wall BlockReason.
	a0 := run.Actions[0]
	if a0.Autorisee {
		t.Fatalf("above-the-line write must be Autorisee:false, got %+v", a0)
	}
	if a0.RaisonBlocage == nil || a0.RaisonBlocage.Code != "AGENT_WRITE_ABOVE_WATERLINE" {
		t.Fatalf("refused write must carry AGENT_WRITE_ABOVE_WATERLINE, got %+v", a0.RaisonBlocage)
	}

	// Actions 2 & 3 — legal writes — allowed.
	if !run.Actions[1].Autorisee || !run.Actions[2].Autorisee {
		t.Fatalf("legal writes must be allowed, got %+v", run.Actions[1:])
	}

	// The Result is COMPUTED by goal.IsClosed (both mirrors flipped green by the two
	// LEGAL writes — the refused turn's effect never landed), NEVER self-reported.
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("Result must be green (both mirrors flipped by legal writes), got %q", run.Result)
	}

	// The id is content-addressed (Record stamped it).
	if run.ID == "" {
		t.Fatalf("Record must stamp a content-addressed id")
	}
}

// If ONLY the above-the-line write would have flipped a mirror (and it is refused), the
// goal stays red — the Result must be still_red, proving the refused effect never landed.
func TestDrive_RefusedWriteEffectNeverLands_StaysRed(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{
		writeTurn("back/kernel/expr.go", "mirror.a"), // refused → mirror.a stays red
		writeTurn("app/b.go", "mirror.b"),            // allowed → mirror.b green
	}
	in := baseInput(g, turns)

	run, err := Drive(in)
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultStillRed {
		t.Fatalf("with mirror.a never flipped (refused effect), Result must be still_red, got %q", run.Result)
	}
	if run.Actions[0].Autorisee {
		t.Fatalf("the above-the-line write must be refused")
	}
}

// The happy path: the goal opens green-able by the script; both legal writes flip the
// mirrors; the run lands green having executed both effects.
func TestDrive_HappyPath_BothMirrorsFlip_Green(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	run, err := Drive(baseInput(g, turns))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("happy path must close green, got %q", run.Result)
	}
	if len(run.Actions) != 2 || !run.Actions[0].Autorisee || !run.Actions[1].Autorisee {
		t.Fatalf("both writes must be allowed, got %+v", run.Actions)
	}
}

// A goal that opens ALREADY closed (sensors all green) records ZERO actions and lands
// green immediately — the close check is at the TOP of the loop.
func TestDrive_AlreadyClosed_NoActions_Green(t *testing.T) {
	g := twoMirrorGoal()
	in := baseInput(g, []ScriptedTurn{writeTurn("app/a.go", "mirror.a")})
	in.Sensors = map[string]goal.SensorState{"mirror.a": goal.SensorGreen, "mirror.b": goal.SensorGreen}

	run, err := Drive(in)
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultGreen {
		t.Fatalf("already-closed goal must land green, got %q", run.Result)
	}
	if len(run.Actions) != 0 {
		t.Fatalf("already-closed goal must record zero actions, got %+v", run.Actions)
	}
}

// A budget breach abandons the run with Result:abandoned and the budget BlockReason on
// the breaching action — proving the meter ticks BEFORE the budget check (BA11/BA27).
func TestDrive_BudgetBreach_Abandoned(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 15} // cap below the 2nd turn's cumulative tokens
	turns := []ScriptedTurn{writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")}
	in := baseInput(g, turns)
	in.Goal = g

	run, err := Drive(in)
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultAbandoned {
		t.Fatalf("over-budget run must be abandoned, got %q", run.Result)
	}
	last := run.Actions[len(run.Actions)-1]
	if last.Autorisee || last.RaisonBlocage == nil || last.RaisonBlocage.Code != "AGENT_BUDGET_EXCEEDED" {
		t.Fatalf("breaching action must carry AGENT_BUDGET_EXCEEDED, got %+v", last)
	}
}

// Generator exhaustion with the goal still red lands still_red (the agent ran out of
// scripted moves).
func TestDrive_GeneratorExhausted_StillRed(t *testing.T) {
	g := twoMirrorGoal()
	// Only one legal write flips mirror.a; mirror.b is never touched.
	run, err := Drive(baseInput(g, []ScriptedTurn{writeTurn("app/a.go", "mirror.a")}))
	if err != nil {
		t.Fatalf("Drive errored: %v", err)
	}
	if run.Result != agentrun.ResultStillRed {
		t.Fatalf("exhausted-generator unclosed goal must be still_red, got %q", run.Result)
	}
}
