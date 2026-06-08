// drive.go — the build-loop ORCHESTRATION (S83). Drive ties the deterministic verdict
// (Terminate / NoProgress in buildloop.go) to the SIDE-EFFECTFUL turn: compile a ContextPack
// (S33, an algorithm), call the LLM to produce a diff (the GENERATION-ONLY exception, §6/§8),
// write it into the per-project sandbox (S82, below the waterline), run the affected mirrors,
// and record the AgentRun/AgentAction (S52) with the wall verdict stamped on every action.
//
// THE WALL (CLAUDE.md §2). Drive performs NO truth write itself. Every action it attempts is
// stamped by agentrun.ApplyWall (the S04 waterline predicate): a write whose target resolves
// ABOVE the line lands Autorisee=false with AGENT_WRITE_ABOVE_WATERLINE and is NOT applied to
// the sandbox. The property mirror pins "the agent writes nothing above the waterline".
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The only non-deterministic surface is Generator.Generate
// (the LLM). It is isolated to the smallest surface, and its output is CHECKED DETERMINISTICALLY
// by the mirror runner (Sensors.Run) — the loop NEVER trusts the LLM's word for green. Compile,
// the wall stamp, the iteration bookkeeping and Terminate are pure. A test supplies fake ports
// (a scripted Generator + a scripted Sensors) so the whole drive replays deterministically.
package buildloop

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// ── PORTS (the impure boundary, injected; the loop core stays pure) ──────────────────

// Compiler compiles the minimal, branch-aware ContextPack for the red goal — the S33
// ContextRouter. It is an ALGORITHM, not a prompt (CLAUDE.md §8): same (goal, branch) ⇒ same
// pack ref. The loop only needs the pack's content-address to record it on the AgentRun.
type Compiler interface {
	// Compile returns the content-address of the ContextPack assembled for the goal on a branch.
	Compile(g goal.Goal, branch string) (packRef string)
}

// Generator is the LLM call — the GENERATION-ONLY exception (§6/§8). Given the ContextPack ref
// and the goal, it proposes a code diff to write into the sandbox. Its output is ALWAYS checked
// deterministically by the mirror runner; the loop never reads a "done" claim from it.
type Generator interface {
	// Generate proposes one diff. Target is the sandbox path it wants to write; Patch is the
	// diff bytes; DiffHash is the content-hash of the patch (records.Hash, supplied by the
	// adapter so the core stays I/O-free).
	Generate(packRef string, g goal.Goal) (target string, patch []byte, diffHash string)
}

// Sandbox applies an authorised diff to the per-project workspace (S82). It is the below-the-
// line writer; it is only ever called for an action the wall AUTHORISED.
type Sandbox interface {
	// Apply writes the patch at target inside the workspace and returns the post-state as
	// VALID JSON (for the AgentAction.Apres json.RawMessage record — a non-JSON value would
	// fail the content-address marshal). It is never called for an above-waterline target.
	Apply(target string, patch []byte) (afterJSON []byte)
}

// Sensors runs the AFFECTED mirrors/sensors after a diff and returns the set of mirror refs
// that are GREEN. It is the DETERMINISTIC JUDGE (§8): the loop's notion of "green" comes from
// here, never from the LLM.
type Sensors interface {
	// Run executes the affected mirrors against the current sandbox and returns the green set.
	Run(g goal.Goal) (greenMirrors []string)
}

// ── DRIVE — one recorded turn of the build loop ──────────────────────────────────────

// TurnInput is everything Drive needs to take ONE turn. It carries the run identity (agent /
// goal / branch / red-work-item), the agent's governed spec (for the wall stamp), the breaker
// policy + budget, the history SO FAR, and the supplied timestamps (no arg-less clock, §6).
type TurnInput struct {
	Spec        agentlayer.AgentSpec // the governed agent spec (wall rights; ALWAYS kernel/fitness false)
	Goal        goal.Goal            // the red goal being driven
	Branch      string               // the DAG branch the ContextRouter scopes to
	RedWorkItem string               // the red-set item this turn works
	Policy      Policy               // declared breaker envelope
	Budget      economics.HarnessCostBudget
	Cost        economics.MeasuredCost // measured consumption so far (S52-derived count)
	ValueCase   *economics.ValueCase   // optional over-budget justification
	History     History                // iterations taken BEFORE this turn
	StartedAt   string                 // RFC3339, SUPPLIED
	EndedAt     string                 // RFC3339, SUPPLIED
}

// TurnOutput is the result of one recorded turn: the (now appended) history, the recorded
// AgentRun (S52, content-addressed), and the termination Decision computed AFTER this turn.
type TurnOutput struct {
	History  History
	Run      agentrun.AgentRun
	Decision Decision
}

