// drive.go — BA15: the deterministic LOOP SHELL of the governed build-agent. Drive is
// the runtime BELOW the line that claims a red work item, drives a session under the
// declared constraints, and emits a complete agentrun.AgentRun. It is the keystone the
// later BA-E3 steps wire a real provider/sandbox into — here it runs against a MOCK
// action generator (a deterministic scripted sequence) so the SHELL is provable without
// a live model.
//
// THE SHELL, TURN BY TURN (the roadmap, verbatim):
//
//  1. claim the red work item (lease it to the impl);
//  2. per turn, ask the ActionGenerator for the next action (the LLM is MOCKED by a
//     deterministic script — no model);
//  3. call GateAction (BA13, the single composed verdict) BEFORE the action executes —
//     the interceptor is on the path, never after;
//  4. on an ALLOWED verdict, execute the action (apply its declared sensor effects) and
//     record AgentAction{Autorisee:true};
//  5. on ANY false verdict, record AgentAction{Autorisee:false, RaisonBlocage:…} and DO
//     NOT execute (the wall holds — the effect never lands);
//  6. tick the RunMeter (BA11) with the turn's declared cost;
//  7. loop until goal.IsClosed (BA29/S29) OR a budget breach (CheckBudget) OR the
//     StopConditions are reached;
//  8. emit a complete agentrun.AgentRun via Record (BA-E1, the content-addressed ledger).
//
// THE WALL (CLAUDE.md §2/§8). GateAction is consulted BEFORE execution (step 3) — a write
// above the waterline lands Autorisee:false and the effect NEVER applies (step 5). Drive
// itself writes no truth: the AgentRun it returns is below the line (telemetry), and any
// truth a run would propose still goes idée → miroir → /goal. The Result is COMPUTED by
// goal.IsClosed (step 7), NEVER self-reported by the mock (§8: done is computed).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Drive is modelled on evolve.Evolve: a PURE shell
// over an INJECTED generator. No clock (now is SUPPLIED), no rng (the script is the only
// source of actions, deterministic), no I/O, no live LLM. Same (impl, item, pack, script,
// budget, now) ⇒ same AgentRun (and same content-addressed id). The single non-deterministic
// dependency — the LLM — is isolated behind the ActionGenerator seam (here a deterministic
// fake); the SHELL is all code (claim, gate, execute, tick, close), the arch-fitness rule
// (BA14) keeps the SDK out of every package but provider/. The reproducibility mirror
// (drive_property_test.go) pins same-input ⇒ same-run.
package agentloop

