package autonomy_test

// Property mirror (∀) for the FK10 autonomy functions (ROADMAP-fke, FKE-11/34).
// reflects=kernel.autonomy · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (these are computational properties of the pure Enforce /
// PromotionFromHistory — the autonomy RULE itself is the human's, above the line, pinned by
// the fixture). Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants (FKE-11/34 + CLAUDE.md §2/§6/§8):
//
//  1. Enforce is FAIL-CLOSED and MONOTONE: required ≤ declared admits, required > declared
//     REFUSES with AGENT_AUTONOMY_EXCEEDED — for EVERY rung pair.
//  2. A8 NEVER governs a critical action: a critical action requiring A8 is always refused,
//     even for a declared A8 agent (the human-escalation ceiling A7).
//  3. Enforce is TOTAL and DETERMINISTIC (same input ⇒ same verdict).
//  4. The ladder is CLOSED: a level outside A0..A8 is fail-closed (refused / invalid).
//  5. PROMOTION IS A PURE FUNCTION OF THE HISTORY: an all-green E4+ no-incident window of ≥ N
//     promotes exactly current+1 (never past A8); ANY non-green / below-E4 / incident run in
//     the window withholds it; it is REPRODUCIBLE (same history ⇒ same level) — never declared.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/autonomy"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func drawLevel(rt *rapid.T, label string) autonomy.Level {
	return autonomy.Level(rapid.IntRange(0, 8).Draw(rt, label))
}

// Invariant 1+3: Enforce on a NON-critical action is exactly required ≤ declared, total and
// deterministic, and every refusal carries AGENT_AUTONOMY_EXCEEDED.
func TestEnforceFailClosedMonotone(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		declared := drawLevel(rt, "declared")
		required := drawLevel(rt, "required")
		act := autonomy.Action{Name: "op", Required: required, Critical: false}

		got := autonomy.Enforce(declared, act)
		want := required <= declared
		if got.Allowed != want {
			rt.Fatalf("Enforce(declared=%s, required=%s).Allowed = %v, want %v",
				declared, required, got.Allowed, want)
		}
		if !got.Allowed {
			if got.BlockReason == nil || got.BlockReason.Code != blockreason.CodeAgentAutonomyExceeded {
				rt.Fatalf("refusal must carry AGENT_AUTONOMY_EXCEEDED, got %+v", got.BlockReason)
			}
		}
		// Determinism: a second call yields a byte-identical verdict.
		again := autonomy.Enforce(declared, act)
		if again.Allowed != got.Allowed {
			rt.Fatalf("Enforce not deterministic: %v then %v", got.Allowed, again.Allowed)
		}
	})
}

// Invariant 2: a CRITICAL action requiring A8 is ALWAYS refused — even a declared-A8 agent is
// held to the A7 human-escalation ceiling.
func TestA8NeverOnCritical(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		declared := drawLevel(rt, "declared")
		crit := autonomy.Action{Name: "merge", Required: autonomy.A8, Critical: true}
		got := autonomy.Enforce(declared, crit)
		if got.Allowed {
			rt.Fatalf("A8-on-critical must be refused, declared=%s admitted it", declared)
		}
		if got.BlockReason == nil || got.BlockReason.Code != blockreason.CodeAgentAutonomyExceeded {
			rt.Fatalf("A8-on-critical refusal must carry AGENT_AUTONOMY_EXCEEDED, got %+v", got.BlockReason)
		}
	})
}

// Invariant 4: the ladder is CLOSED — a level outside A0..A8 is fail-closed.
func TestLadderClosed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bad := autonomy.Level(rapid.OneOf(
			rapid.IntRange(-1000, -1),
			rapid.IntRange(9, 1000),
		).Draw(rt, "bad"))
		if autonomy.IsKnownLevel(bad) {
			rt.Fatalf("IsKnownLevel(%d) must be false (closed ladder)", int(bad))
		}
		if autonomy.Validate(bad) == nil {
			rt.Fatalf("Validate(%d) must error (closed ladder)", int(bad))
		}
		// A declared out-of-ladder level can never admit any action (fail-closed).
		dec := autonomy.Enforce(bad, autonomy.Action{Name: "read", Required: autonomy.A0})
		if dec.Allowed {
			rt.Fatalf("Enforce with out-of-ladder declared=%d must refuse", int(bad))
		}
	})
}

// Invariant 5: PROMOTION is a pure function of the history. Build a window of N runs; the
// promotion is current+1 IFF all N are green at E≥E4 with no incident, never past A8, and is
// reproducible.
func TestPromotionIsPureFunctionOfHistory(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		current := drawLevel(rt, "current")
		n := rapid.IntRange(1, 6).Draw(rt, "n")
		policy := autonomy.PromotionPolicy{MinGreenRuns: n, MinEvidence: prooftype.E4}

		// Draw a history at least as long as the window, plus some leading noise.
		lead := rapid.IntRange(0, 4).Draw(rt, "lead")
		total := lead + n
		hist := make([]autonomy.RunOutcome, total)
		allClean := true
		for i := 0; i < total; i++ {
			green := rapid.Bool().Draw(rt, "green")
			ev := prooftype.ELevel(rapid.IntRange(0, 7).Draw(rt, "ev"))
			inc := rapid.Bool().Draw(rt, "inc")
			hist[i] = autonomy.RunOutcome{Green: green, Evidence: ev, Incident: inc}
			// Only the LAST n entries (the window) decide the verdict.
			if i >= total-n {
				if !green || ev < prooftype.E4 || inc {
					allClean = false
				}
			}
		}

		got := autonomy.PromotionFromHistory(current, hist, policy)
		var want autonomy.Level
		switch {
		case current >= autonomy.A8:
			want = current
		case allClean:
			want = current + 1
		default:
			want = current
		}
		if got != want {
			rt.Fatalf("PromotionFromHistory(current=%s, n=%d, allClean=%v) = %s, want %s",
				current, n, allClean, got, want)
		}
		// Reproducible: a second call yields the same level (never declared, always computed).
		again := autonomy.PromotionFromHistory(current, hist, policy)
		if again != got {
			rt.Fatalf("PromotionFromHistory not deterministic: %s then %s", got, again)
		}
		// Never past A8.
		if !autonomy.IsKnownLevel(got) {
			rt.Fatalf("promoted level %s escaped the ladder", got)
		}
	})
}

// A history strictly SHORTER than the window can never promote (not enough record).
func TestPromotionNeedsFullWindow(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		current := autonomy.Level(rapid.IntRange(0, 7).Draw(rt, "current"))
		n := rapid.IntRange(2, 6).Draw(rt, "n")
		short := rapid.IntRange(0, n-1).Draw(rt, "short")
		hist := make([]autonomy.RunOutcome, short)
		for i := range hist {
			hist[i] = autonomy.RunOutcome{Green: true, Evidence: prooftype.E7, Incident: false}
		}
		got := autonomy.PromotionFromHistory(current, hist, autonomy.PromotionPolicy{MinGreenRuns: n, MinEvidence: prooftype.E4})
		if got != current {
			rt.Fatalf("a history of %d < window %d must not promote; current=%s got=%s", short, n, current, got)
		}
	})
}