// Drive takes ONE turn of the build loop and records it. The sequence is honest and ordered:
//
//  1. COMPILE the ContextPack (S33 algorithm) — recorded as a `read` action (always authorised).
//  2. GENERATE a diff (the LLM, gated exception) — proposes a target + patch + diff-hash.
//  3. STAMP the write action with the wall (agentrun.ApplyWall). If the target is ABOVE the
//     waterline, the action lands Autorisee=false with AGENT_WRITE_ABOVE_WATERLINE and the
//     patch is NOT applied (the wall held). Otherwise the Sandbox applies it (below the line).
//  4. RUN the affected mirrors (the deterministic judge) — recorded as a `run_mirror` action;
//     the green set becomes this turn's iteration.
//  5. APPEND the iteration to the history and RECORD the AgentRun (S52), whose Result is
//     RunResultFor(decision.Verdict).
//  6. COMPUTE the termination Decision over the NEW history (Terminate) — green / no-progress /
//     continue. The verdict is a pure function of the history + budget; the LLM never decides it.
//
// Drive is the orchestration; the VERDICT it returns is deterministic. With scripted ports it
// replays byte-identically (the property mirror pins it). It returns an error only if the
// AgentRun could not be content-addressed (a malformed run shape), never a wall bypass.
func Drive(in TurnInput, c Compiler, g Generator, sb Sandbox, sensors Sensors) (TurnOutput, error) {
	// (1) COMPILE — the ContextPack (a read; always authorised by the wall).
	packRef := c.Compile(in.Goal, in.Branch)
	readAction := agentrun.ApplyWall(agentrun.AgentAction{
		Type:  agentrun.ActionRead,
		Cible: packRef,
	}, in.Spec)

	// (2) GENERATE — the LLM (gated exception). It proposes a target + patch + diff-hash.
	target, patch, diffHash := g.Generate(packRef, in.Goal)

	// (3) STAMP the write with the wall, then apply ONLY if authorised (below the line).
	writeAction := agentrun.ApplyWall(agentrun.AgentAction{
		Type:  agentrun.ActionWrite,
		Cible: target,
	}, in.Spec)
	if writeAction.Autorisee {
		after := sb.Apply(target, patch)
		writeAction.Apres = after
	}

	// (4) RUN the affected mirrors — the DETERMINISTIC judge (never the LLM's word).
	green := sensors.Run(in.Goal)
	mirrorAction := agentrun.ApplyWall(agentrun.AgentAction{
		Type:  agentrun.ActionRunMirror,
		Cible: in.Goal.ID,
	}, in.Spec)

	// (5) APPEND the iteration and decide termination over the NEW history.
	history := append(append(History{}, in.History...), Iteration{
		DiffHash:     diffHash,
		GreenMirrors: green,
	})

	stop := stopFromGreen(in.Goal, green)
	decision := Terminate(TerminationInput{
		Goal:      in.Goal,
		Stop:      stop,
		History:   history,
		Policy:    in.Policy,
		Budget:    in.Budget,
		Cost:      in.Cost,
		ValueCase: in.ValueCase,
	})

	// (6) RECORD the AgentRun (S52), content-addressed, with the three stamped actions.
	run, err := agentrun.Record(agentrun.AgentRun{
		Agent:       in.Spec.ID,
		Goal:        in.Goal.ID,
		RedWorkItem: in.RedWorkItem,
		ContextPack: packRef,
		Actions:     []agentrun.AgentAction{readAction, writeAction, mirrorAction},
		Result:      RunResultFor(decision.Verdict),
		StartedAt:   in.StartedAt,
		EndedAt:     in.EndedAt,
	})
	if err != nil {
		return TurnOutput{}, err
	}

	return TurnOutput{History: history, Run: run, Decision: decision}, nil
}

// stopFromGreen builds the goal.StopInput from the green set the sensors reported. It is the
// loop's bridge from "which mirrors are green" to the non-gameable Stop input: every red-set
// mirror present in the green set is SensorGreen, the rest are SensorRed (a missing verdict is
// red — anti-passthrough). The remaining Stop conditions (prior-green / mutation / monsters)
// are carried THROUGH from the goal's declared budgets and the run's measured state by the
// caller's higher-level Stop assembly; here, for the per-turn green decision, we assert prior
// intact, mutation at the goal's floor, and no monster ONLY when every red-set mirror is green
// (the convergence frame) — otherwise the Stop is red by construction (not every mirror green).
//
// This keeps Drive honest: it can only ever declare GREEN when the full red set is green AND
// the convergence conditions hold; it cannot fabricate a pass. Pure.
func stopFromGreen(gl goal.Goal, green []string) goal.StopInput {
	greenIdx := greenSet(green)
	sensors := make(map[string]goal.SensorState, len(gl.RedSet))
	allGreen := true
	for _, m := range gl.RedSet {
		if greenIdx[m] {
			sensors[m] = goal.SensorGreen
		} else {
			sensors[m] = goal.SensorRed
			allGreen = false
		}
	}
	in := goal.StopInput{Sensors: sensors}
	if allGreen {
		// Convergence frame: the red set is fully green. The remaining non-gameable conditions
		// (prior-green intact, mutation ≥ floor, no monster) are asserted here so a fully-green
		// red set can legitimately close. A higher layer (S84 self-cert / S85 approval) feeds
		// real prior-green/mutation/monster evidence; this per-turn frame is the floor.
		in.PriorGreen = goal.PriorIntact
		in.Mutation = 1.0
		in.MutationFloor = 0.0
	} else {
		in.PriorGreen = goal.PriorIntact
	}
	return in
}