import (
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// SensorEffect is the declared effect a turn's action has on the goal's sensor verdicts
// WHEN IT EXECUTES (i.e. only on an allowed verdict). It is the MOCK's stand-in for "the
// agent changed code and the relevant mirror flipped": the script declares, per turn,
// which red-set mirror would go green. A refused action applies NO effect (the wall holds).
type SensorEffect struct {
	Mirror string           // the red-set mirror ref this turn's action would affect
	State  goal.SensorState // the verdict it would flip the mirror to (green on progress)
}

// ScriptedTurn is one entry of the deterministic mock script — the stand-in for one LLM
// turn. It declares the action the (mocked) model would attempt (the GateAction input),
// the AgentAction BODY to record on an allowed verdict (type/target — the wall stamps
// Autorisee/RaisonBlocage), the cost this turn consumes (fed to the RunMeter), and the
// sensor effects the action lands ONLY when allowed. A scripted turn is pure data — the
// LLM is replaced by reading this slice in order.
type ScriptedTurn struct {
	// Action is the GateAction input (BA13) evaluated BEFORE execution.
	Action agentimpl.Action
	// Body is the AgentAction recorded for this turn. Autorisee/RaisonBlocage are stamped
	// by Drive from the gate verdict (never trusted from the script — the wall decides).
	Body agentrun.AgentAction
	// Cost is the turn's declared cost delta, tallied into the RunMeter (BA11).
	Cost agentimpl.RunDelta
	// Effects are the sensor flips the action CLAIMS it lands ON EXECUTION (allowed verdict
	// only). For a code-changing action this is the agent's CLAIMED confidence — what it
	// believes its write/run_mirror achieved.
	Effects []SensorEffect

	// Observed is the deterministic SENSOR READING after the action ran — the JUDGE the BA16
	// post-check consults (modelling "the agent changed code; what does the mirror actually
	// report now?"). For a code-changing action the claimed Effects are ACCEPTED only when
	// Observed AGREES (the mirror is the judge, §8). nil ⇒ the sensor confirms the claimed
	// flips verbatim (the honest happy path); a disagreeing reading models the agent claiming
	// green while the mirror still reads red — the claim is REJECTED and the effect never
	// lands. For propose/read turns Observed is unused (no flip to confirm).
	Observed []SensorEffect

	// Prompt is the LLM-INPUT this turn would feed to GenerateAction (the rendered ContextPack
	// + transcript). HR04 wires the ContextCompressor in FRONT of generation: when a compressor
	// is set on the DriveInput AND this Prompt is non-empty, the loop COMPRESSES the prompt
	// before generation and CHARGES the meter the MEASURED token count of the (compressed)
	// prompt — the margin under the cap is extended, the cap is never relieved. The gate verdict
	// is invariant to this (HR03): the action the loop derives survives retrieve∘compress. An
	// empty Prompt falls back to the declared Cost.Tokens (the pre-HR04 behaviour, preserved).
	Prompt string
}

// ActionGenerator is the SEAM the LLM hides behind (modelled on evolve.Sampler): given
// the turn index, it returns the next action the agent would attempt and whether the
// session has more turns. It is INJECTED so Drive stays pure and provable without a model.
// The production generator (a real provider.Provider behind a deterministic translator,
// wired in BA17) implements this; the tests pass a deterministic scripted fake. The
// arch-fitness rule (BA14) keeps any LLM SDK out of every package but provider/.
type ActionGenerator interface {
	// Next returns the turn at index i and ok=true while the script has more turns; ok=false
	// signals the generator is exhausted (the agent has nothing more to attempt).
	Next(i int) (turn ScriptedTurn, ok bool)
}

// ScriptedGenerator is the deterministic MOCK ActionGenerator: a fixed slice of turns
// read in order. It is the stand-in for a live LLM so the loop shell is provable without
// a model — the keystone of the BA15 fixture mirror.
type ScriptedGenerator struct {
	Turns []ScriptedTurn
}

// Next reads the i-th scripted turn. Pure, total: out-of-range returns ok=false.
func (g ScriptedGenerator) Next(i int) (ScriptedTurn, bool) {
	if i < 0 || i >= len(g.Turns) {
		return ScriptedTurn{}, false
	}
	return g.Turns[i], true
}

// DriveInput is the pure input to Drive — the shell's full context, every value SUPPLIED
// (no ambient clock, no rng, no I/O). It mirrors the roadmap signature
// Drive(impl, item, pack, sensors, budget, now) with the gate's declared budgets and rate.
type DriveInput struct {
	// Impl is the runnable projection (BA02) the gate enforces against.
	Impl agentimpl.AgentImplementation
	// Goal is the /goal the run serves; its RedSet + IsClosed compute the Result (§8).
	Goal goal.Goal
	// RedWorkItem is the red-set item the run claims and works.
	RedWorkItem string
	// ContextPack is the ContextPack ref the run was given (S30, firewall-gated).
	ContextPack string

	// Sensors is the INITIAL sensor verdict map for the goal's red set — the world the
	// run starts in (a red set is red). The mock's executed effects flip entries green;
	// goal.IsClosed reads this evolving map to decide the Result (never the agent's claim).
	Sensors map[string]goal.SensorState
	// PriorGreen / Mutation / MutationFloor / Monsters are the OTHER non-gameable close
	// inputs (§8) — declared, read by goal.IsClosed, never produced by the loop.
	PriorGreen    goal.PriorGreenState
	Mutation      float64
	MutationFloor float64
	Monsters      []string

	// HarnessBudget (S51) and the goal Budgets (S29) are the two declared caps the gate's
	// budget axis reconciles via min() (BA11). RatePerToken is the declared cost-aware rate.
	HarnessBudget economics.HarnessCostBudget
	RatePerToken  float64

	// HookVerdicts are the per-hook binary verdicts the gate's hook axis reads (never the
	// agent's transcript — §8). nil ⇒ no hooks ran.
	HookVerdicts []agentimpl.HookVerdict

	// Generator is the action source — the MOCK (a ScriptedGenerator) in tests, a real
	// provider-backed generator in production (BA17). Injected so Drive stays pure.
	Generator ActionGenerator

	// Compressor is the OPTIONAL HR02/HR03 ContextCompressor wired in FRONT of GenerateAction
	// (HR04). nil ⇒ no compression (the pre-HR04 behaviour, every existing fixture preserved).
	// Non-nil ⇒ each turn's Prompt is compressed before generation and the meter is charged the
	// MEASURED token count of the compressed prompt (the margin under the cap is extended). It
	// is REPLACEABLE (CLAUDE.md §3) and the GATED determinism-first exception (§6/§8): it is
	// never authoritative — the gate verdict is invariant to it (HR03), it only lowers the
	// tokens measured. It NEVER relieves the cap (the EffectiveTokensCap is unchanged).
	Compressor rctx.ContextCompressor

	// StartedAt / EndedAt are the run's timestamps, SUPPLIED (no arg-less clock — the
	// determinism rule). They feed the recorded AgentRun verbatim.
	StartedAt string
	EndedAt   string

	// MaxTurns is the hard safety cap on loop iterations (the anti-runaway backstop beside
	// the budget gate). <= 0 falls back to the impl's MaxTurns (BA01); still 0 ⇒ a small
	// default so a buggy generator can never spin forever.
	MaxTurns int
}

// defaultMaxTurns is the hard backstop iteration cap when neither the input nor the impl
// declares one — so a buggy/exhaustionless generator can never spin the loop forever.
const defaultMaxTurns = 256

// effectiveMaxTurns resolves the hard iteration cap: the input's MaxTurns, else the impl's,
// else the backstop. Pure.
func effectiveMaxTurns(in DriveInput) int {
	if in.MaxTurns > 0 {
		return in.MaxTurns
	}
	if in.Impl.MaxTurns > 0 {
		return in.Impl.MaxTurns
	}
	return defaultMaxTurns
}

// copySensors returns a fresh copy of the initial sensor map so Drive never mutates the
// caller's input (purity: same input ⇒ same output, repeatedly).
func copySensors(src map[string]goal.SensorState) map[string]goal.SensorState {
	out := make(map[string]goal.SensorState, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}

// observedSensors builds the deterministic SENSOR READING the BA16 post-check consults for
// a code-changing turn — the JUDGE. It starts from the live sensor world, then:
//   - turn.Observed == nil  ⇒ the sensor CONFIRMS the claimed flips verbatim (the honest
//     happy path: the agent's write landed and the mirror now reads what it claimed);
//   - turn.Observed != nil  ⇒ the declared readings OVERRIDE (modelling the agent claiming a
//     mirror went green while the sensor still reads red — disagreement the post-check
//     catches). It is the only branch that can make the post-check reject a code action.
//
// Pure: it never mutates the caller's map (it copies first). For propose/read turns the
// result is unused (those natures have no claimed flip to confirm).
func observedSensors(turn ScriptedTurn, live map[string]goal.SensorState) map[string]goal.SensorState {
	obs := copySensors(live)
	if turn.Observed == nil {
		for _, e := range turn.Effects {
			obs[e.Mirror] = e.State
		}
		return obs
	}
	for _, e := range turn.Observed {
		obs[e.Mirror] = e.State
	}
	return obs
}

// stopInput packages the current sensor world + the declared non-gameable inputs into the
// goal.StopInput goal.IsClosed reads. Pure.
func (in DriveInput) stopInput(sensors map[string]goal.SensorState) goal.StopInput {
	return goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    in.PriorGreen,
		Mutation:      in.Mutation,
		MutationFloor: in.MutationFloor,
		Monsters:      in.Monsters,
	}
}

// Drive is the PURE, deterministic loop SHELL (BA15), with the live meter + halt-on-budget
// wired in (BA27). It claims the red work item, drives the (mocked) session turn by turn —
// gating EACH action BEFORE it executes, applying its effects only on an allowed verdict,
// ticking the RunMeter, and halting on the FIRST of goal.IsClosed / budget breach /
// generator exhaustion / the hard turn cap — then records a complete AgentRun whose Result
// is COMPUTED by goal.IsClosed (§8), never self-reported.
//
// It is modelled on evolve.Evolve: a pure shell over an INJECTED generator, no clock, no
// rng, no I/O, no live LLM. Same input ⇒ same AgentRun (and same content-addressed id).
// Drive discards the final meter; callers wanting the consumed cost (the panel/telemetry +
// the economics feed) call DriveWithEconomics, which returns the meter too (BA27).
func Drive(in DriveInput) (agentrun.AgentRun, error) {
	run, _, err := DriveWithEconomics(in)
	return run, err
}

// DriveWithEconomics is the BA27 loop: identical to Drive but it ALSO returns the run's
// final RunMeter — the CONSUMED cost the caller feeds to economics.Evaluate (S51/S29) via
// MeasuredCostOf / EvaluateRun. The meter is the SAME tally Drive carries; exposing it lets
// the harness economy finally SEE an AgentRun's spend (a gap BA27 closes — until now no
// AgentRun ever fed economics). Pure: same input ⇒ same (run, meter).
//
// THE HALT IS PRE-CALL (gap G3). Each turn's cost is PROJECTED onto the meter and the budget
// is checked BEFORE the turn starts: a turn that WOULD push the run past the effective cap
// (min of S29/S51, BA11 — authoritative) is REFUSED before it executes — its cost never
// lands in the meter and its effect never fires. The meter therefore NEVER crosses the cap
// (anti-runaway, proven pre-call by the property mirror).
func DriveWithEconomics(in DriveInput) (agentrun.AgentRun, agentimpl.RunMeter, error) {
	sensors := copySensors(in.Sensors)
	meter := agentimpl.RunMeter{}
	actions := make([]agentrun.AgentAction, 0, len(in.Goal.RedSet))
	maxTurns := effectiveMaxTurns(in)

	result := agentrun.ResultStillRed // default: the run ended without closing the goal

	for i := 0; i < maxTurns; i++ {
		// Terminal #1 — the goal closed (the non-gameable stop, computed by goal.IsClosed
		// over the EVOLVING sensor world; never the agent's claim — §8). Check FIRST so a
		// goal that opened already-green records zero actions and lands green.
		if goal.IsClosed(in.Goal, in.stopInput(sensors)) {
			result = agentrun.ResultGreen
			break
		}

		// Ask the MOCK for the next action (the LLM is scripted). Exhaustion is a terminal:
		// the agent has nothing more to attempt and the goal is still red.
		turn, ok := in.Generator.Next(i)
		if !ok {
			result = agentrun.ResultStillRed
			break
		}

		// Terminal #2 — PRE-CALL BUDGET HALT (gap G3) with HR04 COMPRESSION in front. PROJECT
		// the turn's cost onto the meter WITHOUT committing it, then check the budget. The TOKEN
		// axis of that cost is MEASURED through the (optional) ContextCompressor (turnDelta /
		// turnTokenCost): when a compressor is wired and the turn carries a Prompt, the loop
		// compresses the LLM-input BEFORE generation and charges the meter the SMALLER compacted
		// token count — the margin under the cap is extended, the cap is NEVER raised. A turn
		// that WOULD push the run past the cap is refused BEFORE it starts: its cost never lands
		// (the committed meter stays AT/below the cap) and its effect never fires. The gate's
		// budget axis (min() of the two caps, BA11) is authoritative. We record the breach
		// against this turn's body so the abandoned run names the would-be action and its
		// BlockReason. The gate verdict itself is INVARIANT to compression (HR03).
		projected := meter.Tally(turnDelta(in.Compressor, turn))
		if bv := agentimpl.CheckBudget(projected, in.HarnessBudget, in.Goal.Budgets, in.RatePerToken); !bv.WithinBudget {
			actions = append(actions, agentrun.AgentAction{
				Type:          turn.Body.Type,
				Cible:         turn.Body.Cible,
				Autorisee:     false,
				RaisonBlocage: bv.BlockReason,
			})
			result = agentrun.ResultAbandoned
			break
		}
		// The projection is within budget — COMMIT the tally (the turn starts).
		meter = projected

		// Step 3 — GATE THE ACTION BEFORE EXECUTION (the interceptor on the path). The
		// single composed verdict (BA13) covers every declared axis in precedence.
		dec := agentimpl.GateAction(
			in.Impl, turn.Action, meter,
			in.HarnessBudget, in.Goal.Budgets, in.RatePerToken,
			in.HookVerdicts,
		)

		rec := agentrun.AgentAction{Type: turn.Body.Type, Cible: turn.Body.Cible}
		if !dec.Allowed {
			// Step 5 — a false verdict: record the refusal and DO NOT execute. The effect
			// never lands (the wall holds). The loop continues (a refused action is not a
			// terminal — the agent may attempt a different, allowed action next turn).
			rec.Autorisee = false
			rec.RaisonBlocage = dec.BlockReason
			actions = append(actions, rec)
			continue
		}

		// Step 4 — ALLOWED by the gate: execute, then RE-CHECK deterministically (BA16). The
		// gate decided BEFORE (may it run?); the post-check decides AFTER (may its claimed
		// effect be ACCEPTED?), per the action's NATURE. The judge is the mirror/sensor, the
		// proposal's shape, or the read's no-op assertion — NEVER the agent's claimed
		// confidence (§8: done is computed, at the action grain). EVERY action is re-checked.
		observed := observedSensors(turn, sensors)
		pc := PostCheck(turn, PostCheckDecision{Allowed: true}, observed)
		if !pc.Accepted {
			// The post-check refused to ACCEPT the effect: the mirror disagreed with the
			// claimed flip, the proposal was malformed, the read had a side effect, or the
			// nature carries no post-check (a determinism gap). Record the action as NOT
			// authorised with the post-check BlockReason; the effect NEVER lands.
			rec.Autorisee = false
			rec.RaisonBlocage = pc.BlockReason
			actions = append(actions, rec)
			continue
		}

		// ACCEPTED: the deterministic judge agrees. Apply the declared sensor effects (this
		// is where the mock "makes progress" toward goal.IsClosed) and record the authorised
		// action. A propose/read accepts with NO sensor flip (the shape/no-op post-checks
		// guarantee Effects is empty for those natures).
		rec.Autorisee = true
		for _, e := range turn.Effects {
			sensors[e.Mirror] = e.State
		}
		actions = append(actions, rec)
	}

	// One final close check so a run whose LAST allowed turn closed the goal records green
	// (the loop checks at the TOP of each iteration; the last turn's effects land just below).
	if result == agentrun.ResultStillRed && goal.IsClosed(in.Goal, in.stopInput(sensors)) {
		result = agentrun.ResultGreen
	}

	run := agentrun.AgentRun{
		Agent:       in.Impl.LayerRef,
		Goal:        in.Goal.ID,
		RedWorkItem: in.RedWorkItem,
		ContextPack: in.ContextPack,
		Actions:     actions,
		Result:      result,
		StartedAt:   in.StartedAt,
		EndedAt:     in.EndedAt,
	}
	recorded, err := agentrun.Record(run)
	return recorded, meter, err
}

// FinalMeter exposes the run's total RunMeter for the panel/telemetry. Since BA27 it simply
// re-drives via DriveWithEconomics and returns the authoritative meter — there is ONE meter
// (Drive's), never a second replay that could drift from it. Pure: same input ⇒ same meter.
// The error is swallowed (a malformed run is the panel's problem, not the meter's); callers
// wanting the error use DriveWithEconomics directly.
func FinalMeter(in DriveInput) agentimpl.RunMeter {
	_, meter, _ := DriveWithEconomics(in)
	return meter
}
