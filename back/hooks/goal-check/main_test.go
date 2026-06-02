// Fault-injection + unit test for the Stop:goal-check hook (S29).
//
// Hook honesty (CLAUDE.md §5): a hook that never fires is dead. These tests BREAK what
// the gate watches — leave one red mirror in the red set, break a prior green, drop the
// mutation score, inject a monster — and assert the gate BLOCKS the close. They also pin
// the happy path (all four conditions hold ⇒ allow) and fail-closed on garbage.
package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// runHook feeds a JSON event to Run and returns the exit code + the decoded BlockReason
// (if any was written to stdout).
func runHook(t *testing.T, ev Event) (int, *blockreason.BlockReason) {
	t.Helper()
	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	var out bytes.Buffer
	code := Run(bytes.NewReader(b), &out)
	var br *blockreason.BlockReason
	if out.Len() > 0 {
		var decoded blockreason.BlockReason
		if err := json.Unmarshal(out.Bytes(), &decoded); err != nil {
			t.Fatalf("decode BlockReason: %v (out=%q)", err, out.String())
		}
		br = &decoded
	}
	return code, br
}

// TestHookAllowsCloseWhenAllFourConditionsHold — the happy path (red set green ∧ prior
// intact ∧ mutation ≥ floor ∧ no monster) ⇒ the close passes the gate (exit 0).
func TestHookAllowsCloseWhenAllFourConditionsHold(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "green"},
		PriorGreen:    "intact",
		Mutation:      0.9,
		MutationFloor: 0.8,
		Monsters:      nil,
	})
	if code != exitAllow {
		t.Fatalf("exit = %d, want %d (allow)", code, exitAllow)
	}
	if br != nil {
		t.Fatalf("no BlockReason expected on allow; got %+v", br)
	}
}

// TestHookBlocksCloseOnSurvivingRed — FAULT INJECTION: leave one mirror red ⇒ block.
func TestHookBlocksCloseOnSurvivingRed(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "red"},
		PriorGreen:    "intact",
		Mutation:      0.9,
		MutationFloor: 0.8,
	})
	assertBlocked(t, code, br)
}

// TestHookBlocksCloseOnBrokenPriorGreen — FAULT INJECTION: a regression on a prior truth
// ⇒ block (KRD §8: no close breaks a single existing green).
func TestHookBlocksCloseOnBrokenPriorGreen(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "green"},
		PriorGreen:    "broken",
		Mutation:      0.9,
		MutationFloor: 0.8,
	})
	assertBlocked(t, code, br)
}

// TestHookBlocksCloseOnLowMutation — FAULT INJECTION: mutation below the declared floor ⇒ block.
func TestHookBlocksCloseOnLowMutation(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "green"},
		PriorGreen:    "intact",
		Mutation:      0.4,
		MutationFloor: 0.8,
	})
	assertBlocked(t, code, br)
}

// TestHookBlocksCloseOnMonster — FAULT INJECTION: a monster present ⇒ block.
func TestHookBlocksCloseOnMonster(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "green"},
		PriorGreen:    "intact",
		Mutation:      0.9,
		MutationFloor: 0.8,
		Monsters:      []string{"orphan-mirror-X"},
	})
	assertBlocked(t, code, br)
}

// TestHookBlocksCloseOnMissingSensorVerdict — anti-passthrough: a red-set mirror with NO
// injected verdict counts as red ⇒ the gate cannot close on absent evidence.
func TestHookBlocksCloseOnMissingSensorVerdict(t *testing.T) {
	code, br := runHook(t, Event{
		RedSet:        []string{"Order.discount.fixture", "Order.total.fixture"},
		Sensors:       map[string]string{"Order.discount.fixture": "green"}, // total missing
		PriorGreen:    "intact",
		Mutation:      0.9,
		MutationFloor: 0.8,
	})
	assertBlocked(t, code, br)
}

// TestHookFailsClosedOnGarbage — an unparseable Stop event fails CLOSED (block), never a
// silent pass (KRD §82 anti-passthrough).
func TestHookFailsClosedOnGarbage(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader("{not json"), &out)
	if code != exitBlock {
		t.Fatalf("garbage event must fail closed (block); exit = %d", code)
	}
}

func assertBlocked(t *testing.T, code int, br *blockreason.BlockReason) {
	t.Helper()
	if code != exitBlock {
		t.Fatalf("exit = %d, want %d (block the close)", code, exitBlock)
	}
	if br == nil {
		t.Fatalf("a block must carry an actionable BlockReason")
	}
	if br.Code != blockreason.CodeGoalStillRed {
		t.Fatalf("block code = %q, want GOAL_STILL_RED", br.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("a BlockReason with an empty how_to_fix is a prison (forbidden)")
	}
}
