// Command goal-check is the AIDOS Stop:goal-check hook (S29) — the NON-GAMEABLE stop
// gate of KRD §57 Algorithme ① / §8.
//
// At the end of a run it REFUSES to let a goal close unless the four computed conditions
// hold: the red set has gone green ∧ prior green is intact ∧ the mutation score is ≥ the
// declared floor ∧ there is no monster. It does NOT trust the agent's claim of "done" —
// "done" is COMPUTED. The default harness stop is weak (the agent grades its own copy);
// this hook is KRD's contribution: the close is decided by the pure predicate, never by
// the agent's confidence (there is no confidence field on the event).
//
// COMPOSES ADDITIVELY (CLAUDE.md §5 meta-loop): this is a SEPARATE Stop binary, a sibling
// of the completeness Stop gate (back/hooks/stop). It ADDS the goal-close guardrail; it
// removes none. A harness may wire both Stop hooks — a Stop is admitted only if EVERY Stop
// gate allows it.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the hook DEFERS to the pure goal predicates
// (goal.IsClosed, goal.CloseBlockReason) — it never re-implements the stop rule. The
// verdict is a pure, total function of (goal, sensors, prior-green, mutation, monsters);
// the same input always yields the same verdict. The fault-injection test (main_test.go)
// leaves one red mirror (or breaks a prior green) and asserts the gate BLOCKS the close.
//
// THE WALL (CLAUDE.md §2): the hook reads the live verdicts from an INJECTED event — it
// does NOT reach into the kernel/mirrors/fitness schemas (the agent has no grant). The
// sensor/mutation/monster status is fed by the harness/the sensor + mutation runners. An
// unparseable event fails CLOSED (block): a Stop that cannot be verified does not pass
// (KRD §82 anti-passthrough).
package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

const (
	exitAllow = 0 // allow the goal to close (the Stop passes this gate)
	exitBlock = 2 // block the close (a condition fails)
)

// Event is the decoded Stop:goal-check event the harness feeds on stdin. It carries the
// goal's red set plus the INJECTED live verdicts the stop predicate reads — never a kernel
// read. There is DELIBERATELY no agent-confidence field: the engine never grades the agent.
type Event struct {
	// RedSet is the goal's ordered red-set mirror refs (the todo-list, §56).
	RedSet []string `json:"red_set"`
	// Sensors maps each red-set mirror ref to its live verdict ("green" | "red"). A
	// missing entry is treated as red (anti-passthrough: cannot close on absent evidence).
	Sensors map[string]string `json:"sensors"`
	// PriorGreen is whether the prior green corpus is intact ("intact" | "broken").
	PriorGreen string `json:"prior_green"`
	// Mutation is the current mutation score (0..1).
	Mutation float64 `json:"mutation"`
	// MutationFloor is the DECLARED threshold (never learned). Mutation must be ≥ floor.
	MutationFloor float64 `json:"mutation_floor"`
	// Monsters are the current monster findings. Any ⇒ block.
	Monsters []string `json:"monsters"`
}

// DecodeEvent reads one JSON event. A decode error is surfaced; Run fails closed (block).
func DecodeEvent(r io.Reader) (Event, error) {
	var ev Event
	if err := json.NewDecoder(r).Decode(&ev); err != nil {
		return Event{}, err
	}
	return ev, nil
}

// toStopInput maps the injected event to the pure goal.StopInput. An unknown sensor value
// is treated as red (not green), so the gate cannot close on a missing/garbled verdict.
func toStopInput(ev Event) (goal.Goal, goal.StopInput) {
	sensors := make(map[string]goal.SensorState, len(ev.Sensors))
	for ref, v := range ev.Sensors {
		if v == string(goal.SensorGreen) {
			sensors[ref] = goal.SensorGreen
		} else {
			sensors[ref] = goal.SensorRed
		}
	}
	prior := goal.PriorBroken
	if ev.PriorGreen == string(goal.PriorIntact) {
		prior = goal.PriorIntact
	}
	g := goal.Goal{Status: goal.StatusOpen, RedSet: ev.RedSet}
	in := goal.StopInput{
		Sensors:       sensors,
		PriorGreen:    prior,
		Mutation:      ev.Mutation,
		MutationFloor: ev.MutationFloor,
		Monsters:      ev.Monsters,
	}
	return g, in
}

// Decision is the hook's verdict: allow the close, or block it with the actionable
// GOAL_STILL_RED BlockReason.
type Decision struct {
	Block       bool
	BlockReason *blockreason.BlockReason
}

// Evaluate is the hook's PURE decision, deferring to goal.CloseBlockReason: nil ⇒ allow
// the close (all four conditions hold), else block with GOAL_STILL_RED.
func Evaluate(ev Event) Decision {
	g, in := toStopInput(ev)
	if br := goal.CloseBlockReason(g, in); br != nil {
		return Decision{Block: true, BlockReason: br}
	}
	return Decision{Block: false}
}

// Run is the binary entrypoint: read the event on stdin, evaluate it, return the exit code
// (0 = allow close, 2 = block close). On block it writes the BlockReason as JSON to stdout.
// A decode error fails CLOSED (block) — an unverifiable Stop does not pass (KRD §82).
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		br := blockreason.For(blockreason.CodeGoalStillRed)
		writeBlock(stdout, &br)
		return exitBlock
	}
	d := Evaluate(ev)
	if d.Block {
		writeBlock(stdout, d.BlockReason)
		return exitBlock
	}
	return exitAllow
}

func writeBlock(w io.Writer, br *blockreason.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(br)
}

func main() { os.Exit(Run(os.Stdin, os.Stdout)) }
